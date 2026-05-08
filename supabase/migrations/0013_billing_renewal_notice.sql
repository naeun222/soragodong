-- ============================================================
-- 소라고동 V4 — 자동 갱신 7일 전 사전고지 (콘텐츠산업진흥법 §25 의무)
-- 사용자 명시 2026-05-08 ultrathink (audit FAIL #2): 갱신 7일 전 이메일 통지 의무.
-- 실행: Supabase Dashboard → SQL Editor → 붙여넣기 → Run. 멱등.
-- ============================================================

-- 7일 전 통지 발송 시각 — NULL 이면 미발송 / TIMESTAMPTZ 면 그 시각에 발송 완료.
-- cron-renewal-notice 가 매일 실행해 NULL 인 due row 에만 발송 + 발송 후 시각 기록 → 중복 발송 차단.
ALTER TABLE soragodong_billing
  ADD COLUMN IF NOT EXISTS renewal_notice_7d_at TIMESTAMPTZ;

COMMENT ON COLUMN soragodong_billing.renewal_notice_7d_at IS
  '자동 갱신 7일 전 사전고지 이메일 발송 시각. 콘텐츠산업진흥법 §25 의무 충족 증거. cron-renewal-notice 가 기록.';

-- 인덱스 — cron 이 7일 후 갱신 + 미발송 row 빠르게 스캔.
CREATE INDEX IF NOT EXISTS idx_billing_renewal_notice_due
  ON soragodong_billing (next_billing_at)
  WHERE renewal_notice_7d_at IS NULL
    AND subscription_active = TRUE
    AND cancel_at_period_end = FALSE
    AND portone_billing_key IS NOT NULL;
