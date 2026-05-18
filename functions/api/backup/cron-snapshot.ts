// POST /api/backup/cron-snapshot
// V4 (사용자 명시 2026-05-18) — 새벽 4시 자동 백업 cron (서버 측). 모든 사용자.
//
// 동작:
//   1) 외부 cron (GitHub Actions `.github/workflows/cron-backup.yml`) 가 매일 UTC 19:00 = Korea 04:00 fire.
//   2) 헤더 X-Cron-Secret 검증 (기존 CRON_SECRET env 재사용 — billing crons 와 같음).
//   3) soragodong_data 의 main row (user_id='me_v4') 들 조회. updated_at desc + limit 50 (Cloudflare Pages Functions wall-time 보호).
//   4) 각 사용자별:
//      a. 오늘자 snap row (user_id='cron_snap_YYYY-MM-DD') 이미 있으면 skip — idempotent.
//      b. 가장 최근 snap row 의 main_updated_at 비교 — main row updated_at 동일 (변경 없음) 이면 skip.
//      c. 아니면 새 snap row INSERT.
//      d. 30일 전 snap row 들 DELETE (retention).
//
// 데이터 처리:
//   - main row 의 data JSONB 는 E2EE blob (_encryptedBody) — 서버 복호화 X. opaque blob 그대로 복사.
//   - 클라이언트 wipe / 실수 reset / 디바이스 손실 후 복구 = 사용자가 비밀번호 + cron_snap row 의 _encryptedBody 로 복호화.
//   - 클라이언트 측 runAutoBackupIfNeeded (32-billing/13-auto-backup.js) 와 독립 — 그건 sanitized + 평문 vs 이건 raw encrypted.
//
// 보안: service_role_key 만 사용 (RLS bypass). 사용자별 분리 — auth_user_id 매칭만 정확하면 cross-user 누설 X.
//
// 비용: Anthropic / AI 호출 X. Supabase request 만 (사용자 50명 기준 ~150 queries/cron).

import { jsonResponse, type Env } from '../_lib/auth';

const MAX_BATCH = 50;
const SNAP_RETENTION_DAYS = 30;
const MAIN_USER_ID = 'me_v4';
const SNAP_USER_ID_PREFIX = 'cron_snap_';

interface MainRow {
  auth_user_id: string;
  data: any;
  updated_at: string;
}

export async function onRequestPost(context: {
  request: Request;
  env: Env;
}): Promise<Response> {
  const { request, env } = context;

  // 인증 — CRON_SECRET 헤더 (billing crons 와 동일 env 재사용).
  const cronSecret = (env as any).CRON_SECRET;
  if (!cronSecret) {
    return jsonResponse({ error: 'CRON_SECRET env 미설정' }, 500);
  }
  const provided = request.headers.get('x-cron-secret') || '';
  if (provided !== cronSecret) {
    return jsonResponse({ error: 'unauthorized' }, 401);
  }

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: 'supabase env 미설정' }, 500);
  }

  // pagination — 큰 사용자 베이스 대응 (offset query param).
  let offset = 0;
  try {
    const body = await request.json().catch(() => ({})) as any;
    if (typeof body?.offset === 'number' && body.offset >= 0) offset = body.offset;
  } catch {}

  const todayK = _utcDateKey(new Date());
  const snapUserId = SNAP_USER_ID_PREFIX + todayK;
  const retentionCutoffK = _utcDateKey(new Date(Date.now() - SNAP_RETENTION_DAYS * 86400000));
  const retentionCutoffUserId = SNAP_USER_ID_PREFIX + retentionCutoffK;

  // 1. main rows fetch.
  let mainRows: MainRow[] = [];
  try {
    const url = `${env.SUPABASE_URL}/rest/v1/soragodong_data?` +
      `user_id=eq.${encodeURIComponent(MAIN_USER_ID)}&` +
      `select=auth_user_id,data,updated_at&` +
      `order=updated_at.desc&` +
      `limit=${MAX_BATCH}&offset=${offset}`;
    const resp = await fetch(url, {
      headers: {
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
      }
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      return jsonResponse({ error: `main rows fetch ${resp.status}: ${text.slice(0, 200)}` }, 500);
    }
    mainRows = await resp.json();
  } catch (e: any) {
    return jsonResponse({ error: 'main rows throw: ' + (e?.message || e) }, 500);
  }

  if (mainRows.length === 0) {
    return jsonResponse({ ok: true, offset, processed: 0, skipped: 0, errors: [], hasMore: false });
  }

  let processed = 0;
  let skipped = 0;
  const errors: Array<{ auth_user_id: string; error: string }> = [];

  for (const row of mainRows) {
    if (!row.auth_user_id || !row.data) {
      skipped++;
      continue;
    }
    try {
      // 2a. 오늘자 snap row 이미 있으면 skip (idempotent — 같은 cron 이 재시도 / 두 번 fire 케이스).
      const existsResp = await fetch(
        `${env.SUPABASE_URL}/rest/v1/soragodong_data?` +
          `auth_user_id=eq.${row.auth_user_id}&` +
          `user_id=eq.${encodeURIComponent(snapUserId)}&` +
          `select=id&limit=1`,
        {
          headers: {
            'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
          }
        }
      );
      if (existsResp.ok) {
        const existsRows = await existsResp.json();
        if (existsRows.length > 0) {
          skipped++;
          continue;
        }
      }

      // 2b. 가장 최근 snap row 의 main_updated_at 비교 — 변경 없으면 skip (저장 공간 / DB 부하 절약).
      const latestSnapResp = await fetch(
        `${env.SUPABASE_URL}/rest/v1/soragodong_data?` +
          `auth_user_id=eq.${row.auth_user_id}&` +
          `user_id=like.${encodeURIComponent(SNAP_USER_ID_PREFIX + '%')}&` +
          `select=data&order=user_id.desc&limit=1`,
        {
          headers: {
            'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
          }
        }
      );
      if (latestSnapResp.ok) {
        const latestRows = await latestSnapResp.json();
        if (latestRows.length > 0 && latestRows[0]?.data?.main_updated_at === row.updated_at) {
          skipped++;
          continue;
        }
      }

      // 2c. 새 snap row INSERT.
      const snapData = {
        snap_at: new Date().toISOString(),
        main_updated_at: row.updated_at,
        data: row.data
      };
      const insertResp = await fetch(`${env.SUPABASE_URL}/rest/v1/soragodong_data`, {
        method: 'POST',
        headers: {
          'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          auth_user_id: row.auth_user_id,
          user_id: snapUserId,
          data: snapData
        })
      });
      if (!insertResp.ok) {
        const text = await insertResp.text().catch(() => '');
        errors.push({ auth_user_id: row.auth_user_id, error: `insert ${insertResp.status}: ${text.slice(0, 200)}` });
        continue;
      }

      // 2d. retention — 30일 전 snap row 들 DELETE.
      //   user_id 가 'cron_snap_YYYY-MM-DD' 라 string 비교가 곧 시간순. 'cron_snap_<cutoff>' 보다 작으면 prune.
      //   best-effort — 실패해도 다음 cron 이 다시 시도.
      try {
        await fetch(
          `${env.SUPABASE_URL}/rest/v1/soragodong_data?` +
            `auth_user_id=eq.${row.auth_user_id}&` +
            `user_id=like.${encodeURIComponent(SNAP_USER_ID_PREFIX + '%')}&` +
            `user_id=lt.${encodeURIComponent(retentionCutoffUserId)}`,
          {
            method: 'DELETE',
            headers: {
              'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
              'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
              'Prefer': 'return=minimal'
            }
          }
        );
      } catch (e: any) {
        console.warn('[cron-snapshot] prune throw (best-effort):', row.auth_user_id, e?.message);
      }

      processed++;
    } catch (e: any) {
      errors.push({ auth_user_id: row.auth_user_id, error: String(e?.message || e).slice(0, 200) });
    }
  }

  return jsonResponse({
    ok: true,
    offset,
    todayK,
    processed,
    skipped,
    errors_count: errors.length,
    errors: errors.slice(0, 10),  // 상위 10개만 log 절약
    hasMore: mainRows.length === MAX_BATCH
  });
}

// UTC 기준 YYYY-MM-DD — cron 이 UTC 19:00 fire 하므로 UTC 기준이면 매 cron 마다 새 dateKey 가 자연.
//   (Korea 4AM = UTC 19:00. 같은 UTC date 안 cron 이 fire.)
function _utcDateKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}
