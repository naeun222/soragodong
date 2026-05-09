// 사용자 명시 2026-05-09: 별자리 운세 backend proxy.
// 사용자 보고: client 가 horoscope-app-api.vercel.app 직접 호출 시 'Failed to fetch' (CORS 의심).
// → cloudflare worker 에서 server-side fetch 로 우회 + 동일 origin (/api/horoscope) 제공.
// Cache: same sign 6h 동안 KV cache (vercel free 의 cold start 부담 ↓).

interface Env {
  GUEST_KV?: KVNamespace;
}

const ZODIAC_KEYS = ['aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo',
                     'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces'];

const HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': '*',
  'cache-control': 'public, max-age=3600',
};

function jsonError(status: number, message: string, hint?: string) {
  return new Response(JSON.stringify({ error: message, hint }), { status, headers: HEADERS });
}

function todayKey() {
  // 4AM KST cutoff
  const now = new Date();
  const kstNow = new Date(now.getTime() + 9 * 3600 * 1000);
  if (kstNow.getUTCHours() < 4) kstNow.setUTCDate(kstNow.getUTCDate() - 1);
  return kstNow.toISOString().slice(0, 10);
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const sign = (url.searchParams.get('sign') || '').toLowerCase().trim();
  if (!ZODIAC_KEYS.includes(sign)) {
    return jsonError(400, 'invalid sign', `expected one of: ${ZODIAC_KEYS.join(', ')}`);
  }

  // KV cache lookup (key = horoscope:{date}:{sign})
  const dateKey = todayKey();
  const cacheKey = `horoscope:${dateKey}:${sign}`;
  if (context.env.GUEST_KV) {
    try {
      const cached = await context.env.GUEST_KV.get(cacheKey);
      if (cached) {
        return new Response(cached, { status: 200, headers: { ...HEADERS, 'x-cache': 'hit' } });
      }
    } catch {}
  }

  // Upstream fetch — server-side, CORS 영향 X
  const target = `https://horoscope-app-api.vercel.app/api/v1/get-horoscope/daily?sign=${encodeURIComponent(sign)}&day=TODAY`;
  let upstreamResp: Response;
  try {
    upstreamResp = await fetch(target, {
      method: 'GET',
      headers: { 'accept': 'application/json' },
      // 사용자 보고 2026-05-09: vercel free 의 cold start 가 길 수 있음 → 8s timeout.
      // 단 fetch 의 timeout 은 AbortController 로 구현 필요.
    });
  } catch (e: any) {
    return jsonError(502, 'upstream fetch failed', e?.message || 'network error');
  }

  if (!upstreamResp.ok) {
    return jsonError(upstreamResp.status, `upstream HTTP ${upstreamResp.status}`,
      `horoscope-app-api 응답 비정상`);
  }

  let body: string;
  try {
    body = await upstreamResp.text();
  } catch (e: any) {
    return jsonError(502, 'upstream body read failed', e?.message);
  }

  // 사용자 보고 2026-05-09: 일부 케이스에 빈 응답 → 캐시 X.
  if (!body || body.length < 10) {
    return jsonError(502, 'upstream empty body');
  }

  // KV stash (best-effort, fail silent)
  if (context.env.GUEST_KV) {
    try {
      await context.env.GUEST_KV.put(cacheKey, body, { expirationTtl: 6 * 3600 });
    } catch {}
  }

  return new Response(body, { status: 200, headers: { ...HEADERS, 'x-cache': 'miss' } });
};

export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, OPTIONS',
      'access-control-allow-headers': 'content-type',
      'access-control-max-age': '86400',
    },
  });
};
