// Hook push cron — POST /api/hook/cron-push.
// 사용자 명시 2026-05-17 Phase B.
//
// 외부 cron 서비스 (cron-job.org / GitHub Actions) 가 매 분 호출. X-Cron-Secret 헤더 인증.
//
// 동작:
//   1) hook_push_queue 에서 sent_at IS NULL AND scheduled_at <= NOW() 인 row 가져옴 (max 50, wall-time 보호)
//   2) 각 row 마다 hook_preferences join → enabled=true AND push_subscription IS NOT NULL 인지 확인
//   3) 통과 시 sendWebPush — 성공 시 sent_at=NOW() + prefs.last_pushed_at=NOW(). 실패 시 last_error 기록 + send_attempts++.
//   4) subscription gone (404/410) 시 prefs.push_subscription=NULL + queue.sent_at=NOW() (재시도 X).
//   5) send_attempts >= 3 면 강제 sent_at=NOW() (영구 실패 가드).

import { jsonResponse, type Env } from '../_lib/auth';
import { sendWebPush, type WebPushSubscription, type WebPushEnv } from '../_lib/web-push';

const MAX_BATCH = 50;
const MAX_ATTEMPTS = 3;

interface CronEnv extends Env {
  HOOK_CRON_SECRET?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_CONTACT_EMAIL?: string;
}

interface QueueRow {
  user_id: string;
  hook_id: string;
  body: string;
  user_name: string | null;
  scheduled_at: string;
  send_attempts: number;
}

interface PrefsRow {
  user_id: string;
  push_subscription: WebPushSubscription | null;
  enabled: boolean;
}

async function _fetchPending(env: CronEnv): Promise<QueueRow[]> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return [];
  const nowIso = new Date().toISOString();
  const url = `${env.SUPABASE_URL}/rest/v1/soragodong_hook_push_queue` +
    `?select=user_id,hook_id,body,user_name,scheduled_at,send_attempts` +
    `&sent_at=is.null&scheduled_at=lte.${encodeURIComponent(nowIso)}` +
    `&order=scheduled_at.asc&limit=${MAX_BATCH}`;
  const resp = await fetch(url, {
    headers: {
      'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  if (!resp.ok) {
    console.warn('[hook cron] fetch pending', resp.status);
    return [];
  }
  return (await resp.json().catch(() => [])) as QueueRow[];
}

async function _fetchPrefs(env: CronEnv, userIds: string[]): Promise<Map<string, PrefsRow>> {
  const out = new Map<string, PrefsRow>();
  if (!userIds.length || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return out;
  const ids = userIds.map(id => `"${id}"`).join(',');
  const url = `${env.SUPABASE_URL}/rest/v1/soragodong_hook_preferences` +
    `?select=user_id,push_subscription,enabled&user_id=in.(${ids})`;
  const resp = await fetch(url, {
    headers: {
      'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  if (!resp.ok) return out;
  const arr = (await resp.json().catch(() => [])) as PrefsRow[];
  for (const p of arr) out.set(p.user_id, p);
  return out;
}

async function _markSent(env: CronEnv, userId: string, error: string | null): Promise<void> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return;
  const patch: any = { sent_at: new Date().toISOString() };
  if (error) patch.last_error = error.slice(0, 500);
  await fetch(`${env.SUPABASE_URL}/rest/v1/soragodong_hook_push_queue?user_id=eq.${userId}`, {
    method: 'PATCH',
    headers: {
      'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify(patch),
  }).catch(() => {});
}

async function _markAttemptFail(env: CronEnv, userId: string, attempts: number, error: string): Promise<void> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return;
  const patch: any = { send_attempts: attempts + 1, last_error: error.slice(0, 500) };
  if (attempts + 1 >= MAX_ATTEMPTS) patch.sent_at = new Date().toISOString();  // 영구 실패 마킹
  await fetch(`${env.SUPABASE_URL}/rest/v1/soragodong_hook_push_queue?user_id=eq.${userId}`, {
    method: 'PATCH',
    headers: {
      'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify(patch),
  }).catch(() => {});
}

async function _clearInvalidSubscription(env: CronEnv, userId: string): Promise<void> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return;
  await fetch(`${env.SUPABASE_URL}/rest/v1/soragodong_hook_preferences?user_id=eq.${userId}`, {
    method: 'PATCH',
    headers: {
      'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify({ push_subscription: null }),
  }).catch(() => {});
}

async function _touchLastPushed(env: CronEnv, userId: string): Promise<void> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return;
  await fetch(`${env.SUPABASE_URL}/rest/v1/soragodong_hook_preferences?user_id=eq.${userId}`, {
    method: 'PATCH',
    headers: {
      'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify({ last_pushed_at: new Date().toISOString() }),
  }).catch(() => {});
}

export async function onRequestPost(context: { request: Request; env: CronEnv }): Promise<Response> {
  const { request, env } = context;
  const cronSecret = request.headers.get('X-Cron-Secret') || '';
  if (!env.HOOK_CRON_SECRET || cronSecret !== env.HOOK_CRON_SECRET) {
    return jsonResponse({ ok: false, error: 'unauthorized' }, 401);
  }
  if (!env.VAPID_PRIVATE_KEY || !env.VAPID_PUBLIC_KEY) {
    return jsonResponse({ ok: false, error: 'VAPID env 누락 — push 발사 불가' }, 500);
  }

  const vapidEnv: WebPushEnv = {
    VAPID_PRIVATE_KEY: env.VAPID_PRIVATE_KEY,
    VAPID_PUBLIC_KEY: env.VAPID_PUBLIC_KEY,
    VAPID_CONTACT_EMAIL: env.VAPID_CONTACT_EMAIL || 'mailto:noreply@soragodong.com',
  };

  const pending = await _fetchPending(env);
  if (pending.length === 0) return jsonResponse({ ok: true, processed: 0 });

  const prefsMap = await _fetchPrefs(env, pending.map(q => q.user_id));

  let sent = 0, skipped = 0, failed = 0, gone = 0;
  for (const q of pending) {
    const prefs = prefsMap.get(q.user_id);
    if (!prefs || !prefs.enabled || !prefs.push_subscription) {
      await _markSent(env, q.user_id, 'no-subscription-or-disabled');
      skipped++; continue;
    }
    const payload = JSON.stringify({
      hookId: q.hook_id,
      body: q.body,
      userName: q.user_name || '',
    });
    const r = await sendWebPush(prefs.push_subscription, payload, vapidEnv, { urgency: 'normal', ttl: 86400 });
    if (r.ok) {
      await _markSent(env, q.user_id, null);
      await _touchLastPushed(env, q.user_id);
      sent++;
    } else if (r.subscriptionGone) {
      await _clearInvalidSubscription(env, q.user_id);
      await _markSent(env, q.user_id, 'subscription-gone');
      gone++;
    } else {
      await _markAttemptFail(env, q.user_id, q.send_attempts || 0, r.error || ('status-' + r.status));
      failed++;
    }
  }

  return jsonResponse({ ok: true, processed: pending.length, sent, skipped, failed, subscription_gone: gone });
}

// GET — health check (no-auth)
export async function onRequestGet(): Promise<Response> {
  return jsonResponse({ ok: true, service: 'hook-cron-push' });
}
