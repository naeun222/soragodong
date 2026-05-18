-- V4 (사용자 명시 2026-05-18 ultrathink): Phase 1 — Pearl 미디어 Storage 마이그.
--
-- 배경: 사용자 본인 main row JSONB 가 영상/사진 dataURL 누적으로 4MB+ → JSONB UPDATE 60s+ timeout → cascade.
--   Twitter/Instagram 패턴: 메타데이터만 DB, 미디어는 Object Storage (Supabase Storage = S3 compatible).
--
-- 이 migration: private bucket 'pearls' + RLS — auth_user_id 매칭 파일만 접근 가능.
--   - 파일 경로 패턴: '<auth_user_id>/<pearl_id>_<kind>.bin' (kind = video / photo / video_thumbnail).
--   - 파일 내용 = client 에서 E2EE 마스터키로 암호화된 opaque blob — 회사도 평문 못 봄 (E2EE spec 유지).
--   - 사용자별 sub-folder: auth.uid()::text 매칭. 다른 사용자 파일 접근 X.
--
-- Phase 후속 (별도 task):
--   1B: 마이그 tool (settings 안 button) — 옛 pearl 의 dataURL → Storage 업로드 + 메타에 key 만 남김.
--   1C: capture flow 변경 — 새 진주는 dataURL 대신 Storage 직접 업로드.
--   1D: render flow — pearl render 가 dataURL 옛 path + Storage 신 path 둘 다 지원.

-- 1. Bucket 생성 (idempotent).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'pearls',
  'pearls',
  false,  -- private — Bearer auth 필요.
  52428800,  -- 50MB per file. 영상 진주 한 개당 한도.
  ARRAY['application/octet-stream']  -- E2EE blob = opaque bytes. 다른 mime 차단.
)
ON CONFLICT (id) DO NOTHING;

-- 2. RLS policy — Dashboard UI 에서 작성 (SQL Editor 권한 부족).
--
--   사용자 보고 2026-05-18: SQL Editor 에서 CREATE POLICY ON storage.objects 실행 시
--     ERROR: 42501: must be owner of relation objects
--   원인: storage.objects 의 owner 가 supabase_storage_admin role 인데
--     SQL Editor 의 default role (postgres) 이 owner 가 아니라 권한 부족.
--   해결: Supabase Dashboard → Storage → pearls bucket → Policies tab → New policy.
--     템플릿 "Give users access to a folder named as their UID" 가 이 use case 와 일치.
--     또는 4개 (SELECT/INSERT/UPDATE/DELETE) 수동 작성:
--
--     [SELECT / UPDATE / DELETE USING]
--       bucket_id = 'pearls' AND (storage.foldername(name))[1] = auth.uid()::text
--
--     [INSERT / UPDATE WITH CHECK]
--       bucket_id = 'pearls' AND (storage.foldername(name))[1] = auth.uid()::text
--
--     Target roles: authenticated.
--
--   효과: 파일 경로 첫 segment = auth.uid()::text 강제. 다른 사용자 폴더 접근 X.
--   Storage 운영자도 client master key 없이는 파일 내용 (encrypted blob) 복호화 불가 (E2EE 유지).
--
--   ▼ 옛 SQL (Dashboard UI 적용 후 참고용 — SQL Editor 에서 실행 X) ▼
--
--   DROP POLICY IF EXISTS "pearls_owner_select" ON storage.objects;
--   DROP POLICY IF EXISTS "pearls_owner_insert" ON storage.objects;
--   DROP POLICY IF EXISTS "pearls_owner_update" ON storage.objects;
--   DROP POLICY IF EXISTS "pearls_owner_delete" ON storage.objects;
--
--   CREATE POLICY "pearls_owner_select"
--     ON storage.objects FOR SELECT TO authenticated
--     USING (bucket_id = 'pearls' AND (storage.foldername(name))[1] = auth.uid()::text);
--   CREATE POLICY "pearls_owner_insert"
--     ON storage.objects FOR INSERT TO authenticated
--     WITH CHECK (bucket_id = 'pearls' AND (storage.foldername(name))[1] = auth.uid()::text);
--   CREATE POLICY "pearls_owner_update"
--     ON storage.objects FOR UPDATE TO authenticated
--     USING (bucket_id = 'pearls' AND (storage.foldername(name))[1] = auth.uid()::text);
--   CREATE POLICY "pearls_owner_delete"
--     ON storage.objects FOR DELETE TO authenticated
--     USING (bucket_id = 'pearls' AND (storage.foldername(name))[1] = auth.uid()::text);
