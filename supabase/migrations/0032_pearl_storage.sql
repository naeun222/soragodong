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

-- 2. RLS policy — auth_user_id 매칭 파일만.
--    경로 첫 segment = auth.uid()::text 강제. 다른 사용자 파일 read/write X.
DROP POLICY IF EXISTS "pearls_owner_select" ON storage.objects;
DROP POLICY IF EXISTS "pearls_owner_insert" ON storage.objects;
DROP POLICY IF EXISTS "pearls_owner_update" ON storage.objects;
DROP POLICY IF EXISTS "pearls_owner_delete" ON storage.objects;

CREATE POLICY "pearls_owner_select"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'pearls'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "pearls_owner_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'pearls'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "pearls_owner_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'pearls'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "pearls_owner_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'pearls'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

COMMENT ON POLICY "pearls_owner_select" ON storage.objects IS
  'V4 Phase 1: 사용자 자기 폴더 (auth.uid()/...) 만 read.';
