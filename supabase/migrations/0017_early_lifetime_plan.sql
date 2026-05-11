-- ============================================================
-- 소라고동 V4 — 0017 Early Lifetime Plan (사용자 보고 2026-05-11)
--
-- 목적: subscription_plan CHECK 에 'early_lifetime' 추가.
--   - 0010 까지 허용: 'light', 'premium', 'early_light', 'guest'
--   - frontend / backend 는 'early_lifetime' 사용 중인데 DB CHECK 누락 → 빌링키 등록 시 23514.
--
-- 변경:
--   1) subscription_plan CHECK 갱신 — 'early_lifetime' 추가 (early_light 는 legacy 호환 유지)
--
-- 실행: Supabase Dashboard → SQL Editor → 붙여넣기 → Run
-- 멱등 (DROP IF EXISTS + ADD CONSTRAINT)
-- ============================================================

ALTER TABLE soragodong_billing
  DROP CONSTRAINT IF EXISTS soragodong_billing_plan_check;

ALTER TABLE soragodong_billing
  ADD CONSTRAINT soragodong_billing_plan_check
  CHECK (subscription_plan IS NULL OR subscription_plan IN ('light', 'premium', 'early_light', 'early_lifetime', 'guest'));

COMMENT ON CONSTRAINT soragodong_billing_plan_check ON soragodong_billing IS
  '2026-05-11: early_lifetime 추가 (얼리버드 첫 달 무료 + 자동 갱신). early_light 는 legacy 호환.';

-- ============================================================
-- 검증:
-- SELECT subscription_plan, COUNT(*) FROM soragodong_billing GROUP BY subscription_plan;
-- ============================================================
