-- ============================================================
-- 소라고동 V4 — Phase 3 영상 마케팅 유입 추적
-- 사용자 요청 2026-05-11: 영상 (유튜브 쇼츠 / 인스타) → 가입 funnel 측정.
-- 익명 가입자 + 실가입자 모두 대상. 가입 직후 client 가 first-touch URL 정보 1회 insert.
-- 실행 방법: Supabase Dashboard → SQL Editor → 붙여넣기 → Run
-- 멱등 (이미 적용돼 있어도 안전)
-- ============================================================

-- ============================================================
-- 1. soragodong_acquisition — first-touch attribution
-- ============================================================
CREATE TABLE IF NOT EXISTS soragodong_acquisition (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  signup_referer TEXT,
  signup_utm_source TEXT,
  signup_utm_medium TEXT,
  signup_utm_campaign TEXT,
  signup_utm_content TEXT,
  signup_utm_term TEXT,
  signup_user_agent TEXT,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- utm_source 별 집계 빠르게 (admin 통계용)
CREATE INDEX IF NOT EXISTS idx_acquisition_utm_source ON soragodong_acquisition(signup_utm_source);
CREATE INDEX IF NOT EXISTS idx_acquisition_created ON soragodong_acquisition(created_at DESC);

-- ============================================================
-- 2. RLS — 본인 row 만 INSERT / SELECT. UPDATE / DELETE 는 service_role 만.
-- ============================================================
ALTER TABLE soragodong_acquisition ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users insert own acquisition" ON soragodong_acquisition;
CREATE POLICY "users insert own acquisition"
  ON soragodong_acquisition FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "users read own acquisition" ON soragodong_acquisition;
CREATE POLICY "users read own acquisition"
  ON soragodong_acquisition FOR SELECT
  USING (auth.uid() = user_id);

-- ============================================================
-- 검증 쿼리 (실행 후 정상 확인용)
-- ============================================================
-- SELECT signup_utm_source, signup_utm_campaign, COUNT(*) AS users
-- FROM soragodong_acquisition
-- WHERE created_at > NOW() - INTERVAL '7 days'
-- GROUP BY 1, 2
-- ORDER BY users DESC;

-- ============================================================
-- 주의 사항
-- ============================================================
-- 1. 가입 후 1회만 INSERT — client 가 localStorage 'sora_acquisition_uploaded' 플래그로 중복 방지.
--    동일 user_id 재INSERT 시 PRIMARY KEY conflict → client 는 'Prefer: resolution=ignore-duplicates' 헤더로 silent skip.
-- 2. 익명 가입자 → 실가입자 전환 시 user_id 유지 (Supabase linkIdentity) — acquisition row 보존.
-- 3. 회원 탈퇴 시 auth.users 삭제 → ON DELETE CASCADE 로 자동 정리.
-- 4. 익명 가입자 cleanup cron (migration 0011) 이 auth.users 의 stale anonymous row 삭제 → CASCADE.
