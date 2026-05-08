-- ============================================================
-- 소라고동 V4 — soragodong_billing 에 user_email 컬럼 추가
-- 사용자 보고 2026-05-09: cron-renewal-notice 가 user_email 필요한데 컬럼 자체 X (auth.users.email 만 존재).
-- → schema 통일: billing 에 user_email 추가 + 결제 endpoint 가 INSERT/UPDATE 시 채움 + cron 은 billing.user_email 우선 + auth.users fallback.
-- 실행: Supabase Dashboard → SQL Editor → 붙여넣기 → Run. 멱등.
-- ============================================================

ALTER TABLE soragodong_billing
  ADD COLUMN IF NOT EXISTS user_email TEXT;

COMMENT ON COLUMN soragodong_billing.user_email IS
  '사용자 이메일 (auth.users.email 미러). cron 이 결제 알림·영수증 발송 시 사용. ensureBillingRow / portone 결제 endpoint 가 INSERT/UPDATE 시 채움. single source of truth = auth.users.email — 변경 시 billing 도 sync.';

-- 옛 row 백필 — auth.users.email 에서 가져옴.
UPDATE soragodong_billing b
SET user_email = u.email
FROM auth.users u
WHERE b.user_id = u.id
  AND (b.user_email IS NULL OR b.user_email = '');
