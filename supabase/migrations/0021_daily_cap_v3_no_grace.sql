-- ============================================================
-- 소라고동 V4 — 0021 Daily Cap v3 (사용자 명시 2026-05-12 ultrathink)
--
-- v2 (0020) → v3 변경:
--   - Grace 7일 (cap × 1.5) 폐기 — cap 자체 적정화로 충격 완화 대체.
--   - Plus daily cap 0.20 → 0.30 (sources: TIER_PLANS in billing.ts).
--   - 결제 시점 daily_quota_used = 0 reset — 각 결제 endpoint (portone-verify-pay / register-trial / register-recurring / claim-free-trial / upgrade-tier / cron-charge-recurring) 의 row UPDATE 에 컬럼 추가.
--
-- 변경:
--   1) consume_daily_atomic RPC 갱신 — grace 분기 제거 (effective_cap = base cap).
--   2) daily_cap_grace_until 컬럼은 남김 (DROP X) — 코드 측면에서만 무시. 향후 재활용 가능.
--
-- 실행: Supabase Dashboard → SQL Editor → 붙여넣기 → Run
-- 멱등 (CREATE OR REPLACE)
-- ============================================================

CREATE OR REPLACE FUNCTION consume_daily_atomic(
  p_user_id UUID,
  p_amount_usd NUMERIC,
  p_daily_cap_usd NUMERIC
) RETURNS JSONB AS $$
DECLARE
  v_billing soragodong_billing%ROWTYPE;
  v_now TIMESTAMPTZ := NOW();
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

  -- 사용자 명시 2026-05-12 ultrathink (v3): grace 분기 폐기. effective_cap = base cap 만.
  -- cap 검사
  v_new_used := v_billing.daily_quota_used + p_amount_usd;
  IF v_new_used > p_daily_cap_usd THEN
    RETURN jsonb_build_object(
      'ok', false,
      'daily_cap_reached', true,
      'reset_at', v_billing.daily_quota_reset_at,
      'effective_cap', p_daily_cap_usd,
      'base_cap', p_daily_cap_usd,
      'used', v_billing.daily_quota_used,
      'in_grace', false
    );
  END IF;

  -- consume
  UPDATE soragodong_billing
    SET daily_quota_used = v_new_used
    WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'ok', true,
    'used', v_new_used,
    'daily_remaining', p_daily_cap_usd - v_new_used,
    'reset_at', v_billing.daily_quota_reset_at,
    'effective_cap', p_daily_cap_usd,
    'base_cap', p_daily_cap_usd,
    'in_grace', false
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION consume_daily_atomic IS '2026-05-12 v3: grace 폐기. effective_cap = base cap. user-trigger path 만 호출. batch path 는 monthly cap 만.';

-- daily_cap_grace_until 컬럼은 그대로 남김 (DROP X) — 향후 promo 등 재활용 가능.

-- ============================================================
-- 검증:
-- SELECT consume_daily_atomic('<test-uuid>', 0.05, 0.30);
-- → {"ok": true, "used": 0.05, "daily_remaining": 0.25, "in_grace": false, "effective_cap": 0.30, ...}
--
-- SELECT consume_daily_atomic('<test-uuid>', 0.30, 0.30);
-- → {"ok": false, "daily_cap_reached": true, "effective_cap": 0.30, "in_grace": false, ...}
-- ============================================================
