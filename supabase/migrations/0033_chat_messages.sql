-- V4 (사용자 명시 2026-05-20 ultrathink): Phase 2 — 챗 메시지 별도 테이블. write amplification 방어.
--
-- 배경:
--   옛 path = 챕터별 raw 메시지가 state.chatArchive[].messages 안 박혀 main row JSONB (soragodong_data)
--   가 모든 saveToCloud 마다 통째 PATCH. 100+ 사용자 + 어드민 (4ba0a92e-...) 가 큰 chatArchive
--   (수십 챕터) 보유 → JSONB UPDATE 60s+ timeout → cascade. 7일 cap 으로 묶어둔 이유도 이거.
--
--   진주 (pearl) 미디어는 이미 같은 철학으로 분리 (0032_pearl_storage) — 챗 메시지도 동일 패턴.
--
-- 이 migration:
--   soragodong_chat_messages 테이블 + (user_id, chapter_id, idx) 인덱스 + RLS (본인 user_id only).
--   - 평문 사용자 = content jsonb 에 {role, content, timestamp, ...} 그대로.
--   - E2EE 사용자  = encrypted_body text (AES-GCM ciphertext base64). content = null.
--   - 한 챕터    = 한 chapter_id, 그 안 메시지들은 idx asc 로 정렬.
--
-- 결과:
--   - main row JSONB = 메타 (id/date/title/messageCount/_hasMessages:true) 만 — 가볍게 유지.
--   - chapter 메시지 = 한 번 insert 후 read-only. 백업/복원 외엔 PATCH X.
--   - 영구 보존해도 main row size 폭주 X (7일 cap 제거 가능).
--
-- 후속 (별도 step, src/ 코드):
--   Step 2: 05-supabase.js helper (_loadChapterMessages / _saveChapterMessages / _deleteChapterMessages)
--   Step 3: _archiveCurrentChapter — write 경로 별도 테이블
--   Step 4: archive 열 때 lazy load
--   Step 5: 기존 사용자 backfill
--   Step 6: pruneOldChatArchive 7일 cap 제거 (휴지통 hard delete 만 유지)
--   Step 7: 백업/복원 (v4 → v5 포맷)
--   Step 8: UI 카피 "7일 뒤 자동 사라짐" → "영구 보관"

-- 1. 테이블 생성 (idempotent).
CREATE TABLE IF NOT EXISTS soragodong_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  chapter_id text NOT NULL,
  idx int NOT NULL,
  content jsonb,
  encrypted_body text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. 인덱스 — chapter 내 메시지 정렬 + 사용자별 chapter 조회.
CREATE INDEX IF NOT EXISTS idx_chat_messages_user_chapter_idx
  ON soragodong_chat_messages (user_id, chapter_id, idx);

-- 3. RLS — 본인 user_id 만 select/insert/delete. UPDATE 정책 없음 (메시지 immutable, 수정 = delete+insert).
ALTER TABLE soragodong_chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chat_messages_owner_select" ON soragodong_chat_messages;
DROP POLICY IF EXISTS "chat_messages_owner_insert" ON soragodong_chat_messages;
DROP POLICY IF EXISTS "chat_messages_owner_delete" ON soragodong_chat_messages;

CREATE POLICY "chat_messages_owner_select"
  ON soragodong_chat_messages
  FOR SELECT TO authenticated
  USING (auth.uid()::text = user_id::text);

CREATE POLICY "chat_messages_owner_insert"
  ON soragodong_chat_messages
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid()::text = user_id::text);

CREATE POLICY "chat_messages_owner_delete"
  ON soragodong_chat_messages
  FOR DELETE TO authenticated
  USING (auth.uid()::text = user_id::text);

-- 검증 쿼리:
--   SELECT schemaname, tablename, policyname, cmd FROM pg_policies
--     WHERE tablename = 'soragodong_chat_messages';
--   SELECT relname, relrowsecurity FROM pg_class WHERE relname = 'soragodong_chat_messages';
--
-- 다른 사용자 access_token 으로 SELECT 시도 → 빈 array (본인 row 아니라 RLS 차단).
-- service_role 은 RLS 우회 (의도 — 백업 / 마이그 작업 시).
