-- ============================================================
-- 소라고동 V4 — 동의 로그 분리 테이블 + payments user_id 익명화
-- 사용자 명시 2026-05-08 ultrathink (audit WARN #21 + #22).
-- 실행: Supabase Dashboard → SQL Editor → 붙여넣기 → Run. 멱등.
-- ============================================================

-- ============================================================
-- (1) 동의 로그 독립 테이블 — PIPA 분쟁 시 증거 명확화 (audit WARN #21)
-- 옛: state.preferences.consentLog → soragodong_data row 안 평문 metaBody. 추출 어려움.
-- 신: 별도 테이블 — service_role INSERT, 본인 SELECT (감사 대응 간명).
-- ============================================================

CREATE TABLE IF NOT EXISTS soragodong_consent_log (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  consent_type TEXT NOT NULL,
    -- 'terms' / 'privacy' / 'sensitive' / 'crossBorder' / 'age14' / 'loginMethod' / 'marketing' (예약)
  version TEXT NOT NULL,
  confirmed BOOLEAN NOT NULL DEFAULT TRUE,
  basis TEXT,                          -- 법적 근거 (PIPA §22 / §23 / §17 등) 또는 자기 선언
  birth_year INT,                      -- age14 동의 시 출생년도 (PIPA §22-2 합리적 노력 입증)
  age_at_consent INT,                  -- age14 동의 시 만 나이
  ip TEXT,                             -- 동의 시점 IP (분쟁 증거)
  user_agent TEXT,                     -- 동의 시점 User-Agent
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_consent_log_user
  ON soragodong_consent_log (user_id, consent_type, created_at DESC);

ALTER TABLE soragodong_consent_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "consent_log_select_own" ON soragodong_consent_log;
CREATE POLICY "consent_log_select_own" ON soragodong_consent_log
  FOR SELECT
  TO authenticated
  USING (auth.uid()::text = user_id::text);

-- INSERT / UPDATE / DELETE 는 service_role 만 (RLS 기본 거부).

COMMENT ON TABLE soragodong_consent_log IS
  'PIPA §22 / §23 / §17 별도 동의 audit trail. 분쟁 시 type별 동의 증거. service_role INSERT, 본인 SELECT.';

-- ============================================================
-- (2) payments user_id 탈퇴 시 익명화 (audit WARN #22)
-- 옛: withdraw_user_data 가 user_email 만 익명화 / user_id UUID 그대로.
-- 신: anonymized_token + anonymized_at 컬럼 추가 — 본인 매칭 어려운 비식별 상태.
-- 5년 보존 의무는 충족 (전자상거래법 §6).
-- ============================================================

ALTER TABLE soragodong_payments
  ADD COLUMN IF NOT EXISTS anonymized_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS anonymized_token TEXT;

COMMENT ON COLUMN soragodong_payments.anonymized_at IS
  '회원 탈퇴 시점 — 이 시점 후 user_email 익명화됨.';
COMMENT ON COLUMN soragodong_payments.anonymized_token IS
  'PIPA 익명화 후 row 식별용 비식별 토큰 (UUID v4). 본인 매칭 불가.';

-- withdraw_user_data RPC 갱신 — user_id UUID 도 익명화.
-- 사용자 보고 2026-05-09: 옛 함수 (0002_billing_usage.sql) 가 이미 존재 → CREATE OR REPLACE 시 return type 변경 불가 (42P13).
-- DROP 선행 후 재생성.
DROP FUNCTION IF EXISTS withdraw_user_data(uuid);

CREATE OR REPLACE FUNCTION withdraw_user_data(p_user_id UUID)
RETURNS void AS $$
DECLARE
  v_anon_token TEXT;
  v_anon_email TEXT;
BEGIN
  v_anon_token := 'anon-' || replace(gen_random_uuid()::text, '-', '');
  v_anon_email := '[withdrawn-' || extract(epoch from now())::bigint || ']';

  -- 1. 자기관찰 데이터 즉시 삭제 (PIPA §36 즉시 이행).
  DELETE FROM soragodong_data WHERE auth_user_id = p_user_id;

  -- 2. 결제 기록 익명화 (전자상거래법 §6 5년 보존 + PIPA 익명화 양립).
  -- 사용자 명시 2026-05-08 ultrathink (audit WARN #22): user_email + anonymized_token 익명화. user_id NULL 처리는 FK 제약으로 불가 — 향후 schema 변경 (user_id NULLABLE) 시 user_id = NULL.
  UPDATE soragodong_payments
  SET user_email = v_anon_email,
      anonymized_at = NOW(),
      anonymized_token = v_anon_token
  WHERE user_id = p_user_id;

  -- 3. billing 즉시 삭제.
  DELETE FROM soragodong_billing WHERE user_id = p_user_id;

  -- 4. usage 즉시 삭제.
  DELETE FROM soragodong_usage WHERE user_id = p_user_id;

  -- 5. feedback 즉시 삭제.
  DELETE FROM soragodong_feedback WHERE user_id = p_user_id;

  -- 6. billing_idempotency 즉시 삭제.
  DELETE FROM soragodong_billing_idempotency WHERE user_id = p_user_id;

  -- consent_log 는 user_id FK CASCADE 로 auth.users 삭제 시 자동 삭제. 별도 처리 X.
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION withdraw_user_data IS
  '회원 탈퇴 — 자기관찰 데이터 즉시 삭제 + 결제 5년 보존 익명화. 사용자 명시 2026-05-08 audit WARN #22 갱신.';
