-- ============================================================
-- 소라고동 V4 — 얼리버드 첫 달 무료 = 빌링키 + 30일 deferred first charge
-- 사용자 명시 2026-05-06: portone V2 빌링키 등록만 → 30일 후 첫 자동 결제 → 매월 자동 갱신.
-- 실행: Supabase Dashboard → SQL Editor → 붙여넣기 → Run. 멱등.
-- ============================================================

-- soragodong_billing 에 빌링키 + trial + 다음 결제 + 해지 예약 컬럼 추가.
ALTER TABLE soragodong_billing
  ADD COLUMN IF NOT EXISTS portone_billing_key TEXT,
  ADD COLUMN IF NOT EXISTS portone_billing_key_issued_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trial_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_billing_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_billing_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_billing_error TEXT,
  ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

-- next_billing_at 인덱스 — cron 이 due rows 빠르게 스캔.
CREATE INDEX IF NOT EXISTS idx_billing_next_billing
  ON soragodong_billing (next_billing_at)
  WHERE portone_billing_key IS NOT NULL
    AND subscription_active = TRUE
    AND cancel_at_period_end = FALSE;

-- 결제 기록 테이블에 billing_key recurring 결제 type 추가 가능하도록 — 기존 enum/check 없으면 그대로 OK.
-- payment_type = 'subscribe' (기존, 단건) / 'subscribe_recurring' (신규, billing_key 자동) / 'overage_pack' / etc
COMMENT ON COLUMN soragodong_billing.portone_billing_key IS
  '얼리버드 (early_lifetime) 카드 등록 시 PortOne V2 가 발급한 빌링키. cron 이 매월 이 키로 자동 결제.';
COMMENT ON COLUMN soragodong_billing.trial_until IS
  '무료 체험 종료 시점. cron 이 이 시점 이후 첫 결제 시도 (next_billing_at 와 동일 시점).';
COMMENT ON COLUMN soragodong_billing.next_billing_at IS
  '다음 자동 결제 예정 시점. NULL = 결제 대상 X (수동 구독 또는 trial 진행 중 cron 미설정).';
COMMENT ON COLUMN soragodong_billing.cancel_at_period_end IS
  '사용자가 다음 갱신 해지 신청 — cron 이 이 row skip. 만료 후 plan 자동 비활성.';
