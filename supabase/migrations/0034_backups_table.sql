-- V4 (사용자 보고 2026-05-22 ultrathink): backup snapshot 별 row 분리.
--
-- 배경:
--   옛 path = manual/auto backup 의 snapshots[] (rolling 10/5) 가 한 row 의 data JSONB.
--   매 backup = entire JSONB rewrite (TOAST page churn). 누적 row size ~7MB+ 시 Postgres
--   statement_timeout (60s) 초과 → backup upsert 500 fail (사용자 보고 2026-05-22).
--
--   진단:
--     manual backup row 의 snapshots 10개 × 각 0.45-1.69MB = 7.16MB.
--     PATCH 시 entire JSONB rewrite + WAL + replication → 60s 초과.
--
-- 이 migration:
--   soragodong_backups 테이블 — snapshot 별 1 row.
--   - 한 user 가 type 별 N row (manual KEEP_N=3, auto KEEP_N=5).
--   - INSERT 1 row + 옛 row DELETE (KEEP_N 보존) — 큰 JSONB rewrite 패턴 폐기.
--   - data jsonb = entire state snapshot (1 snapshot 만, ~0.5-2MB).
--   - chat_messages jsonb = 별도 export (nullable, Phase 1E Step 7 마이그된 사용자는 비어있음).
--
-- 결과:
--   - PATCH 패턴 폐기 → INSERT (가벼움) + DELETE (가벼움).
--   - row 크기 단일 snapshot 으로 묶임 — statement_timeout 위험 X.
--   - rotation = DELETE WHERE ts < oldest_keep (client-side computed).
--
-- 후속 (src/ 코드):
--   Step 1 (이번): table + RLS + index.
--   Step 2: client backup/restore path — 새 테이블 INSERT/SELECT/DELETE wrapper.
--   Step 3: 1회 자동 마이그 — 옛 soragodong_data 의 snapshots[] → 새 테이블 INSERT N (idempotent).
--   Step 4: dual-read 기간 — restore 가 옛 row + 새 테이블 둘 다 list.
--   Step 5: 옛 path 코드 제거 + 옛 row DELETE (마이그 검증 후 별도 PR).

-- 1. 테이블 (idempotent)
CREATE TABLE IF NOT EXISTS soragodong_backups (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id    uuid        NOT NULL,
  backup_type     text        NOT NULL CHECK (backup_type IN ('manual','auto','cron')),
  ts              timestamptz NOT NULL DEFAULT now(),
  note            text,
  state_hash      text,
  app_version     text,
  schema_version  text        NOT NULL DEFAULT 'v6',
  data            jsonb       NOT NULL,
  chat_messages   jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- 2. 인덱스 — type 별 ts desc list (가장 자주 쓰는 query).
CREATE INDEX IF NOT EXISTS idx_backups_user_type_ts
  ON soragodong_backups (auth_user_id, backup_type, ts DESC);

-- 3. unique constraint — 마이그 idempotent 보장 (state_hash + ts 둘 다 같으면 중복).
--    NULL state_hash 는 unique 처리 X (옛 snapshot 마이그 시 state_hash 없는 케이스 → 중복 차단 X).
CREATE UNIQUE INDEX IF NOT EXISTS idx_backups_unique_hash_ts
  ON soragodong_backups (auth_user_id, backup_type, state_hash, ts)
  WHERE state_hash IS NOT NULL;

-- 4. RLS — 본인 row 만 SELECT/INSERT/DELETE. UPDATE 정책 없음 (backup 은 immutable).
ALTER TABLE soragodong_backups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "backups_owner_select" ON soragodong_backups;
DROP POLICY IF EXISTS "backups_owner_insert" ON soragodong_backups;
DROP POLICY IF EXISTS "backups_owner_delete" ON soragodong_backups;

CREATE POLICY "backups_owner_select"
  ON soragodong_backups
  FOR SELECT TO authenticated
  USING (auth.uid()::text = auth_user_id::text);

-- INSERT — client 가 'cron' 못 박게 'manual','auto' 만 허용 (cron 은 service_role 만).
CREATE POLICY "backups_owner_insert"
  ON soragodong_backups
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid()::text = auth_user_id::text
    AND backup_type IN ('manual','auto')
  );

CREATE POLICY "backups_owner_delete"
  ON soragodong_backups
  FOR DELETE TO authenticated
  USING (auth.uid()::text = auth_user_id::text);

-- 검증 쿼리:
--   SELECT schemaname, tablename, policyname, cmd FROM pg_policies
--     WHERE tablename = 'soragodong_backups';
--   SELECT relname, relrowsecurity FROM pg_class WHERE relname = 'soragodong_backups';
--   SELECT count(*) FROM soragodong_backups;  -- 마이그 후 row 수 확인
--
-- 사용자 본인 dashboard SQL Editor 실행. 멱등 (이미 있어도 안전).
-- service_role 은 RLS 우회 (의도 — cron / 마이그 작업).
