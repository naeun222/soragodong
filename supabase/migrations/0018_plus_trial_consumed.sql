-- ============================================================
-- 소라고동 V4 — 0018 Plus Trial Consumed Flag (사용자 명시 2026-05-11 ultrathink)
--
-- 목적: Plus(key='light') 첫 달 무료 trial 의 1인 1회 보장.
--   해지 후 재가입 / 동일 사용자 재시도 우회 방지.
--   정기결제 가동 시 portone-register-trial.ts 가 이 column 으로 차단.
--
-- 변경:
--   1) plus_trial_consumed_at TIMESTAMPTZ — Plus trial 등록 시점 기록.
--      NULL = 받은 적 없음. NOT NULL = 받은 적 있음 (재 trial 차단).
--      기존 사용자 = 가입 시점에는 NULL 로 시작.
--
-- 실행: Supabase Dashboard → SQL Editor → 붙여넣기 → Run
-- 멱등 (ADD COLUMN IF NOT EXISTS)
-- ============================================================

ALTER TABLE soragodong_billing
  ADD COLUMN IF NOT EXISTS plus_trial_consumed_at TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN soragodong_billing.plus_trial_consumed_at IS
  '2026-05-11: Plus 첫 달 무료 trial 사용 시점. NOT NULL = 1인 1회 차단 (재가입 우회 방지).';

-- ============================================================
-- 검증:
-- SELECT user_id, subscription_plan, plus_trial_consumed_at
--   FROM soragodong_billing
--   WHERE plus_trial_consumed_at IS NOT NULL;
-- ============================================================
