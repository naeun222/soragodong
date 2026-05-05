// GET /api/admin/portone-info — admin only. PortOne V2 API 통해 본인 store / channel 정보 조회.
// 사용자 명시 2026-05-06: PortOne Store ID 찾기 도구. PORTONE_STORE_ID 가 KG이니시스 MID 형식이라 결제창
// "storeId is not correct" 에러. 진짜 V2 Store ID 는 PortOne API 의 store / channel 응답에서 추출.

import { verifyAuth, unauthorized, jsonResponse, type Env } from '../_lib/auth';

interface AdminEnv extends Env {
  ADMIN_USER_ID?: string;
}

const PORTONE_API_BASE = 'https://api.portone.io';

export async function onRequestGet(context: { request: Request; env: AdminEnv }): Promise<Response> {
  const { request, env } = context;
  const user = await verifyAuth(request, env);
  if (!user) return unauthorized();

  if (!env.ADMIN_USER_ID || user.id !== env.ADMIN_USER_ID) {
    return jsonResponse({ error: '관리자 권한 필요' }, 403);
  }

  if (!env.PORTONE_API_KEY_V2) {
    return jsonResponse({ error: 'PORTONE_API_KEY_V2 env 미설정' }, 500);
  }

  // PortOne V2 = "GET /v2/payments/{paymentId}" 처럼 store-scoped. /stores 같은 list endpoint 가 명시 X.
  // 대신 channel list 로 시도 → 응답에 storeId 포함. 안 되면 에러로 다른 단서.
  const probes: { name: string; url: string }[] = [
    { name: 'channels', url: `${PORTONE_API_BASE}/channels` },
    { name: 'channel-groups', url: `${PORTONE_API_BASE}/channel-groups` },
    { name: 'stores', url: `${PORTONE_API_BASE}/stores` }
  ];

  const results: any = {};
  for (const probe of probes) {
    try {
      const resp = await fetch(probe.url, {
        headers: {
          'Authorization': `PortOne ${env.PORTONE_API_KEY_V2}`,
          'Content-Type': 'application/json'
        }
      });
      const text = await resp.text();
      let data: any;
      try { data = JSON.parse(text); } catch { data = text; }
      results[probe.name] = { status: resp.status, ok: resp.ok, data };
    } catch (e: any) {
      results[probe.name] = { error: e?.message || String(e) };
    }
  }

  return jsonResponse({
    ok: true,
    note: 'PortOne V2 API probe — Store ID 가 응답 안에 포함되어 있을 거야 (channels / channel-groups / stores 중 하나).',
    probes: results
  });
}
