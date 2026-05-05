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

  // PortOne V2 = list endpoint 명시 X. GraphQL 또는 console 전용. 여러 URL 시도해서 응답 fingerprint 로 추정.
  // /payments/{fakeId} = 404 응답에 storeId 단서 있을 수 있음.
  const probes: { name: string; url: string; method?: string }[] = [
    { name: 'payments-fake-404', url: `${PORTONE_API_BASE}/payments/probe-${Date.now()}` },
    { name: 'auth-me', url: `${PORTONE_API_BASE}/users/me` },
    { name: 'identity-verifications', url: `${PORTONE_API_BASE}/identity-verifications/probe` },
    { name: 'billing-keys-list', url: `${PORTONE_API_BASE}/billing-keys` },
    { name: 'platforms', url: `${PORTONE_API_BASE}/platforms` },
    // V1 호환 endpoint (graphql 도 가능)
    { name: 'graphql', url: 'https://api.portone.io/graphql', method: 'POST' }
  ];

  const results: any = {};
  for (const probe of probes) {
    try {
      const init: RequestInit = {
        method: probe.method || 'GET',
        headers: {
          'Authorization': `PortOne ${env.PORTONE_API_KEY_V2}`,
          'Content-Type': 'application/json'
        }
      };
      if (probe.method === 'POST') {
        // PortOne V2 GraphQL 의 Query 루트 = node / merchant / siteAnalysis 만.
        // merchant 가 핵심 — introspection 으로 inner type 확인 + 직접 query.
        init.body = JSON.stringify({
          query: `{
            merchantType: __type(name: "Merchant") {
              fields { name type { name kind ofType { name kind } } }
            }
            merchant {
              __typename
            }
          }`
        });
      }
      const resp = await fetch(probe.url, init);
      const text = await resp.text();
      let data: any;
      try { data = JSON.parse(text); } catch { data = text; }
      // 응답 안 storeId 단서 추출 (raw text 검색 — 'store-' prefix UUID).
      const storeIdMatches = text.match(/store-[a-f0-9-]{32,}/gi);
      results[probe.name] = {
        status: resp.status,
        ok: resp.ok,
        data,
        storeIdHints: storeIdMatches || null
      };
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
