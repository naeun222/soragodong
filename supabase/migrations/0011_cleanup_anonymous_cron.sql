-- ============================================================
-- 소라고동 V4 — 0011 미활동 anonymous 사용자 자동 정리 cron
-- 사용자 명시 2026-05-05: 3일 미활동 anonymous 사용자 매일 자동 삭제 (Free tier MAU 보호).
--
-- 의존: 0010_guest_tier.sql 의 cleanup_idle_anonymous_users RPC
--
-- 실행 방법:
--   1) Supabase Dashboard → Database → Extensions → "pg_cron" 검색 → Enable
--   2) 이 SQL 을 SQL Editor 에 붙여넣기 → Run
--   3) 검증: SELECT * FROM cron.job;  (작업 등록 확인)
--
-- 멱등 (cron.unschedule + cron.schedule 패턴 — 재실행 안전).
-- ============================================================

-- pg_cron extension 활성화 (Dashboard 에서도 가능, SQL 로도 가능)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 기존 동일 이름 작업 있으면 제거 (재실행 안전)
SELECT cron.unschedule('cleanup-idle-anonymous-daily')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-idle-anonymous-daily');

-- 매일 KST 새벽 4시 = UTC 19:00 (전날) 실행. cron 표현은 UTC 기준.
-- 매일 19:00 UTC = 매일 KST 04:00 (다음 날) — 4AM cutoff 와 동일 시각.
SELECT cron.schedule(
  'cleanup-idle-anonymous-daily',
  '0 19 * * *',
  $$ SELECT cleanup_idle_anonymous_users(3); $$
);

-- 수동 trigger (테스트용):
--   SELECT cleanup_idle_anonymous_users(3);
--
-- 작업 상태 확인:
--   SELECT jobid, jobname, schedule, command, active FROM cron.job;
--
-- 실행 이력 확인:
--   SELECT job_pid, status, return_message, start_time
--   FROM cron.job_run_details
--   WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'cleanup-idle-anonymous-daily')
--   ORDER BY start_time DESC LIMIT 10;
--
-- 작업 일시 정지:
--   SELECT cron.unschedule('cleanup-idle-anonymous-daily');
-- ============================================================
