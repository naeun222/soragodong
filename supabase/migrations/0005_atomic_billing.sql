-- ============================================================
-- 0005 — atomic billing RPCs (사용자 명시 2026-04-30 ultrathink)
-- 충전 / 환불 race condition + idempotency 차단.
-- 실행: Supabase Dashboard → SQL Editor → 붙여넣기 → Run.
-- 멱등 (이미 적용돼 있어도 안전).
--
-- 배경:
--   기존 endpoints (charge / verify-toss-receipt / overage-pack / refund / revoke-charge)
--   = SELECT credit_balance_usd → compute → PATCH credit_balance_usd 패턴.
--   동시 두 호출 시 = 둘 다 같은 currentBalance 읽고 마지막 PATCH 만 살아남음 = 잔액 손실 / 누적 risk.
--
--   또 = imp_uid / image_sha256 idempotency 약함 = 같은 결제 두 번 호출 시 += 두 번 발생 가능.
--
-- 해결:
--   1) add_credit_atomic_idempotent — FOR UPDATE row lock + idempotency_key 검증
--   2) subtract_credit_atomic — FOR UPDATE row lock 차감 (음수 방지)
--   3) soragodong_billing_idempotency 테이블 — 처리된 결제 기록 (idempotency check)
-- ============================================================

-- 1. idempotency 기록 테이블 (결제 ID 별 처리 한 번만)
CREATE TABLE IF NOT EXISTS soragodong_billing_idempotency (
  idempotency_key TEXT PRIMARY KEY,                -- imp_uid / image_sha256 / memo_code 등
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount_usd NUMERIC(12, 6) NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_billing_idempotency_user ON soragodong_billing_idempotency(user_id, applied_at DESC);

-- RLS — 사용자 본인만 SELECT (디버깅용). INSERT는 service_role만.
ALTER TABLE soragodong_billing_idempotency ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users read own idempotency" ON soragodong_billing_idempotency;
CREATE POLICY "users read own idempotency"
  ON soragodong_billing_idempotency FOR SELECT
  USING (auth.uid() = user_id);

-- 2. 잔액 추가 atomic RPC (idempotency check + race-safe)
CREATE OR REPLACE FUNCTION add_credit_atomic_idempotent(
  p_user_id UUID,
  p_amount_usd NUMERIC,
  p_idempotency_key TEXT
) RETURNS JSONB AS $$
DECLARE
  v_existing soragodong_billing_idempotency%ROWTYPE;
  v_new_balance NUMERIC;
BEGIN
  -- 1. idempotency check — 같은 key 로 이미 처리됐으면 no-op
  SELECT * INTO v_existing
  FROM soragodong_billing_idempotency
  WHERE idempotency_key = p_idempotency_key;

  IF FOUND THEN
    -- 이미 처리됨 → 잔액 변경 X, 현재 잔액 리턴
    SELECT credit_balance_usd INTO v_new_balance
    FROM soragodong_billing
    WHERE user_id = p_user_id;
    RETURN jsonb_build_object(
      'ok', true,
      'already_applied', true,
      'balance_usd', COALESCE(v_new_balance, 0),
      'idempotency_key', p_idempotency_key
    );
  END IF;

  -- 2. 잔액 row lock (race 차단)
  PERFORM 1 FROM soragodong_billing
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    -- billing row 없음 → 생성 (잔액 0 으로 INSERT 후 += 적용)
    INSERT INTO soragodong_billing (user_id, credit_balance_usd, free_credit_granted)
    VALUES (p_user_id, 0, false)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  -- 3. 잔액 += amount + idempotency 기록 (atomic)
  UPDATE soragodong_billing
  SET credit_balance_usd = credit_balance_usd + p_amount_usd
  WHERE user_id = p_user_id
  RETURNING credit_balance_usd INTO v_new_balance;

  INSERT INTO soragodong_billing_idempotency (idempotency_key, user_id, amount_usd)
  VALUES (p_idempotency_key, p_user_id, p_amount_usd);

  RETURN jsonb_build_object(
    'ok', true,
    'already_applied', false,
    'balance_usd', v_new_balance,
    'added_usd', p_amount_usd,
    'idempotency_key', p_idempotency_key
  );

EXCEPTION
  WHEN unique_violation THEN
    -- 동시 두 호출 시 첫 INSERT 만 success, 두 번째 = unique violation → already_applied 처리
    SELECT credit_balance_usd INTO v_new_balance
    FROM soragodong_billing
    WHERE user_id = p_user_id;
    RETURN jsonb_build_object(
      'ok', true,
      'already_applied', true,
      'balance_usd', COALESCE(v_new_balance, 0),
      'idempotency_key', p_idempotency_key,
      'race_protected', true
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. 잔액 차감 atomic RPC (refund / revoke-charge 측. race-safe + 음수 방지)
CREATE OR REPLACE FUNCTION subtract_credit_atomic(
  p_user_id UUID,
  p_amount_usd NUMERIC
) RETURNS JSONB AS $$
DECLARE
  v_billing soragodong_billing%ROWTYPE;
  v_subtracted NUMERIC;
BEGIN
  SELECT * INTO v_billing
  FROM soragodong_billing
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'billing row 없음');
  END IF;

  v_subtracted := LEAST(v_billing.credit_balance_usd, p_amount_usd);

  UPDATE soragodong_billing
  SET credit_balance_usd = GREATEST(0, credit_balance_usd - p_amount_usd)
  WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'ok', true,
    'subtracted_usd', v_subtracted,
    'balance_usd', GREATEST(0, v_billing.credit_balance_usd - p_amount_usd)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 검증 쿼리 (실행 후 정상 확인용)
-- ============================================================
-- SELECT routine_name FROM information_schema.routines
-- WHERE routine_name IN ('add_credit_atomic_idempotent', 'subtract_credit_atomic');
--
-- SELECT * FROM soragodong_billing_idempotency LIMIT 10;
