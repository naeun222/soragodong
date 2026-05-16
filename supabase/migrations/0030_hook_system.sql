-- V4 (사용자 명시 2026-05-17 ultrathink): Hook 시스템 Phase B — push subscription + delivery queue.
--
-- hook_preferences: 사용자별 push subscription + 빈도 / 알림 시간 설정.
--   PK = user_id (1 row per user).
--   RLS: 사용자 본인만 SELECT/UPSERT 자기 row.
--   service_role (cron-push) 는 모든 row read 가능.
--
-- hook_push_queue: 다음 push 대기 entry. user 당 latest 1 row (UPSERT).
--   frontend 가 hook 생성 직후 POST → backend 가 user_id 기준 UPSERT.
--   cron 매 분 trigger → scheduled_at <= NOW() AND sent_at IS NULL AND prefs.enabled 인 row 처리.
--   처리 후 sent_at = NOW() (재발사 차단).

-- ═══════════════════════════════════════════════════════════════
-- hook_preferences
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS soragodong_hook_preferences (
  user_id            UUID         PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  frequency          TEXT         NOT NULL DEFAULT 'daily',
  notification_time  SMALLINT     NOT NULL DEFAULT 21,
  push_subscription  JSONB        NULL,
  platform           TEXT         NULL,        -- 'ios-pwa' | 'android-pwa' | 'web-mobile' | 'web-desktop'
  enabled            BOOLEAN      NOT NULL DEFAULT true,
  last_pushed_at     TIMESTAMPTZ  NULL,
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT soragodong_hook_pref_freq_chk
    CHECK (frequency IN ('daily', 'every-other-day', 'thrice-week', 'off')),
  CONSTRAINT soragodong_hook_pref_time_chk
    CHECK (notification_time >= 0 AND notification_time <= 23)
);

COMMENT ON TABLE soragodong_hook_preferences IS 'Hook 시스템 사용자 prefs — push subscription + 빈도/시간.';
COMMENT ON COLUMN soragodong_hook_preferences.push_subscription IS 'PushSubscription.toJSON() 결과 — endpoint + keys.';

ALTER TABLE soragodong_hook_preferences ENABLE ROW LEVEL SECURITY;

-- 본인 row 만 SELECT/UPSERT.
DROP POLICY IF EXISTS hook_pref_self_select ON soragodong_hook_preferences;
CREATE POLICY hook_pref_self_select ON soragodong_hook_preferences
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS hook_pref_self_insert ON soragodong_hook_preferences;
CREATE POLICY hook_pref_self_insert ON soragodong_hook_preferences
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS hook_pref_self_update ON soragodong_hook_preferences;
CREATE POLICY hook_pref_self_update ON soragodong_hook_preferences
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- updated_at 자동 갱신 trigger.
CREATE OR REPLACE FUNCTION soragodong_hook_pref_touch() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS hook_pref_touch_trg ON soragodong_hook_preferences;
CREATE TRIGGER hook_pref_touch_trg BEFORE UPDATE ON soragodong_hook_preferences
  FOR EACH ROW EXECUTE FUNCTION soragodong_hook_pref_touch();

-- ═══════════════════════════════════════════════════════════════
-- hook_push_queue — latest 1 entry per user (PK = user_id).
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS soragodong_hook_push_queue (
  user_id        UUID         PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  hook_id        TEXT         NOT NULL,
  body           TEXT         NOT NULL,
  user_name      TEXT         NULL,         -- push title 호명 (받침 처리는 SW 안)
  scheduled_at   TIMESTAMPTZ  NOT NULL,
  sent_at        TIMESTAMPTZ  NULL,
  send_attempts  SMALLINT     NOT NULL DEFAULT 0,
  last_error     TEXT         NULL,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE soragodong_hook_push_queue IS 'Hook push delivery queue — user 당 latest 1 row (UPSERT).';

-- cron 가 효율 검색: scheduled_at + sent_at 인덱스.
CREATE INDEX IF NOT EXISTS hook_push_queue_pending_idx
  ON soragodong_hook_push_queue (scheduled_at)
  WHERE sent_at IS NULL;

ALTER TABLE soragodong_hook_push_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hook_queue_self_select ON soragodong_hook_push_queue;
CREATE POLICY hook_queue_self_select ON soragodong_hook_push_queue
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS hook_queue_self_insert ON soragodong_hook_push_queue;
CREATE POLICY hook_queue_self_insert ON soragodong_hook_push_queue
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS hook_queue_self_update ON soragodong_hook_push_queue;
CREATE POLICY hook_queue_self_update ON soragodong_hook_push_queue
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS hook_queue_self_delete ON soragodong_hook_push_queue;
CREATE POLICY hook_queue_self_delete ON soragodong_hook_push_queue
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION soragodong_hook_queue_touch() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS hook_queue_touch_trg ON soragodong_hook_push_queue;
CREATE TRIGGER hook_queue_touch_trg BEFORE UPDATE ON soragodong_hook_push_queue
  FOR EACH ROW EXECUTE FUNCTION soragodong_hook_queue_touch();
