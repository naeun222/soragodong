-- ============================================================
-- 0009 — Pricing Phase 2: 처음 한 달 무료 (얼리 플랜) 정책 (사용자 명시 2026-05-05)
--
-- 변경 요약:
--   1) 100만 토큰 환영 선물 (welcome_bonus_*) / 1,000원 legacy bonus / $2.14 free credit / early_user 정책 모두 폐기.
--   2) 신정책 = 모든 신규 가입자 자동 30일 free trial (얼리 플랜, plan='early_light', cap=$4). 자동 결제 X.
--   3) 기존 사용자도 한 달 무료 backfill (사용자 명시) — 단, 이미 light/premium 활성 결제 구독자는 보존.
--   4) dead 컬럼 + RPC drop (welcome_bonus_* / legacy_bonus_2026_05_* / early_user / free_credit_*).
--
-- 한도 도달 시 클라이언트가 Premium 결제 유도 + 개발자 후원 메시지 (단독 개발자, iOS 앱 출시 자금).
--
-- 실행: Supabase Dashboard → SQL Editor → 붙여넣기 → Run.
-- 멱등 (CREATE OR REPLACE / IF NOT EXISTS / IF EXISTS — 다시 실행해도 안전).
-- 단 backfill UPDATE 는 active 결제 구독자 외 모두 새 cycle 으로 reset 함 — 1회만 실행 권장.
-- ============================================================

-- ============================================================
-- 1. free_trial_granted_at 컬럼 추가 (멱등)
-- ============================================================
ALTER TABLE soragodong_billing
  ADD COLUMN IF NOT EXISTS free_trial_granted_at TIMESTAMPTZ;

COMMENT ON COLUMN soragodong_billing.free_trial_granted_at IS '처음 한 달 무료 (얼리 플랜) 활성화 시점. NULL = 미부여.';

-- ============================================================
-- 2. 기존 사용자 backfill — 한 달 무료 부여
-- ============================================================
-- 대상: 활성 결제 구독자 (light/premium 만료 X) 외 모든 사용자.
--   - 만료된 / 미구독 / early_light 사용자 → 새 30일 free trial 부여
--   - light/premium 활성 결제 사용자 → 보존 (이미 결제 = 그대로)
-- credit_balance_usd (legacy charge 잔액 / 옛 free credit) 은 보존.
-- monthly_token_used 는 0 으로 reset (새 cycle 시작).
UPDATE soragodong_billing
SET
  subscription_active     = TRUE,
  subscription_plan       = 'early_light',
  subscription_expires_at = NOW() + INTERVAL '30 days',
  monthly_quota_usd       = 4,
  monthly_token_used      = 0,
  monthly_period_started_at = NOW(),
  free_trial_granted_at   = COALESCE(free_trial_granted_at, NOW())
WHERE
  NOT (
    subscription_active     = TRUE
    AND subscription_expires_at IS NOT NULL
    AND subscription_expires_at > NOW()
    AND subscription_plan IN ('light', 'premium')
  );

-- ============================================================
-- 3. dead RPC drop
-- ============================================================
-- 100만 토큰 환영 선물 (이미 클라이언트/서버 코드에서 호출 X — endpoint 410 Gone stub).
DROP FUNCTION IF EXISTS grant_welcome_bonus_atomic(UUID, BIGINT, INT);
DROP FUNCTION IF EXISTS grant_welcome_bonus_atomic(UUID, BIGINT);
DROP FUNCTION IF EXISTS grant_welcome_bonus_atomic(UUID);
DROP FUNCTION IF EXISTS consume_welcome_bonus_atomic(UUID, BIGINT);
DROP FUNCTION IF EXISTS grant_legacy_bonus_may2026(UUID, NUMERIC);

-- ============================================================
-- 4. dead 컬럼 drop
-- ============================================================
-- welcome_bonus_* (100만 토큰)
ALTER TABLE soragodong_billing
  DROP COLUMN IF EXISTS welcome_bonus_tokens_remaining,
  DROP COLUMN IF EXISTS welcome_bonus_total_granted,
  DROP COLUMN IF EXISTS welcome_bonus_granted_at,
  DROP COLUMN IF EXISTS welcome_bonus_expires_at;

-- legacy_bonus_2026_05_* (1,000원 보너스)
ALTER TABLE soragodong_billing
  DROP COLUMN IF EXISTS legacy_bonus_2026_05_granted,
  DROP COLUMN IF EXISTS legacy_bonus_2026_05_amount_usd,
  DROP COLUMN IF EXISTS legacy_bonus_2026_05_granted_at;

-- early_user (출시 전 가입자 평생 4,900원 자격) — 신정책에선 모두 자동 free trial 이라 의미 X
ALTER TABLE soragodong_billing
  DROP COLUMN IF EXISTS early_user,
  DROP COLUMN IF EXISTS early_user_granted_at;

-- free_credit_* ($2.14 free credit 정책)
ALTER TABLE soragodong_billing
  DROP COLUMN IF EXISTS free_credit_granted,
  DROP COLUMN IF EXISTS free_credit_amount_usd,
  DROP COLUMN IF EXISTS free_credit_granted_at;

-- ============================================================
-- 검증 쿼리 (실행 후 확인용)
-- ============================================================
-- 1. dead 컬럼 정리됐는지 — 빈 결과 기대.
-- SELECT column_name FROM information_schema.columns
--  WHERE table_name = 'soragodong_billing'
--    AND column_name LIKE 'welcome_bonus%'
--     OR column_name LIKE 'legacy_bonus%'
--     OR column_name LIKE 'early_user%'
--     OR column_name LIKE 'free_credit%';
--
-- 2. free_trial_granted_at 컬럼 추가 확인.
-- SELECT column_name, data_type FROM information_schema.columns
--  WHERE table_name = 'soragodong_billing' AND column_name = 'free_trial_granted_at';
--
-- 3. dead RPC 정리됐는지 — 빈 결과 기대.
-- SELECT routine_name FROM information_schema.routines
--  WHERE routine_schema = 'public'
--    AND routine_name IN ('grant_welcome_bonus_atomic', 'consume_welcome_bonus_atomic', 'grant_legacy_bonus_may2026');
--
-- 4. backfill 결과 — plan 별 사용자 수 확인.
-- SELECT subscription_plan, subscription_active, COUNT(*)
--   FROM soragodong_billing
--   GROUP BY subscription_plan, subscription_active
--   ORDER BY subscription_plan;
-- 기대:
--   - early_light / TRUE: 대부분의 사용자 (한 달 무료 부여됨)
--   - light / TRUE: 활성 light 결제 사용자 (변경 X)
--   - premium / TRUE: 활성 premium 결제 사용자 (변경 X)
--
-- 5. free_trial_granted_at backfill 결과.
-- SELECT COUNT(*) FROM soragodong_billing WHERE free_trial_granted_at IS NOT NULL;
