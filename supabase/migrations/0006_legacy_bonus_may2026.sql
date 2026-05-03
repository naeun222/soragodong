-- ============================================================
-- 0006 — 기존 사용자 1,000원 추가 보너스 (사용자 명시 2026-05-01)
--
-- 배경: 환영 토큰 2,000원 → 3,000원 상향. 기존 사용자에게도 동등 효과 부여.
-- 대상: 이미 환영 토큰 받은 사용자 (free_credit_granted=true). 1회 += $0.71.
-- 결과: 기존 사용자 잔액 ≈ 신규 가입자 신정책과 동등.
-- 미수령 사용자 (free_credit_granted=false) = legacy bonus 대상 X (welcome-bonus 으로 새 3,000원 받음).
--
-- 실행: Supabase Dashboard → SQL Editor → 붙여넣기 → Run.
-- 멱등 (이미 적용돼 있어도 안전).
-- ============================================================

-- 1. 컬럼 추가 (멱등)
ALTER TABLE soragodong_billing
  ADD COLUMN IF NOT EXISTS legacy_bonus_2026_05_granted BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS legacy_bonus_2026_05_amount_usd NUMERIC(12, 6) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS legacy_bonus_2026_05_granted_at TIMESTAMPTZ;

-- 2. atomic grant RPC (FOR UPDATE row lock — race 차단)
-- 자격: free_credit_granted=true AND legacy_bonus_2026_05_granted=false
CREATE OR REPLACE FUNCTION grant_legacy_bonus_may2026(
  p_user_id UUID,
  p_amount_usd NUMERIC
) RETURNS JSONB AS $$
DECLARE
  v_row soragodong_billing%ROWTYPE;
BEGIN
  SELECT * INTO v_row
  FROM soragodong_billing
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_billing_row');
  END IF;

  IF v_row.legacy_bonus_2026_05_granted THEN
    RETURN jsonb_build_object(
      'ok', true,
      'already_granted', true,
      'balance_usd', v_row.credit_balance_usd
    );
  END IF;

  IF NOT v_row.free_credit_granted THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_legacy_user');
  END IF;

  UPDATE soragodong_billing SET
    credit_balance_usd = credit_balance_usd + p_amount_usd,
    legacy_bonus_2026_05_granted = TRUE,
    legacy_bonus_2026_05_amount_usd = p_amount_usd,
    legacy_bonus_2026_05_granted_at = NOW()
  WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'ok', true,
    'granted', true,
    'amount_usd', p_amount_usd,
    'balance_usd', v_row.credit_balance_usd + p_amount_usd
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 검증 쿼리 (실행 후)
-- ============================================================
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'soragodong_billing' AND column_name LIKE 'legacy_bonus%';
--
-- SELECT routine_name FROM information_schema.routines
-- WHERE routine_name = 'grant_legacy_bonus_may2026';
--
-- 자격 사용자 수 확인:
-- SELECT COUNT(*) FROM soragodong_billing
-- WHERE free_credit_granted = TRUE AND legacy_bonus_2026_05_granted = FALSE;
