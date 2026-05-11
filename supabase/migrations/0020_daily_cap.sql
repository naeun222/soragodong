-- ============================================================
-- 소라고동 V4 — 0020 Daily Cap (사용자 명시 2026-04-30 / 2026-05-12 ultrathink)
--
-- 목적: 일일 cap 적용 (pricing_redesign.md v2 디자인).
--   Light:          monthly $5  → daily $0.20  (월×1.2/30, /25 비율)
--   Premium:        monthly $13 → daily $0.75  (월×1.5/30, /20 비율)
--   Early lifetime: monthly $2.2 → daily $0.20
--   Guest:          monthly $0.30 (1년) — daily cap 없음 (NULL → 가드 skip)
--
-- 사용자 명시 2026-05-12: batch path (chat-batch.ts) 는 monthly cap 만 차감. 일일 cap = user-trigger path (chat.ts) 에서만 consume_daily_atomic 호출.
-- 사용자 명시 2026-05-12: paid 사용자 첫인상 충격 완화 — Grace 7일 (cap × 1.5). daily_cap_grace_until > NOW() 이면 effective cap = base × 1.5.
--
-- 변경:
--   1) soragodong_billing 에 컬럼 3개 추가
--   2) 기존 사용자 grace 7일 박기 (적용 시점 = now())
--   3) consume_daily_atomic RPC — atomic, race-safe, 24h reset 자동, grace 분기
--
-- 실행: Supabase Dashboard → SQL Editor → 붙여넣기 → Run
-- 멱등 (ADD COLUMN IF NOT EXISTS + CREATE OR REPLACE)
-- ============================================================

-- 1. 컬럼 추가
ALTER TABLE soragodong_billing
  ADD COLUMN IF NOT EXISTS daily_quota_used NUMERIC(12,6) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS daily_quota_reset_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '1 day'),
  ADD COLUMN IF NOT EXISTS daily_cap_grace_until TIMESTAMPTZ;

COMMENT ON COLUMN soragodong_billing.daily_quota_used IS '오늘 누적 사용액 USD (consume_daily_atomic 으로만 갱신). reset_at 지나면 0 으로 재설정.';
COMMENT ON COLUMN soragodong_billing.daily_quota_reset_at IS '다음 24h reset 시각. 그 이전엔 daily_quota_used 누적. 지나면 used=0, reset_at = now + 1day.';
COMMENT ON COLUMN soragodong_billing.daily_cap_grace_until IS 'paid 사용자 첫 7일 grace period 종료 시각. NOW() 이전이면 일일 cap × 1.5 적용. NULL = grace 미적용 (옛 사용자 또는 적용 X).';

-- 2. 기존 사용자 grace 7일 박기 — 이미 박힌 사용자 (NULL 아님) 는 그대로.
UPDATE soragodong_billing
  SET daily_cap_grace_until = NOW() + INTERVAL '7 days'
  WHERE daily_cap_grace_until IS NULL;

-- 3. RPC — consume_daily_atomic
--   input: p_user_id, p_amount_usd (이번 호출 비용), p_daily_cap_usd (TIER_PLANS[plan].daily_cap_usd)
--   동작:
--     - p_daily_cap_usd IS NULL → skip (guest 등) → return {ok:true, skipped:true}
--     - FOR UPDATE row lock
--     - reset_at 지났으면 used=0, reset_at = now + 1day
--     - daily_cap_grace_until > now 면 effective_cap = base × 1.5, else base
--     - used + amount > effective_cap → return {ok:false, daily_cap_reached:true, reset_at, effective_cap, used, in_grace}
--     - 통과 → used += amount → return {ok:true, used, daily_remaining, reset_at, in_grace, effective_cap}
CREATE OR REPLACE FUNCTION consume_daily_atomic(
  p_user_id UUID,
  p_amount_usd NUMERIC,
  p_daily_cap_usd NUMERIC
) RETURNS JSONB AS $$
DECLARE
  v_billing soragodong_billing%ROWTYPE;
  v_now TIMESTAMPTZ := NOW();
  v_effective_cap NUMERIC;
  v_in_grace BOOLEAN := false;
  v_new_used NUMERIC;
BEGIN
  -- guest 등 daily cap 없는 plan = skip (monthly cap 만 동작)
  IF p_daily_cap_usd IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'skipped', true, 'reason', 'no_daily_cap');
  END IF;

  IF p_amount_usd < 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'amount < 0');
  END IF;

  -- row lock 후 조회
  SELECT * INTO v_billing
    FROM soragodong_billing
    WHERE user_id = p_user_id
    FOR UPDATE;

  IF NOT FOUND THEN
    -- billing row 없음 = 가드 통과 (ensureBillingRow 가 다음 호출에서 만듦). consume 안 함.
    RETURN jsonb_build_object('ok', true, 'skipped', true, 'reason', 'no_billing_row');
  END IF;

  -- reset_at 지났으면 reset
  IF v_billing.daily_quota_reset_at IS NULL OR v_billing.daily_quota_reset_at <= v_now THEN
    UPDATE soragodong_billing
      SET daily_quota_used = 0,
          daily_quota_reset_at = v_now + INTERVAL '1 day'
      WHERE user_id = p_user_id;
    v_billing.daily_quota_used := 0;
    v_billing.daily_quota_reset_at := v_now + INTERVAL '1 day';
  END IF;

  -- grace 분기
  IF v_billing.daily_cap_grace_until IS NOT NULL AND v_billing.daily_cap_grace_until > v_now THEN
    v_effective_cap := p_daily_cap_usd * 1.5;
    v_in_grace := true;
  ELSE
    v_effective_cap := p_daily_cap_usd;
  END IF;

  -- cap 검사
  v_new_used := v_billing.daily_quota_used + p_amount_usd;
  IF v_new_used > v_effective_cap THEN
    RETURN jsonb_build_object(
      'ok', false,
      'daily_cap_reached', true,
      'reset_at', v_billing.daily_quota_reset_at,
      'effective_cap', v_effective_cap,
      'base_cap', p_daily_cap_usd,
      'used', v_billing.daily_quota_used,
      'in_grace', v_in_grace
    );
  END IF;

  -- consume
  UPDATE soragodong_billing
    SET daily_quota_used = v_new_used
    WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'ok', true,
    'used', v_new_used,
    'daily_remaining', v_effective_cap - v_new_used,
    'reset_at', v_billing.daily_quota_reset_at,
    'effective_cap', v_effective_cap,
    'base_cap', p_daily_cap_usd,
    'in_grace', v_in_grace
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION consume_daily_atomic IS '2026-05-12: 일일 cap 차감 atomic RPC. user-trigger path (chat.ts) 에서만 호출. batch path 는 skip (monthly cap 만). grace 7일 동안 cap × 1.5.';

-- ============================================================
-- 4. deduct_credit_atomic 갱신 — 사용자 명시 2026-05-12 ultrathink: 한달 한도 폐기.
--    옛 (0004): subscription_active 면 monthly_quota_usd 대비 사용 검사 + 초과분 credit overflow.
--    신 (0020): subscription_active 면 monthly_token_used 누적만 (통계용). monthly cap 가드 X — 차단은 일일 cap (consume_daily_atomic) 으로만.
--    비구독 (subscription_active=false): credit_balance_usd 차감 흐름 그대로 (환영 토큰 / 옛 사용자 잔액).
-- ============================================================
CREATE OR REPLACE FUNCTION deduct_credit_atomic(
  p_user_id UUID,
  p_cost_usd NUMERIC
) RETURNS JSONB AS $$
DECLARE
  v_billing soragodong_billing%ROWTYPE;
  v_subscription_active BOOLEAN;
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
    -- 한 달 한도 폐기 — monthly_token_used 통계 누적만. cap 가드 X.
    UPDATE soragodong_billing
      SET monthly_token_used = monthly_token_used + (p_cost_usd * 1000000)::BIGINT
      WHERE user_id = p_user_id;
    RETURN jsonb_build_object('ok', true, 'mode', 'subscription', 'cap_reached', false);
  ELSE
    -- 비구독: credit_balance_usd 에서 직접 차감 (환영 토큰 / 옛 사용자 잔액)
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

COMMENT ON FUNCTION deduct_credit_atomic IS '2026-05-12: monthly cap 가드 폐기. subscription_active 면 monthly_token_used 누적만 (통계). 차단은 일일 cap (consume_daily_atomic) 으로만.';

-- ============================================================
-- 검증:
-- SELECT user_id, daily_quota_used, daily_quota_reset_at, daily_cap_grace_until
--   FROM soragodong_billing LIMIT 5;
--
-- -- guest skip 확인
-- SELECT consume_daily_atomic('<test-uuid>', 0.05, NULL);
-- → {"ok": true, "skipped": true, "reason": "no_daily_cap"}
--
-- -- grace 통과
-- SELECT consume_daily_atomic('<test-uuid>', 0.05, 0.20);
-- → {"ok": true, "used": 0.05, "daily_remaining": 0.25, "in_grace": true, "effective_cap": 0.30, ...}
--
-- -- cap 도달
-- SELECT consume_daily_atomic('<test-uuid>', 0.30, 0.20);
-- → {"ok": false, "daily_cap_reached": true, ...}
-- ============================================================
