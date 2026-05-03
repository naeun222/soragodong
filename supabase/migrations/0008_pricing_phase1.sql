-- ============================================================
-- 소라고동 V4 — 0008 Pricing Phase 1 (사용자 명시 2026-05-02 ultrathink)
--
-- 변경 요약:
--   1) 얼리 유저 plan 신설 (early_user flag, early_light tier)
--   2) 환영 선물 토큰 잔량 컬럼 (welcome_bonus_tokens_remaining + 만료)
--   3) Opus 일일 사용 카운터 (Premium 전용, 30번 한도)
--   4) subscription_plan CHECK 갱신 (early_light 추가)
--   5) deduct_credit_atomic RPC 갱신 (early_light tier 호환)
--   6) 모든 현재 사용자 = early_user=true 일괄 처리 (출시 전이라 모두 얼리)
--
-- 가격 변경 (코드 측만, schema 영향 X):
--   Light  8,900원/cap $5  → 9,900원/cap $5 유지
--   Premium 25,000원/cap $15 → 25,000원/cap $13
--   early_light 4,900원/cap $4 신설
--
-- 실행 방법: Supabase Dashboard → SQL Editor → 붙여넣기 → Run
-- 멱등 (이미 적용돼 있어도 안전 — 모든 ALTER IF NOT EXISTS / CREATE OR REPLACE)
-- ============================================================

-- ============================================================
-- 1. 얼리 유저 컬럼
-- ============================================================
ALTER TABLE soragodong_billing
  ADD COLUMN IF NOT EXISTS early_user BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS early_user_granted_at TIMESTAMPTZ;

COMMENT ON COLUMN soragodong_billing.early_user IS '얼리 유저 (출시 전 가입자) — 평생 4,900원 cap $4 자격. 출시 시점에 cutoff 박제.';

-- ============================================================
-- 2. 환영 선물 토큰 컬럼 (정확한 카운트)
-- ============================================================
ALTER TABLE soragodong_billing
  ADD COLUMN IF NOT EXISTS welcome_bonus_tokens_remaining BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS welcome_bonus_total_granted    BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS welcome_bonus_granted_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS welcome_bonus_expires_at  TIMESTAMPTZ;

COMMENT ON COLUMN soragodong_billing.welcome_bonus_tokens_remaining IS '환영 선물 잔여 토큰 (input + output + cache 합산 카운트). chat 차감 시 우선 소진.';

-- ============================================================
-- 3. Opus 일일 카운터 (Premium 전용 30번 한도, 새벽 4시 KST 리셋)
-- ============================================================
ALTER TABLE soragodong_billing
  ADD COLUMN IF NOT EXISTS opus_daily_used     INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS opus_daily_reset_at TIMESTAMPTZ;

COMMENT ON COLUMN soragodong_billing.opus_daily_used IS 'Opus 4.7 모델 오늘 사용 횟수 (Premium 한도 30). KST 새벽 4시 리셋.';

-- ============================================================
-- 4. subscription_plan CHECK 갱신 (early_light 추가)
-- ============================================================
ALTER TABLE soragodong_billing
  DROP CONSTRAINT IF EXISTS soragodong_billing_plan_check;

ALTER TABLE soragodong_billing
  ADD CONSTRAINT soragodong_billing_plan_check
  CHECK (subscription_plan IS NULL OR subscription_plan IN ('light', 'premium', 'early_light'));

-- ============================================================
-- 5. 모든 현재 사용자 = early_user=true 일괄 처리
--    (사용자 명시 2026-05-02 ultrathink: 출시일 박제 전까지 모든 가입자 = 얼리.
--     출시 시점에 컷오프 SQL 따로 실행해서 그 이후 가입자만 early_user=false 박을 예정.)
-- ============================================================
UPDATE soragodong_billing
SET early_user = TRUE,
    early_user_granted_at = COALESCE(early_user_granted_at, NOW())
WHERE early_user = FALSE;

-- ============================================================
-- 6. grant_welcome_bonus_atomic RPC (튜토리얼 완주 hook 호출)
--    idempotent — welcome_bonus_total_granted > 0 이면 already_granted 응답.
-- ============================================================
CREATE OR REPLACE FUNCTION grant_welcome_bonus_atomic(
  p_user_id UUID,
  p_tokens BIGINT DEFAULT 1000000,
  p_expires_days INT DEFAULT 30
) RETURNS JSONB AS $$
DECLARE
  v_now TIMESTAMPTZ := NOW();
  v_expires TIMESTAMPTZ := v_now + (p_expires_days || ' days')::INTERVAL;
  v_already BOOLEAN;
BEGIN
  SELECT (welcome_bonus_total_granted > 0) INTO v_already
  FROM soragodong_billing
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'billing row 없음');
  END IF;

  IF v_already THEN
    RETURN jsonb_build_object('ok', true, 'already_granted', true);
  END IF;

  UPDATE soragodong_billing
  SET welcome_bonus_tokens_remaining = p_tokens,
      welcome_bonus_total_granted    = p_tokens,
      welcome_bonus_granted_at  = v_now,
      welcome_bonus_expires_at  = v_expires,
      free_credit_granted = TRUE  -- 옛 flag 도 같이 두고 신구 호환
  WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'ok', true,
    'granted', true,
    'tokens', p_tokens,
    'expires_at', v_expires
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 7. consume_welcome_bonus_atomic RPC (chat 차감 시 우선 소진)
--    chat 호출 → 합산 토큰 만큼 차감, overflow 분 반환 (caller 가 다음 우선순위로 차감).
--    만료 도달 시 잔량 0 으로 정리 + overflow=p_tokens 반환.
-- ============================================================
CREATE OR REPLACE FUNCTION consume_welcome_bonus_atomic(
  p_user_id UUID,
  p_tokens BIGINT
) RETURNS JSONB AS $$
DECLARE
  v_remaining BIGINT;
  v_expires TIMESTAMPTZ;
  v_consumed BIGINT;
  v_overflow BIGINT;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  SELECT welcome_bonus_tokens_remaining, welcome_bonus_expires_at
    INTO v_remaining, v_expires
  FROM soragodong_billing
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'billing row 없음');
  END IF;

  -- 만료 처리 (lazy)
  IF v_expires IS NOT NULL AND v_expires < v_now AND v_remaining > 0 THEN
    UPDATE soragodong_billing
    SET welcome_bonus_tokens_remaining = 0
    WHERE user_id = p_user_id;
    RETURN jsonb_build_object('ok', true, 'consumed', 0, 'overflow', p_tokens, 'expired', true);
  END IF;

  IF v_remaining <= 0 THEN
    RETURN jsonb_build_object('ok', true, 'consumed', 0, 'overflow', p_tokens);
  END IF;

  v_consumed := LEAST(p_tokens, v_remaining);
  v_overflow := p_tokens - v_consumed;

  UPDATE soragodong_billing
  SET welcome_bonus_tokens_remaining = welcome_bonus_tokens_remaining - v_consumed
  WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'ok', true,
    'consumed', v_consumed,
    'overflow', v_overflow,
    'remaining', v_remaining - v_consumed
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 8. reset_opus_daily_if_needed RPC (KST 새벽 4시 cutoff 기준)
-- ============================================================
CREATE OR REPLACE FUNCTION reset_opus_daily_if_needed(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_last TIMESTAMPTZ;
  v_now TIMESTAMPTZ := NOW();
  v_kst_now TIMESTAMP;
  v_cutoff TIMESTAMPTZ;
BEGIN
  -- KST = UTC+9. 가장 최근 KST 새벽 4시 = cutoff.
  v_kst_now := (v_now AT TIME ZONE 'Asia/Seoul')::TIMESTAMP;
  v_cutoff := (DATE_TRUNC('day', v_kst_now) + INTERVAL '4 hours') AT TIME ZONE 'Asia/Seoul';

  -- KST 4시 이전 시각 = cutoff = 어제 KST 4시
  IF v_kst_now < (DATE_TRUNC('day', v_kst_now) + INTERVAL '4 hours')::TIMESTAMP THEN
    v_cutoff := v_cutoff - INTERVAL '1 day';
  END IF;

  SELECT opus_daily_reset_at INTO v_last
  FROM soragodong_billing
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false);
  END IF;

  IF v_last IS NULL OR v_last < v_cutoff THEN
    UPDATE soragodong_billing
    SET opus_daily_used = 0,
        opus_daily_reset_at = v_now
    WHERE user_id = p_user_id;
    RETURN jsonb_build_object('ok', true, 'reset', true);
  END IF;

  RETURN jsonb_build_object('ok', true, 'reset', false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 9. consume_opus_daily_atomic RPC (Opus 호출 시 일일 한도 + increment)
-- ============================================================
CREATE OR REPLACE FUNCTION consume_opus_daily_atomic(
  p_user_id UUID,
  p_limit INT DEFAULT 30
) RETURNS JSONB AS $$
DECLARE
  v_used INT;
BEGIN
  PERFORM reset_opus_daily_if_needed(p_user_id);

  SELECT opus_daily_used INTO v_used
  FROM soragodong_billing
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'billing row 없음');
  END IF;

  IF v_used >= p_limit THEN
    RETURN jsonb_build_object('ok', false, 'limit_reached', true, 'used', v_used, 'limit', p_limit);
  END IF;

  UPDATE soragodong_billing
  SET opus_daily_used = opus_daily_used + 1
  WHERE user_id = p_user_id;

  RETURN jsonb_build_object('ok', true, 'used', v_used + 1, 'remaining', p_limit - v_used - 1, 'limit', p_limit);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 10. deduct_credit_atomic 갱신 (early_light tier 호환)
--     기존 0004 RPC = subscription 활성 시 monthly_token_used 누적 + cap 도달 시 credit_balance_usd fall-through.
--     0008 = 동작 동일. early_light 도 동일 흐름 (cap=$4, fall-through 시 credit_balance_usd 차감).
--     단 명시적으로 plan 분기 X — monthly_quota_usd 만 보면 됨 (subscribe.ts 가 plan 별 quota set 책임).
--     이 RPC = welcome_bonus 차감 X — caller (chat.ts) 가 consume_welcome_bonus_atomic 먼저 호출 후 overflow 만 넘김.
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
-- 검증 쿼리 (실행 후 확인용)
-- ============================================================
-- SELECT column_name, data_type
--   FROM information_schema.columns
--   WHERE table_name = 'soragodong_billing'
--     AND column_name IN ('early_user', 'welcome_bonus_tokens_remaining', 'welcome_bonus_expires_at', 'opus_daily_used', 'opus_daily_reset_at');
--
-- SELECT COUNT(*) FROM soragodong_billing WHERE early_user = TRUE;
-- SELECT subscription_plan, COUNT(*) FROM soragodong_billing GROUP BY subscription_plan;
--
-- SELECT routine_name FROM information_schema.routines
--   WHERE routine_schema = 'public'
--     AND routine_name IN ('grant_welcome_bonus_atomic', 'consume_welcome_bonus_atomic', 'reset_opus_daily_if_needed', 'consume_opus_daily_atomic', 'deduct_credit_atomic');
