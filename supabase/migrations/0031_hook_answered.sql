-- V4 (사용자 명시 2026-05-17 ultrathink): Hook 옵션 A — pull 패턴 / iOS PWA push 안 받아도 fetch 로 카드 표시.
--
-- 기존 hook_push_queue 는 PK=user_id, push 발사 후 sent_at 만 박힘.
-- iOS PWA 사용자 push 못 받아도 backend row 는 있음 → frontend 가 fetch 해서 카드 표시.
-- 답변 mark = answered_at. 통계용 last_displayed_at.
--
-- 비-파괴적 migration — ADD COLUMN IF NOT EXISTS.

ALTER TABLE soragodong_hook_push_queue
  ADD COLUMN IF NOT EXISTS answered_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS last_displayed_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN soragodong_hook_push_queue.answered_at IS
  'Hook 답변 시점 — frontend 가 사용자 응답 (chat send) 시 PATCH. NULL = 미답변 → pending 으로 fetch.';

COMMENT ON COLUMN soragodong_hook_push_queue.last_displayed_at IS
  'Frontend pull 패턴 — pending fetch 시 mark. 통계/디버그용 (필수 X).';

-- pending 빠른 검색: sent_at + answered_at IS NULL 인덱스 (옵션, user 당 1 row 라 효율 영향 미미).
CREATE INDEX IF NOT EXISTS hook_push_queue_pending_unanswered_idx
  ON soragodong_hook_push_queue (user_id, sent_at)
  WHERE sent_at IS NOT NULL AND answered_at IS NULL;
