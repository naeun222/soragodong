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

  // 사용자 보고 2026-05-09 ultrathink: API 응답 형식 변경 발견 — 옛 'horoscope_data' → 신 'horoscope'.
  // KV cache key = v2 (옛 빈 응답 cache 무효화). backend 가 normalize 해서 client 는 변경 X.
  const dateKey = todayKey();
  const cacheKey = `horoscope:v2:${dateKey}:${sign}`;
  if (context.env.GUEST_KV) {
    try {
      const cached = await context.env.GUEST_KV.get(cacheKey);
      if (cached) {
        return new Response(cached, { status: 200, headers: { ...HEADERS, 'x-cache': 'hit' } });
      }
    } catch {}
  }

  // Upstream fetch — server-side, CORS 영향 X. redirect follow (default).
  const target = `https://horoscope-app-api.vercel.app/api/v1/get-horoscope/daily?sign=${encodeURIComponent(sign)}&day=TODAY`;
  let upstreamResp: Response;
  try {
    upstreamResp = await fetch(target, {
      method: 'GET',
      headers: { 'accept': 'application/json' },
      redirect: 'follow',
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

  if (!body || body.length < 10) {
    return jsonError(502, 'upstream empty body');
  }

  // 사용자 보고 2026-05-09: 응답 normalize — API 형식 변경 흡수 + 빈 horoscope 검출.
  let json: any;
  try {
    json = JSON.parse(body);
  } catch (e: any) {
    return jsonError(502, 'upstream JSON parse failed', e?.message);
  }

  const horoscopeText =
    json?.data?.horoscope_data ||  // 옛 필드명
    json?.data?.horoscope ||        // 신 필드명 (2026-05-09 발견)
    json?.data?.horoscopeData ||    // 변종
    json?.data?.text ||
    json?.data?.message ||
    '';

  if (!horoscopeText || typeof horoscopeText !== 'string' || horoscopeText.trim().length < 10) {
    return jsonError(502, 'upstream returned empty horoscope',
      `data fields: ${Object.keys(json?.data || {}).join(', ') || '(no data field)'}`);
  }

  // 옛 형식으로 normalize — client 코드 변경 X. data.horoscope_data 항상 채워짐.
  const normalized = {
    data: {
      date: json?.data?.date || dateKey,
      period: json?.data?.period || 'daily',
      sign: json?.data?.sign || sign,
      horoscope_data: horoscopeText.trim(),
    },
    status: 200,
    success: true,
  };
  const normalizedBody = JSON.stringify(normalized);

  // KV stash (best-effort, fail silent)
  if (context.env.GUEST_KV) {
    try {
      await context.env.GUEST_KV.put(cacheKey, normalizedBody, { expirationTtl: 6 * 3600 });
    } catch {}
  }

  return new Response(normalizedBody, { status: 200, headers: { ...HEADERS, 'x-cache': 'miss' } });
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
