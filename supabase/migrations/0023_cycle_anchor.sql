-- V4 (사용자 명시 2026-05-13 ultrathink): 매월 가입일 anchor 기준 cycle (Netflix / YouTube Premium 표준).
--
-- 옛 동작: 30일 fixed 주기 (1년 12.17회 결제). 표기와 동작 mismatch — 표기 "매월" / 실제 30일.
-- 새 동작: 가입일 기준 매월 같은 날 결제. anchor 가 31 인데 다음 달이 30일까지면 → 해당 월 마지막 날 clip.
--   예: 5월 13일 가입 → 매월 13일 결제 / 5월 31일 가입 → 매월 31일, 4월 6월 11월 = 30일, 2월 = 28/29일.
--
-- 컬럼:
--   subscription_started_at  TIMESTAMPTZ NULL — 최초 가입 시각 (UTC 저장, KST 변환은 클라이언트).
--   cycle_anchor_day         SMALLINT NULL CHECK (1~31)   — 매월 결제 anchor day (KST 기준).
--
-- 옛 row 백필:
--   cycle_anchor_day = EXTRACT(DAY FROM next_billing_at AT TIME ZONE 'Asia/Seoul')::SMALLINT
--   subscription_started_at = monthly_period_started_at (있으면) 또는 NOW() - INTERVAL '30 days' (없으면)
--
-- Fallback (어드민 reset 등 anchor=NULL row): 코드 측에서 next_billing_at 의 day 사용 또는 +30일 패턴.

ALTER TABLE soragodong_billing
  ADD COLUMN IF NOT EXISTS subscription_started_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS cycle_anchor_day        SMALLINT    NULL;

COMMENT ON COLUMN soragodong_billing.subscription_started_at IS '최초 가입(또는 plan 변경) 시각 — UTC. KST 변환 시 +9h.';
COMMENT ON COLUMN soragodong_billing.cycle_anchor_day        IS '매월 결제 anchor day (1-31, KST 기준). 다음 달이 짧으면 해당 월 마지막 날로 clip — clipped 후에도 anchor 그대로 보존하여 다음 달엔 31 일에 결제.';

-- 안전 가드.
ALTER TABLE soragodong_billing
  DROP CONSTRAINT IF EXISTS soragodong_billing_cycle_anchor_day_chk;
ALTER TABLE soragodong_billing
  ADD CONSTRAINT soragodong_billing_cycle_anchor_day_chk
  CHECK (cycle_anchor_day IS NULL OR (cycle_anchor_day >= 1 AND cycle_anchor_day <= 31));

-- 백필 — 정상 가입자 대부분 OK (next_billing_at 의 KST day 가 anchor).
UPDATE soragodong_billing
SET cycle_anchor_day = EXTRACT(DAY FROM (next_billing_at AT TIME ZONE 'Asia/Seoul'))::SMALLINT
WHERE cycle_anchor_day IS NULL AND next_billing_at IS NOT NULL;

UPDATE soragodong_billing
SET subscription_started_at = COALESCE(monthly_period_started_at, NOW() - INTERVAL '30 days')
WHERE subscription_started_at IS NULL AND subscription_active = true;
