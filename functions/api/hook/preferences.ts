// Hook preferences — PUT/GET.
// 사용자 명시 2026-05-17 Phase B.
//
// PUT  /api/hook/preferences — 본인 user_id 기준 upsert (frequency / notification_time / push_subscription / platform / enabled).
// GET  /api/hook/preferences — 본인 prefs 반환.

import { verifyAuth, unauthorized, jsonResponse, type Env } from '../_lib/auth';

type PrefsBody = {
  frequency?: 'daily' | 'every-other-day' | 'thrice-week' | 'off';
  notification_time?: number;
  push_subscription?: any | null;  // PushSubscription JSON or null (unsubscribe)
  platform?: string | null;
  enabled?: boolean;
};

const VALID_FREQ = ['daily', 'every-other-day', 'thrice-week', 'off'];

async function _supabaseUpsert(env: Env, userId: string, body: PrefsBody): Promise<{ ok: boolean; status?: number; error?: string }> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, error: 'supabase env 누락' };
  }
  // Build row partially — undefined 필드는 upsert 시 SQL default / 기존 값 보존 위해 OMIT.
  const row: any = { user_id: userId };
  if (typeof body.frequency === 'string' && VALID_FREQ.includes(body.frequency)) row.frequency = body.frequency;
  if (typeof body.notification_time === 'number' && body.notification_time >= 0 && body.notification_time <= 23) {
    row.notification_time = Math.floor(body.notification_time);
  }
  if (body.push_subscription !== undefined) row.push_subscription = body.push_subscription;  // null = unsubscribe
  if (body.platform !== undefined) row.platform = body.platform || null;
  if (typeof body.enabled === 'boolean') row.enabled = body.enabled;

  const resp = await fetch(`${env.SUPABASE_URL}/rest/v1/soragodong_hook_preferences?on_conflict=user_id`, {
    method: 'POST',
    headers: {
      'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify(row),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    return { ok: false, status: resp.status, error: text.slice(0, 300) };
  }
  return { ok: true };
}

async function _supabaseSelect(env: Env, userId: string): Promise<any | null> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return null;
  const resp = await fetch(
    `${env.SUPABASE_URL}/rest/v1/soragodong_hook_preferences?user_id=eq.${userId}&select=frequency,notification_time,push_subscription,platform,enabled,last_pushed_at`,
    { headers: { 'apikey': env.SUPABASE_SERVICE_ROLE_KEY, 'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` } }
  );
  if (!resp.ok) return null;
  const arr = await resp.json().catch(() => []);
  return Array.isArray(arr) && arr[0] ? arr[0] : null;
}

export async function onRequestPut(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context;
  const user = await verifyAuth(request, env);
  if (!user) return unauthorized();

  let body: PrefsBody;
  try { body = await request.json(); }
  catch { return jsonResponse({ ok: false, error: 'invalid JSON' }, 400); }

  // platform whitelist
  // V4 (사용자 명시 2026-05-18 ultrathink): Capacitor native push (FCM) — capacitor-android / capacitor-ios 추가.
  if (typeof body.platform === 'string') {
    const valid = ['ios-pwa', 'android-pwa', 'web-mobile', 'web-desktop', 'capacitor-android', 'capacitor-ios'];
    if (!valid.includes(body.platform)) body.platform = null;
  }

  const r = await _supabaseUpsert(env, user.id, body);
  if (!r.ok) {
    return jsonResponse({ ok: false, error: r.error, status: r.status }, 500);
  }
  return jsonResponse({ ok: true });
}

export async function onRequestGet(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context;
  const user = await verifyAuth(request, env);
  if (!user) return unauthorized();

  const prefs = await _supabaseSelect(env, user.id);
  return jsonResponse({ ok: true, prefs: prefs || null });
}
