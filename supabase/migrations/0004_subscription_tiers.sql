-- ============================================================
-- 소라고동 V4 — 0004 Subscription Tiers (사용자 명시 2026-04-30 ultrathink)
--
-- 충전 plan 폐기 → 2-tier 월정액 only:
--   Light    8,900원 / 월 / cap $5  ($5 어치 API)
--   Premium 25,000원 / 월 / cap $15 ($15 어치 API)
-- + Overage pack: Light 5K = +$4 / Premium 7K = +$5 (credit_balance_usd 에 합쳐짐)
--
-- 기존 charge 잔액 (credit_balance_usd > 0) 사용자: legacy 호환 — 0 도달까지 차감 후 구독 안내.
-- 신규 무료 토큰 4,000원 ($2.86) 도 기존대로 credit_balance_usd 에 들어감.
--
-- subscription_plan 값:
--   NULL          = 비구독 (free credit 또는 legacy charge 잔액 사용)
--   'light'       = Light tier
--   'premium'     = Premium tier
--   (옛 'monthly_basic' / 'monthly_plus' 는 NULL 로 마이그레이션 — 자연 만료 후 재구독)
--
-- 실행 방법: Supabase Dashboard → SQL Editor → 붙여넣기 → Run
-- 멱등 (이미 적용돼 있어도 안전)
-- ============================================================

-- ============================================================
-- 1. Tier 별 cap (USD) 컬럼 추가
-- ============================================================
ALTER TABLE soragodong_billing
  ADD COLUMN IF NOT EXISTS monthly_quota_usd NUMERIC(12, 6) DEFAULT 0;

COMMENT ON COLUMN soragodong_billing.monthly_quota_usd IS 'subscription tier 한도 (USD). Light: 5, Premium: 15. monthly_token_used (micro-USD) 와 비교해서 cap 도달 여부 판정.';

-- ============================================================
-- 2. 옛 plan 값 정리 (monthly_basic / monthly_plus → NULL)
--    구독 활성 상태였더라도 새 tier 체계로 재가입 받기 위해 cycle 만료 처리.
-- ============================================================
UPDATE soragodong_billing
SET subscription_active = FALSE,
    subscription_plan = NULL,
    monthly_quota_usd = 0
WHERE subscription_plan IN ('monthly_basic', 'monthly_plus');

-- ============================================================
-- 3. 새 tier 체크 제약 (light / premium / NULL 만 허용)
--    DROP IF EXISTS 후 ADD — 멱등.
-- ============================================================
ALTER TABLE soragodong_billing
  DROP CONSTRAINT IF EXISTS soragodong_billing_plan_check;

ALTER TABLE soragodong_billing
  ADD CONSTRAINT soragodong_billing_plan_check
  CHECK (subscription_plan IS NULL OR subscription_plan IN ('light', 'premium'));

-- ============================================================
-- 4. checkBudget 보조 RPC: tier 사용량 vs cap 빠르게 조회
--    (선택 — backend 에서 직접 SELECT 해도 됨. 기록용)
-- ============================================================
CREATE OR REPLACE FUNCTION get_subscription_status(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_billing soragodong_billing%ROWTYPE;
  v_used_usd NUMERIC;
  v_quota_usd NUMERIC;
  v_remaining_usd NUMERIC;
  v_active BOOLEAN;
BEGIN
  SELECT * INTO v_billing FROM soragodong_billing WHERE user_id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  v_active := v_billing.subscription_active
    AND v_billing.subscription_expires_at IS NOT NULL
    AND v_billing.subscription_expires_at > NOW();

  v_used_usd := COALESCE(v_billing.monthly_token_used, 0)::NUMERIC / 1000000;
  v_quota_usd := COALESCE(v_billing.monthly_quota_usd, 0);
  v_remaining_usd := GREATEST(0, v_quota_usd - v_used_usd);

  RETURN jsonb_build_object(
    'found', true,
    'subscription_active', v_active,
    'subscription_plan', v_billing.subscription_plan,
    'subscription_expires_at', v_billing.subscription_expires_at,
    'monthly_quota_usd', v_quota_usd,
    'monthly_used_usd', v_used_usd,
    'monthly_remaining_usd', v_remaining_usd,
    'credit_balance_usd', v_billing.credit_balance_usd
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 5. deduct_credit_atomic — tier cap 도달 시 credit_balance_usd 로 fall-through 추가.
--    기존: subscription_active 면 monthly_token_used 만 누적.
--    신규: subscription_active 라도 cap 초과분은 credit_balance_usd 에서 차감 (overage pack 또는 잔여 free credit).
-- ============================================================
CREATE OR REPLACE FUNCTION deduct_credit_atomic(
  p_user_id UUID,
  p_cost_usd NUMERIC
) RETURNS JSONB AS $$
DECLARE
  v_billing soragodong_billing%ROWTYPE;
  v_subscription_active BOOLEAN;
  v_used_usd NUMERIC;
  v_quota_usd NUMERIC;
  v_remaining_quota_usd NUMERIC;
  v_within_quota_usd NUMERIC;
  v_overflow_usd NUMERIC;
BEGIN
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
    v_used_usd := COALESCE(v_billing.monthly_token_used, 0)::NUMERIC / 1000000;
    v_quota_usd := COALESCE(v_billing.monthly_quota_usd, 0);
    v_remaining_quota_usd := GREATEST(0, v_quota_usd - v_used_usd);

    IF p_cost_usd <= v_remaining_quota_usd THEN
      -- cap 안 — monthly_token_used 만 누적
      UPDATE soragodong_billing
      SET monthly_token_used = monthly_token_used + (p_cost_usd * 1000000)::BIGINT
      WHERE user_id = p_user_id;
      RETURN jsonb_build_object('ok', true, 'mode', 'subscription', 'cap_reached', false);
    ELSE
      -- cap 도달 — quota 분 만 누적, overflow 는 credit_balance_usd 에서 차감
      v_within_quota_usd := v_remaining_quota_usd;
      v_overflow_usd := p_cost_usd - v_within_quota_usd;
      UPDATE soragodong_billing
      SET monthly_token_used = monthly_token_used + (v_within_quota_usd * 1000000)::BIGINT,
          credit_balance_usd = GREATEST(0, credit_balance_usd - v_overflow_usd)
      WHERE user_id = p_user_id;
      RETURN jsonb_build_object(
        'ok', true,
        'mode', 'subscription_overage',
        'cap_reached', true,
        'overflow_usd', v_overflow_usd,
        'remaining_credit_usd', GREATEST(0, v_billing.credit_balance_usd - v_overflow_usd)
      );
    END IF;
  ELSE
    -- 비구독: credit_balance_usd 에서 직접 차감 (legacy charge 잔액 또는 free credit)
    UPDATE soragodong_billing
    SET credit_balance_usd = GREATEST(0, credit_balance_usd - p_cost_usd)
    WHERE user_id = p_user_id;
    RETURN jsonb_build_object(
      'ok', true,
      'mode', 'credit',
      'remaining_credit_usd', GREATEST(0, v_billing.credit_balance_usd - p_cost_usd)
    );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 검증 쿼리
-- ============================================================
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'soragodong_billing';
-- SELECT subscription_plan, COUNT(*) FROM soragodong_billing GROUP BY subscription_plan;
