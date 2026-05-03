-- ============================================================
-- 소라고동 V4 — Phase C 활성 (앱 결제 모델)
-- 사용자 요청 2026-04-30: 무료 충전 토큰 + 월 정액 + 충전식 + 포트원 자동 환불
-- 실행 방법: Supabase Dashboard → SQL Editor → 붙여넣기 → Run
-- 멱등 (이미 적용돼 있어도 안전)
-- ============================================================

-- ============================================================
-- 1. soragodong_billing — 사용자 결제·잔액 정보
-- ============================================================
CREATE TABLE IF NOT EXISTS soragodong_billing (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  -- 충전 잔액 (USD, 6자리 정밀)
  credit_balance_usd NUMERIC(12, 6) NOT NULL DEFAULT 0,
  -- 월 정액 활성 여부 + 만료
  subscription_active BOOLEAN NOT NULL DEFAULT FALSE,
  subscription_expires_at TIMESTAMPTZ,
  subscription_plan TEXT,                          -- 'monthly_basic' / 'monthly_plus' 등
  -- 월 정액 토큰 한도 (null = 무제한, 그 외 토큰 수)
  monthly_token_quota BIGINT,
  monthly_token_used BIGINT NOT NULL DEFAULT 0,
  monthly_period_started_at TIMESTAMPTZ,
  -- 무료 충전 토큰 (가입 시 1회 지급)
  free_credit_granted BOOLEAN NOT NULL DEFAULT FALSE,
  free_credit_amount_usd NUMERIC(12, 6) DEFAULT 0,
  free_credit_granted_at TIMESTAMPTZ,
  -- 메타
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- updated_at 자동 갱신 trigger
CREATE OR REPLACE FUNCTION update_billing_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS billing_updated_at ON soragodong_billing;
CREATE TRIGGER billing_updated_at
  BEFORE UPDATE ON soragodong_billing
  FOR EACH ROW EXECUTE FUNCTION update_billing_updated_at();

-- RLS — 본인 row만 SELECT. INSERT/UPDATE/DELETE는 service_role만 (백엔드).
ALTER TABLE soragodong_billing ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users read own billing" ON soragodong_billing;
CREATE POLICY "users read own billing"
  ON soragodong_billing FOR SELECT
  USING (auth.uid() = user_id);

-- ============================================================
-- 2. soragodong_usage — 사용량 logging (모든 LLM call 기록)
-- ============================================================
CREATE TABLE IF NOT EXISTS soragodong_usage (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,                          -- 'chat' / 'topic_extract' / ...
  model TEXT NOT NULL,                             -- 'claude-sonnet-4-6' 등
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens INTEGER DEFAULT 0,
  cache_creation_tokens INTEGER DEFAULT 0,
  cost_usd NUMERIC(12, 6) NOT NULL DEFAULT 0,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usage_user_recorded ON soragodong_usage(user_id, recorded_at DESC);

-- RLS — 본인 row만 SELECT. INSERT는 service_role만.
ALTER TABLE soragodong_usage ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users read own usage" ON soragodong_usage;
CREATE POLICY "users read own usage"
  ON soragodong_usage FOR SELECT
  USING (auth.uid() = user_id);

-- ============================================================
-- 3. soragodong_payments — 결제 history (전자상거래법 5년 보존)
-- ============================================================
CREATE TABLE IF NOT EXISTS soragodong_payments (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL,                           -- 회원 탈퇴 후에도 보존 (NO CASCADE)
  user_email TEXT,                                 -- 익명화 후 보존용
  payment_type TEXT NOT NULL,                      -- 'charge' / 'subscribe' / 'refund'
  amount_krw INTEGER NOT NULL,                     -- 원
  amount_credit_usd NUMERIC(12, 6),                -- 충전 시 USD 환산
  portone_imp_uid TEXT UNIQUE,                     -- 포트원 결제 고유 ID
  portone_merchant_uid TEXT,                       -- 가맹점 주문 ID
  status TEXT NOT NULL,                            -- 'pending' / 'paid' / 'cancelled' / 'refunded' / 'failed'
  refund_amount_krw INTEGER DEFAULT 0,
  refunded_at TIMESTAMPTZ,
  refund_reason TEXT,
  raw_response JSONB,                              -- 포트원 응답 원본
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_user ON soragodong_payments(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_status ON soragodong_payments(status);

-- RLS — 본인 결제만 SELECT.
ALTER TABLE soragodong_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users read own payments" ON soragodong_payments;
CREATE POLICY "users read own payments"
  ON soragodong_payments FOR SELECT
  USING (auth.uid() = user_id);

-- ============================================================
-- 4. 잔액 차감 RPC (atomic, race condition 회피)
-- ============================================================
CREATE OR REPLACE FUNCTION deduct_credit_atomic(
  p_user_id UUID,
  p_cost_usd NUMERIC
) RETURNS JSONB AS $$
DECLARE
  v_billing soragodong_billing%ROWTYPE;
  v_subscription_active BOOLEAN;
BEGIN
  -- row lock for atomic update
  SELECT * INTO v_billing
  FROM soragodong_billing
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'billing row 없음');
  END IF;

  v_subscription_active := v_billing.subscription_active
    AND v_billing.subscription_expires_at IS NOT NULL
    AND v_billing.subscription_expires_at > NOW();

  IF v_subscription_active THEN
    -- 월 정액: 토큰 사용량만 누적
    UPDATE soragodong_billing
    SET monthly_token_used = monthly_token_used + (p_cost_usd * 1000000)::BIGINT
    WHERE user_id = p_user_id;
    RETURN jsonb_build_object('ok', true, 'mode', 'subscription');
  ELSE
    -- 충전: 잔액 차감 (음수 방지)
    UPDATE soragodong_billing
    SET credit_balance_usd = GREATEST(0, credit_balance_usd - p_cost_usd)
    WHERE user_id = p_user_id;
    RETURN jsonb_build_object('ok', true, 'mode', 'credit', 'remaining', GREATEST(0, v_billing.credit_balance_usd - p_cost_usd));
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 5. 회원 탈퇴 시 데이터 삭제 RPC (전자상거래법 보존 항목 외)
-- ============================================================
CREATE OR REPLACE FUNCTION withdraw_user_data(p_user_id UUID) RETURNS JSONB AS $$
BEGIN
  -- 자기관찰 데이터 즉시 삭제
  DELETE FROM soragodong_data WHERE auth_user_id::TEXT = p_user_id::TEXT;
  -- billing row 삭제 (잔여 충전 잔액은 환불 후 0으로 만든 상태여야)
  DELETE FROM soragodong_billing WHERE user_id = p_user_id;
  -- usage 로그 삭제 (이용 로그 3개월 — 익명화 가능, 일단 삭제 정책)
  DELETE FROM soragodong_usage WHERE user_id = p_user_id;
  -- payments — 전자상거래법 5년 보존 (user_email로 익명화)
  UPDATE soragodong_payments
  SET user_email = '[withdrawn-' || EXTRACT(EPOCH FROM NOW())::TEXT || ']'
  WHERE user_id = p_user_id;
  RETURN jsonb_build_object('ok', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 검증 쿼리 (실행 후 정상 확인용)
-- ============================================================
-- SELECT tablename, policyname, cmd FROM pg_policies WHERE tablename LIKE 'soragodong%' ORDER BY tablename;
-- SELECT relname, relrowsecurity FROM pg_class WHERE relname LIKE 'soragodong%';
