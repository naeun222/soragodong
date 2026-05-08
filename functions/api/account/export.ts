// GET /api/account/export — 사용자 본인 cloud 데이터 export (PIPA §35 열람·반출권).
// 사용자 명시 2026-05-08 ultrathink (audit WARN #23): localStorage 만 export 하던 옛 흐름은 cloud 데이터 (다른 device sync / usage 로그) 미포함.
// 신: 본인 cloud 전체 (data + billing + usage 90일 + consent_log + payments) 반출.

import { verifyAuth, unauthorized, jsonResponse, type Env } from '../_lib/auth';

export async function onRequestGet(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context;
  const user = await verifyAuth(request, env);
  if (!user) return unauthorized();

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: 'Supabase env 누락 (서버)' }, 500);
  }

  const userId = user.id;
  const headers = {
    'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
    'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
  };

  const result: any = {
    user_id: userId,
    email: user.email || null,
    exported_at: new Date().toISOString(),
    legal_basis: 'PIPA §35 (정보주체 열람·반출권)',
    notice: '본 export 는 회사 측 cloud 보관 데이터. localStorage 측 데이터는 앱 [설정 → 데이터 export] 별도 진행. 평문 JSON 이라 안전한 곳에 보관 필수.'
  };

  // 1. soragodong_data — 본인 자기관찰 데이터 (E2EE 시 ciphertext, 비활성 시 평문).
  try {
    const r = await fetch(
      `${env.SUPABASE_URL}/rest/v1/soragodong_data?auth_user_id=eq.${userId}&select=*`,
      { headers }
    );
    result.soragodong_data = r.ok ? await r.json() : { error: 'fetch 실패: ' + r.status };
  } catch (e: any) {
    result.soragodong_data = { error: 'throw: ' + (e?.message || e) };
  }

  // 2. soragodong_billing.
  try {
    const r = await fetch(
      `${env.SUPABASE_URL}/rest/v1/soragodong_billing?user_id=eq.${userId}&select=*`,
      { headers }
    );
    result.soragodong_billing = r.ok ? await r.json() : { error: 'fetch 실패: ' + r.status };
  } catch (e: any) {
    result.soragodong_billing = { error: 'throw: ' + (e?.message || e) };
  }

  // 3. soragodong_usage — 90일 내 (전체 시 양 폭주).
  try {
    const cutoff = new Date(Date.now() - 90 * 86400_000).toISOString();
    const r = await fetch(
      `${env.SUPABASE_URL}/rest/v1/soragodong_usage?user_id=eq.${userId}&created_at=gte.${encodeURIComponent(cutoff)}&select=*&order=created_at.desc&limit=10000`,
      { headers }
    );
    result.soragodong_usage = r.ok ? await r.json() : { error: 'fetch 실패: ' + r.status };
    result.soragodong_usage_note = '최근 90일 한정 (PIPA 보유기간 3개월).';
  } catch (e: any) {
    result.soragodong_usage = { error: 'throw: ' + (e?.message || e) };
  }

  // 4. soragodong_payments — 5년 보존 (전자상거래법 §6).
  try {
    const r = await fetch(
      `${env.SUPABASE_URL}/rest/v1/soragodong_payments?user_id=eq.${userId}&select=*&order=created_at.desc`,
      { headers }
    );
    result.soragodong_payments = r.ok ? await r.json() : { error: 'fetch 실패: ' + r.status };
  } catch (e: any) {
    result.soragodong_payments = { error: 'throw: ' + (e?.message || e) };
  }

  // 5. soragodong_consent_log — PIPA 분쟁 증거 (audit WARN #21).
  try {
    const r = await fetch(
      `${env.SUPABASE_URL}/rest/v1/soragodong_consent_log?user_id=eq.${userId}&select=*&order=created_at.desc`,
      { headers }
    );
    result.soragodong_consent_log = r.ok ? await r.json() : { error: 'fetch 실패: ' + r.status };
  } catch (e: any) {
    result.soragodong_consent_log = { error: 'throw: ' + (e?.message || e) };
  }

  // 6. soragodong_feedback — 본인 인앱 피드백.
  try {
    const r = await fetch(
      `${env.SUPABASE_URL}/rest/v1/soragodong_feedback?user_id=eq.${userId}&select=*&order=created_at.desc`,
      { headers }
    );
    result.soragodong_feedback = r.ok ? await r.json() : { error: 'fetch 실패: ' + r.status };
  } catch (e: any) {
    result.soragodong_feedback = { error: 'throw: ' + (e?.message || e) };
  }

  // 다운로드 헤더 — 사용자 직접 저장 흐름.
  return new Response(JSON.stringify(result, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="soragodong_cloud_export_${new Date().toISOString().slice(0, 10)}.json"`
    }
  });
}
