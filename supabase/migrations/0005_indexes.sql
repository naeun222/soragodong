-- ============================================================
-- 소라고동 V4 — DB 인덱스 (100명 대비 query 성능)
-- 사용자 보고 2026-05-01 ultrathink: 옛 0005 = 컬럼 이름 mismatch + 중복 인덱스 (실행 시 ERROR).
--
-- audit 결과:
--   - billing 의 PK column = `user_id` (NOT `auth_user_id`) → PK 자동 인덱스 있어 수동 인덱스 redundant
--   - usage 의 timestamp column = `recorded_at` (NOT `created_at`) + 0002 line 69 에 `idx_usage_user_recorded` 이미 존재
--   - feedback 인덱스 = 0003 line 19 에 `idx_feedback_user` 이미 존재 (같은 column combo)
--   - data (auth_user_id, user_id) 인덱스만 신규 의미 있음 (RLS + V4_USER_ID/backup 분리 query 자주)
--
-- 실행 방법: Supabase Dashboard → SQL Editor → 붙여넣기 → Run
-- 멱등 (IF NOT EXISTS — 이미 있어도 안전).
-- ============================================================

-- 1. soragodong_data — auth_user_id + user_id 복합 (V4_USER_ID / backup / auto_backup / manual_backup 분리)
--    가장 자주 query: select * where auth_user_id=X & user_id=Y (10425 / 10820 / 10831 / ...)
CREATE INDEX IF NOT EXISTS idx_data_auth_user_user
  ON soragodong_data (auth_user_id, user_id);

-- 2. soragodong_billing — `user_id` 가 PRIMARY KEY → PK 자동 B-tree 인덱스 이미 있음. 추가 인덱스 X.
-- 3. soragodong_usage — 0002 의 `idx_usage_user_recorded(user_id, recorded_at DESC)` 이미 있음. 추가 X.
-- 4. soragodong_payments — 0002 의 `idx_payments_user(user_id, created_at DESC)` 이미 있음. 추가 X.
-- 5. soragodong_feedback — 0003 의 `idx_feedback_user(user_id, created_at DESC)` 이미 있음. 추가 X.

-- ============================================================
-- 확인 query (실행 후):
--   SELECT tablename, indexname FROM pg_indexes
--   WHERE tablename LIKE 'soragodong_%' ORDER BY tablename, indexname;
--
-- 기대 결과 (table 별):
--   soragodong_data:       PK + idx_data_auth_user_user (신규)
--   soragodong_billing:    PK (user_id)
--   soragodong_usage:      PK + idx_usage_user_recorded (0002)
--   soragodong_payments:   PK + idx_payments_user (0002) + (불필요 시) provider 인덱스
--   soragodong_feedback:   PK + idx_feedback_user (0003)
-- ============================================================
