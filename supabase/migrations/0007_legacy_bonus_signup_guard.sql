-- ============================================================
-- 0007 — legacy bonus 가드 강화 (사용자 보고 2026-05-01 ultrathink)
--
-- 배경: 0006 RPC 가 `free_credit_granted=true` 만 체크 → 신규 사용자도 환영 모달
--   "받을게" click 후 free_credit_granted=true → legacy 대상 오인 → 1,000원 받음.
-- fix: auth.users.created_at < '2026-05-01' 가드 추가.
--   - 2026-05-01 이전 가입 + 환영 토큰 받은 사용자 = 진짜 legacy
--   - 2026-05-01 이후 가입 사용자 = 신규 → not_legacy_user reason 응답
--
-- 멱등 (CREATE OR REPLACE — 0006 RPC 덮어쓰기, 컬럼 변경 X).
-- 실행: Supabase Dashboard → SQL Editor → 붙여넣기 → Run.
-- ============================================================

CREATE OR REPLACE FUNCTION grant_legacy_bonus_may2026(
  p_user_id UUID,
  p_amount_usd NUMERIC
) RETURNS JSONB AS $$
DECLARE
  v_row soragodong_billing%ROWTYPE;
  v_user_created_at TIMESTAMPTZ;
BEGIN
  -- 1. billing row lock
  SELECT * INTO v_row
  FROM soragodong_billing
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_billing_row');
  END IF;

  -- 2. 이미 받음
  IF v_row.legacy_bonus_2026_05_granted THEN
    RETURN jsonb_build_object(
      'ok', true,
      'already_granted', true,
      'balance_usd', v_row.credit_balance_usd
    );
  END IF;

  -- 3. 환영 토큰 미수령 = legacy 대상 X
  IF NOT v_row.free_credit_granted THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_legacy_user');
  END IF;

  -- 4. 사용자 보고 2026-05-01 ultrathink: 가입 시점 cutoff 가드 추가.
  -- 2026-05-01 이후 가입자는 신규 → legacy bonus 대상 X.
  SELECT created_at INTO v_user_created_at
  FROM auth.users
  WHERE id = p_user_id;

  IF v_user_created_at IS NULL OR v_user_created_at >= '2026-05-01T00:00:00Z'::timestamptz THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_legacy_user');
  END IF;

  -- 5. atomic grant
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
-- 검증 쿼리
-- ============================================================
-- 1. RPC 정의 확인
-- SELECT routine_definition FROM information_schema.routines
-- WHERE routine_name = 'grant_legacy_bonus_may2026';
--
-- 2. 신규 사용자 (2026-05-01 이후 가입) 차단 테스트
-- SELECT grant_legacy_bonus_may2026('<신규 user uuid>', 0.71);
-- → {"ok":false,"reason":"not_legacy_user"} 기대
--
-- 3. 기존 사용자 (2026-05-01 이전 가입 + 환영 토큰 받음) 통과 테스트
-- SELECT grant_legacy_bonus_may2026('<기존 user uuid>', 0.71);
-- → {"ok":true,"granted":true,...} 기대 (1회만)
