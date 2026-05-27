-- V4 (사용자 명시 2026-05-27 ultrathink): 일정/할 일 알림 서버 push queue.
--
-- 배경: iOS PWA 는 Notification Triggers API (TimestampTrigger) 미지원 + setTimeout 은 앱 켜져 있을 때만 →
--   앱 닫으면 일정 알림이 안 뜸. hook 시스템과 동일한 Web Push (VAPID) / FCM 파이프라인에 일정 알림을 태워
--   브라우저 종료 후에도 OS push 로 fire (진정한 백그라운드 알림).
--
-- hook_push_queue 는 user 당 1행 (PK=user_id) 이라 여러 일정에 못 씀 → 별도 테이블 + UNIQUE(user_id, item_id).
--   item_id = schedule.id ('sched_...') 또는 task.id ('task_...') — user 내 충돌 없음.
--   frontend 가 알림 set/변경 시 upsert, 해제/삭제/완료 시 delete.
--   cron (POST /api/hook/cron-push) 가 hook 처리 후 이 큐도 처리: scheduled_at <= NOW() AND sent_at IS NULL.
--   push_subscription 은 hook_preferences 에서 join (브라우저당 1개 공유). enabled (hook on/off) 와 무관 — 일정 알림은 사용자가 명시 set.

CREATE TABLE IF NOT EXISTS soragodong_schedule_push_queue (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id        UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id        TEXT         NOT NULL,        -- schedule.id / task.id
  title          TEXT         NOT NULL,        -- 알림 제목 (일정명 / ✓ 할 일명)
  body           TEXT         NOT NULL DEFAULT '',  -- 알림 본문 (예: '15분 전')
  scheduled_at   TIMESTAMPTZ  NOT NULL,        -- 발사 시각 (이벤트 시각 - notifyMinutesBefore)
  sent_at        TIMESTAMPTZ  NULL,
  send_attempts  SMALLINT     NOT NULL DEFAULT 0,
  last_error     TEXT         NULL,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT soragodong_sched_push_uniq UNIQUE (user_id, item_id)
);

COMMENT ON TABLE soragodong_schedule_push_queue IS '일정/할 일 알림 서버 push queue — user 당 item_id 마다 1행 (UPSERT).';

-- cron 효율 검색: pending (scheduled_at, sent_at IS NULL).
CREATE INDEX IF NOT EXISTS sched_push_queue_pending_idx
  ON soragodong_schedule_push_queue (scheduled_at)
  WHERE sent_at IS NULL;

ALTER TABLE soragodong_schedule_push_queue ENABLE ROW LEVEL SECURITY;

-- 본인 row 만 CRUD. service_role (cron) 은 RLS 우회 (모든 row 처리).
DROP POLICY IF EXISTS sched_push_self_select ON soragodong_schedule_push_queue;
CREATE POLICY sched_push_self_select ON soragodong_schedule_push_queue
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS sched_push_self_insert ON soragodong_schedule_push_queue;
CREATE POLICY sched_push_self_insert ON soragodong_schedule_push_queue
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS sched_push_self_update ON soragodong_schedule_push_queue;
CREATE POLICY sched_push_self_update ON soragodong_schedule_push_queue
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS sched_push_self_delete ON soragodong_schedule_push_queue;
CREATE POLICY sched_push_self_delete ON soragodong_schedule_push_queue
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- updated_at 자동 갱신.
CREATE OR REPLACE FUNCTION soragodong_sched_push_touch() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sched_push_touch_trg ON soragodong_schedule_push_queue;
CREATE TRIGGER sched_push_touch_trg BEFORE UPDATE ON soragodong_schedule_push_queue
  FOR EACH ROW EXECUTE FUNCTION soragodong_sched_push_touch();
