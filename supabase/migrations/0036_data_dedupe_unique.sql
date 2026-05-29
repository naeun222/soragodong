-- V4 (사용자 보고 2026-05-30 ultrathink): soragodong_data 중복 row 정리 + (auth_user_id, user_id) UNIQUE.
--
-- 배경 (Disk IO budget 고갈 root cause):
--   saveToCloudNow 의 PATCH 가 `?auth_user_id=eq.X&user_id=eq.me_v4` 필터만 써서 (특정 id 미지정),
--   같은 (auth_user_id, user_id) row 가 2개면 매 저장마다 *둘 다* rewrite → IO 2배.
--   중복 생성 경위 = INSERT race: row 없을 때 saveToCloudNow 가 동시 2회 호출되면 둘 다 'absent' 판정 → 둘 다 POST INSERT.
--   이후 PATCH 가 둘 다 갱신 → 두 row 가 영구 byte-identical (md5 동일) + 매 저장 IO 2배.
--
--   진단 (2026-05-30):
--     어드민 (4ba0a92e…) me_v4 ×2 (각 4.45MB, md5 동일), 3af44d73 me_v4_auto_backup ×2, c472c48a me_v4_manual_backup ×2.
--
-- 이 migration:
--   1) dedup — 각 (auth_user_id, user_id) 그룹에서 updated_at 최신 1개만 보존, 나머지 DELETE (멱등).
--   2) UNIQUE index — (auth_user_id, user_id) 중복 INSERT 를 DB 레벨에서 차단.
--      + 코드 측 saveToCloudNow POST 를 upsert (Prefer: resolution=merge-duplicates, on_conflict=auth_user_id,user_id) 로 전환.
--
-- 주의: cron_snap_YYYY-MM-DD / backup_v5_pre_v6 등은 user_id 가 각각 달라 그룹당 1 row → UNIQUE 안 걸림. 안전.
-- 멱등 (재실행 OK). Supabase Dashboard → SQL Editor 실행. service_role 은 RLS 우회.

-- 1. dedup — 각 (auth_user_id, user_id) 그룹에서 updated_at 최신 1개만 보존.
DELETE FROM soragodong_data t
WHERE EXISTS (
  SELECT 1 FROM soragodong_data t2
  WHERE t2.auth_user_id = t.auth_user_id
    AND t2.user_id = t.user_id
    AND (
      COALESCE(t2.updated_at, 'epoch'::timestamptz) > COALESCE(t.updated_at, 'epoch'::timestamptz)
      OR (COALESCE(t2.updated_at, 'epoch'::timestamptz) = COALESCE(t.updated_at, 'epoch'::timestamptz) AND t2.id > t.id)
    )
);

-- 2. UNIQUE — 중복 INSERT 차단 + POST upsert(on_conflict) 가능.
CREATE UNIQUE INDEX IF NOT EXISTS ux_soragodong_data_auth_user
  ON soragodong_data (auth_user_id, user_id);

-- 검증 쿼리:
--   SELECT auth_user_id, user_id, count(*) c FROM soragodong_data GROUP BY 1,2 HAVING count(*) > 1;  -- 0 rows 기대
--   SELECT indexname FROM pg_indexes WHERE tablename = 'soragodong_data' AND indexname = 'ux_soragodong_data_auth_user';
