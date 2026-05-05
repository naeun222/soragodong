-- ============================================================
-- 소라고동 V4 — 0010 Guest Tier (Phase 0, 사용자 명시 2026-05-05 ultrathink)
--
-- 목적: 게스트 모드 (Supabase anonymous sign-in) 사용자 한정 새 구독 tier 'guest' 추가.
--   - cap_usd: 0.20 (~10턴 chat)
--   - 결제 대상 X (krw=0, anonymous 만 자동 부여)
--   - linkIdentity (게스트 → 가입자 전환) 시 backend 가 'guest' → 'early_light' 로 update
--
-- 변경:
--   1) subscription_plan CHECK 갱신 — 'guest' 추가
--
-- 실행 방법: Supabase Dashboard → SQL Editor → 붙여넣기 → Run
-- 멱등 (이미 적용돼도 안전 — DROP IF EXISTS + ADD CONSTRAINT)
-- ============================================================

ALTER TABLE soragodong_billing
  DROP CONSTRAINT IF EXISTS soragodong_billing_plan_check;

ALTER TABLE soragodong_billing
  ADD CONSTRAINT soragodong_billing_plan_check
  CHECK (subscription_plan IS NULL OR subscription_plan IN ('light', 'premium', 'early_light', 'guest'));

COMMENT ON CONSTRAINT soragodong_billing_plan_check ON soragodong_billing IS
  'Phase 0 (2026-05-05): guest tier 추가 — Supabase anonymous 사용자 자동 부여, $0.20 cap.';

-- ============================================================
-- (선택) anonymous 사용자 자동 정리 — 3일 미활동 anonymous 계정 삭제.
-- 사용자 명시 2026-05-05: 30일 → 3일 정정 (Free tier MAU 보호).
-- 별도 Edge Function 또는 GitHub Actions cron 으로 호출 — 이 SQL 은 helper RPC 만 정의.
-- ============================================================
CREATE OR REPLACE FUNCTION cleanup_idle_anonymous_users(p_idle_days INT DEFAULT 3)
RETURNS JSONB AS $$
DECLARE
  v_cutoff TIMESTAMPTZ := NOW() - (p_idle_days || ' days')::INTERVAL;
  v_count INT;
BEGIN
  -- auth.users 에서 anonymous + 마지막 sign-in 이 cutoff 이전 + 마지막 활동 row 가 cutoff 이전
  -- (실제 활동 = soragodong_billing.monthly_period_started_at 또는 last 사용 row 기준)
  -- 보수적으로 monthly_period_started_at 만 기준 — 거의 미활동 게스트 제거.
  WITH idle_users AS (
    SELECT u.id
    FROM auth.users u
    LEFT JOIN soragodong_billing b ON b.user_id = u.id
    WHERE u.is_anonymous = TRUE
      AND u.last_sign_in_at < v_cutoff
      AND (b.monthly_period_started_at IS NULL OR b.monthly_period_started_at < v_cutoff)
  )
  DELETE FROM auth.users WHERE id IN (SELECT id FROM idle_users);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'deleted_count', v_count, 'cutoff', v_cutoff);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION cleanup_idle_anonymous_users IS
  '미활동 anonymous 사용자 정리 — 기본 3일. cron (Supabase Edge Function 또는 GitHub Actions) 로 매일 호출. CASCADE 로 soragodong_billing 등 자동 삭제.';

-- ============================================================
-- 검증 쿼리:
-- SELECT subscription_plan, COUNT(*) FROM soragodong_billing GROUP BY subscription_plan;
-- SELECT cleanup_idle_anonymous_users(3);  -- 결과 확인 (실제 삭제 발생!)
-- ============================================================
