-- V4 (사용자 명시 2026-05-13 ultrathink): 다운그레이드 = 다음 갱신부터 자동 전환 (Phase B).
--
-- 컬럼 추가:
--   scheduled_plan_change      TEXT NULL — 다음 갱신 시 전환할 plan key (light | premium | early_lifetime). NULL = 변경 예약 X.
--   scheduled_plan_change_at   TIMESTAMPTZ NULL — 예약 시각 (UI 표시 + 디버그용).
--
-- cron-charge-recurring 분기:
--   billing row 의 scheduled_plan_change 가 NOT NULL 이면:
--     1) 새 plan 의 krw 로 charge (light=9900, premium=25000, early_lifetime=4900)
--     2) subscription_plan = scheduled_plan_change
--     3) monthly_quota_usd = TIER_PLANS[new].cap_usd
--     4) monthly_token_used = 0 / daily_quota_used = 0 (새 cycle 리셋)
--     5) scheduled_plan_change = NULL / scheduled_plan_change_at = NULL
--
-- 사용자 흐름:
--   1) Plus 사용자가 Light 다운그레이드 클릭 → /api/billing/schedule-plan-change 호출
--   2) billing.scheduled_plan_change = 'early_lifetime' set
--   3) 만료일 (next_billing_at) 도달 시 cron 이 자동 전환
--   4) 사용자 입장: 만료일까지 Plus 그대로 → 그 날 자동으로 Light 4,900원 결제 + 새 cycle 시작

ALTER TABLE soragodong_billing
  ADD COLUMN IF NOT EXISTS scheduled_plan_change      TEXT        NULL,
  ADD COLUMN IF NOT EXISTS scheduled_plan_change_at   TIMESTAMPTZ NULL;

COMMENT ON COLUMN soragodong_billing.scheduled_plan_change    IS '다음 갱신 시 전환할 plan key (light/premium/early_lifetime). NULL = 변경 X. cron-charge-recurring 이 값 보고 plan 전환.';
COMMENT ON COLUMN soragodong_billing.scheduled_plan_change_at IS '예약 시각 — UI 및 디버그용. NULL = 예약 X.';

-- 안전 가드: scheduled_plan_change 는 유효한 tier key 만 (light / premium / early_lifetime) 또는 NULL.
ALTER TABLE soragodong_billing
  DROP CONSTRAINT IF EXISTS soragodong_billing_scheduled_plan_change_chk;
ALTER TABLE soragodong_billing
  ADD CONSTRAINT soragodong_billing_scheduled_plan_change_chk
  CHECK (scheduled_plan_change IS NULL OR scheduled_plan_change IN ('light','premium','early_lifetime'));
