-- ============================================================
-- 소라고동 V4 — Row Level Security (RLS) 정책
-- 사용자: 본인 row만 read/write. 다른 사용자 row 접근 X.
-- 실행 방법: Supabase Dashboard → SQL Editor → 붙여넣기 → Run
-- 멱등 (이미 적용돼 있어도 안전, 실수로 두 번 실행 OK)
-- ============================================================

-- 1. soragodong_data 테이블에 RLS 활성화
ALTER TABLE soragodong_data ENABLE ROW LEVEL SECURITY;

-- 2. 기존 정책 정리 (idempotent)
DROP POLICY IF EXISTS "users read own data"       ON soragodong_data;
DROP POLICY IF EXISTS "users insert own data"     ON soragodong_data;
DROP POLICY IF EXISTS "users update own data"     ON soragodong_data;
DROP POLICY IF EXISTS "users delete own data"     ON soragodong_data;

-- 3. SELECT — 본인 row만 읽기
-- auth_user_id 컬럼 타입에 따라 캐스팅 (uuid OR text). 둘 다 처리.
CREATE POLICY "users read own data"
  ON soragodong_data
  FOR SELECT
  USING (
    auth.uid()::text = auth_user_id::text
  );

-- 4. INSERT — 본인 row만 만들기 (auth_user_id 다른 사람 못 박음)
CREATE POLICY "users insert own data"
  ON soragodong_data
  FOR INSERT
  WITH CHECK (
    auth.uid()::text = auth_user_id::text
  );

-- 5. UPDATE — 본인 row만 수정
CREATE POLICY "users update own data"
  ON soragodong_data
  FOR UPDATE
  USING (
    auth.uid()::text = auth_user_id::text
  )
  WITH CHECK (
    auth.uid()::text = auth_user_id::text
  );

-- 6. DELETE — 본인 row만 삭제
CREATE POLICY "users delete own data"
  ON soragodong_data
  FOR DELETE
  USING (
    auth.uid()::text = auth_user_id::text
  );

-- ============================================================
-- 검증 쿼리 (선택, 실행 후 정상 동작 확인용)
-- ============================================================
-- SELECT schemaname, tablename, policyname, cmd
-- FROM pg_policies
-- WHERE tablename = 'soragodong_data';
--
-- SELECT relname, relrowsecurity
-- FROM pg_class
-- WHERE relname = 'soragodong_data';

-- ============================================================
-- 주의 사항
-- ============================================================
-- 1. service_role key를 가진 백엔드는 RLS 우회함 (의도된 동작).
--    → service_role key는 절대 클라이언트 코드에 X. Vercel 환경변수에만.
-- 2. anon key + 사용자 JWT(Authorization Bearer)로 호출하면 RLS 적용됨.
--    → 클라이언트는 anon key + 로그인 후 access_token 만 사용.
-- 3. magic link 로그인 시 auth.uid()가 활성화됨. 로그인 안 한 상태면 모든 정책 deny.
-- 4. Supabase 콘솔의 SQL Editor는 service_role 모드로 실행되므로
--    RLS 적용 후에도 dev가 수동 쿼리로는 데이터 볼 수 있음 (의도된 동작 — Stage 1 한계).
--    완전 dev 차단은 Stage 2 (E2EE) 단계.

-- ============================================================
-- Stage 2 (E2EE) 으로 넘어가기 전 점검
-- ============================================================
-- - 위 정책 적용 후 Postman/curl로 다른 access_token으로 접근 시도 → 403 확인
-- - 로그아웃 상태에서 anon key 만으로 GET /rest/v1/soragodong_data → 빈 배열 또는 401 확인
-- - 본인 access_token으로 GET → 본인 row만 나오는지 확인
