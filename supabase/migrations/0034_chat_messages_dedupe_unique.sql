-- V4 (사용자 보고 2026-05-26 ultrathink): chat_messages 인접 dupe 청소 + UNIQUE 강제.
--
-- 배경:
--   사용자 보고 — chatArchive 의 in-memory messages 가 162 (실제 81) 인 archive 다수.
--   진단:
--     - DB soragodong_chat_messages: row_count=162, idx 범위 0~80 → 같은 (chapter,idx) 에 두 row 씩.
--     - in-memory same-reference[0,1]=false → 두 번 fetch / 두 번 deserialize (DB 측 dupe row 직접 영향).
--     - meta.messageCount=81 vs messages.length=162 → archive 생성 시점엔 정상. 사후에 두 번째 INSERT.
--
--   Root cause:
--     0033_chat_messages.sql 의 (user_id, chapter_id, idx) 인덱스가 단순 인덱스 (UNIQUE 아님)
--       + _saveChapterMessages 가 멱등 아님 (pre-delete 없이 plain INSERT)
--       + _archiveCurrentChapter fire-and-forget × _backfillChatMessagesToTable race
--       + multi-device 동시 saveState race.
--     → 같은 chapter 에 두 번 호출되면 idx 0~N 가 두 row 씩 박힘 → hydrate 가 그대로 162 메시지 in-memory.
--
-- 본 migration:
--   (1) row_number() 으로 (user_id, chapter_id, idx) 그룹 안 oldest row (created_at ASC) 만 keep — 나머지 삭제.
--   (2) (user_id, chapter_id, idx) UNIQUE constraint 추가 — 이후 두 번째 INSERT 는 23505 (unique_violation) 거부.
--   (3) 클라이언트 측 _saveChapterMessages 멱등화 (pre-delete) 가 짝 — 함께 commit.
--
-- 안전:
--   - dupe pair 는 거의 항상 같은 message (같은 in-memory messages 가 두 번 INSERT).
--     어느 row 를 keep 해도 결과 동등. oldest keep = 가장 처음 박힌 거 우선 (latency 보장).
--   - 청소 후 각 chapter 의 row 수 = meta.messageCount (또는 그 이하 — typing/error/_seed 가 valid 에서 제외됐을 수 있음).
--   - UNIQUE 추가 = idempotent (IF NOT EXISTS 등가 패턴 — 같은 이름 constraint 가 있으면 ALTER 자체 fail. 새 이름이라 OK).
--
-- 검증 (적용 후):
--   -- (a) dupe 없어야 함 (빈 결과)
--   SELECT chapter_id, idx, COUNT(*) FROM soragodong_chat_messages
--     GROUP BY chapter_id, idx HAVING COUNT(*) > 1;
--   -- (b) constraint 표시
--   SELECT conname, contype FROM pg_constraint
--     WHERE conrelid = 'soragodong_chat_messages'::regclass;

BEGIN;

-- (1) 인접 dupe 청소 — (user_id, chapter_id, idx) 그룹 안 oldest 만 keep.
WITH ranked AS (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, chapter_id, idx
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM soragodong_chat_messages
)
DELETE FROM soragodong_chat_messages
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- (2) UNIQUE constraint 추가.
--   같은 이름 constraint 가 이미 있으면 ALTER 가 fail → 안전 재실행 위해 DROP 먼저 시도 (idempotent).
ALTER TABLE soragodong_chat_messages
  DROP CONSTRAINT IF EXISTS chat_messages_unique_user_chapter_idx;

ALTER TABLE soragodong_chat_messages
  ADD CONSTRAINT chat_messages_unique_user_chapter_idx
  UNIQUE (user_id, chapter_id, idx);

COMMIT;
