// 사용자 명시 2026-05-09: 별자리 운세 backend proxy.
// 사용자 보고: client 가 horoscope-app-api.vercel.app 직접 호출 시 'Failed to fetch' (CORS 의심).
// → cloudflare worker 에서 server-side fetch 로 우회 + 동일 origin (/api/horoscope) 제공.
// Cache: same sign 6h 동안 KV cache (vercel free 의 cold start 부담 ↓).
//
// 사용자 명시 2026-05-09 (재정정 ultrathink): Anthropic fallback 제거 — 사용자가 진짜 운세 보고 싶음.
// vercel free 자주 빈 응답 → retry 2회 (cold start 회피) + 그래도 fail 시 502 (사용자가 실패 카드의 ↻ 다시시도).
// AI 생성 운세는 진정성 ↓ — fallback 안 함.

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

// 사용자 보고 2026-05-09: vercel free cold start / 일시 빈 응답 회피 — 1회 attempt + 1회 retry (1.5s backoff).
// retry 도 빈 응답 시 502 반환.
async function _fetchHoroscopeWithRetry(target: string): Promise<{ text: string; errInfo: string }> {
  const _try = async (): Promise<{ text: string; errInfo: string }> => {
    let resp: Response;
    try {
      resp = await fetch(target, {
        method: 'GET',
        headers: { 'accept': 'application/json' },
        redirect: 'follow',
      });
    } catch (e: any) {
      return { text: '', errInfo: `network: ${e?.message || 'unknown'}` };
    }
    if (!resp.ok) return { text: '', errInfo: `HTTP ${resp.status}` };
    let body = '';
    try { body = await resp.text(); } catch (e: any) { return { text: '', errInfo: `body read: ${e?.message}` }; }
    if (!body || body.length < 10) return { text: '', errInfo: 'empty body' };
    let json: any;
    try { json = JSON.parse(body); } catch (e: any) { return { text: '', errInfo: `JSON parse: ${e?.message}` }; }
    const horoscope = (
      json?.data?.horoscope_data ||
      json?.data?.horoscope ||
      json?.data?.horoscopeData ||
      json?.data?.text ||
      json?.data?.message ||
      ''
    ).toString().trim();
    if (!horoscope || horoscope.length < 10) {
      return { text: '', errInfo: `empty horoscope (data fields: ${Object.keys(json?.data || {}).join(', ') || '(no data)'})` };
    }
    return { text: horoscope, errInfo: '' };
  };

  // 1차 시도
  let result = await _try();
  if (result.text) return result;
  const firstErr = result.errInfo;
  // 1.5s backoff 후 1회 retry — vercel cold start 최대 ~2s
  await new Promise(res => setTimeout(res, 1500));
  result = await _try();
  if (result.text) return result;
  return { text: '', errInfo: `1차: ${firstErr} | 2차: ${result.errInfo}` };
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const sign = (url.searchParams.get('sign') || '').toLowerCase().trim();
  if (!ZODIAC_KEYS.includes(sign)) {
    return jsonError(400, 'invalid sign', `expected one of: ${ZODIAC_KEYS.join(', ')}`);
  }

  // 사용자 보고 2026-05-09 ultrathink: API 응답 형식 변경 발견 — 옛 'horoscope_data' → 신 'horoscope'.
  // KV cache key = v2 (옛 빈 응답 cache 무효화). backend 가 normalize 해서 client 는 변경 X.
  // 사용자 명시 2026-05-09 (개발자 테스트): nocache=1 파라미터 → KV lookup + put skip (개발자 테스트 후 제거 예정).
  const noCache = url.searchParams.get('nocache') === '1';
  const dateKey = todayKey();
  const cacheKey = `horoscope:v2:${dateKey}:${sign}`;
  if (!noCache && context.env.GUEST_KV) {
    try {
      const cached = await context.env.GUEST_KV.get(cacheKey);
      if (cached) {
        return new Response(cached, { status: 200, headers: { ...HEADERS, 'x-cache': 'hit' } });
      }
    } catch {}
  }

  // Upstream fetch — server-side, CORS 영향 X. retry 1회 (vercel cold start 회피).
  const target = `https://horoscope-app-api.vercel.app/api/v1/get-horoscope/daily?sign=${encodeURIComponent(sign)}&day=TODAY`;
  const { text: horoscopeText, errInfo } = await _fetchHoroscopeWithRetry(target);

  if (!horoscopeText) {
    // 사용자 명시 2026-05-09: AI fallback 제거 — 진짜 운세 우선. 502 → client 실패 카드의 ↻ 다시시도.
    return jsonError(502, 'horoscope-app-api 빈 응답 / 다운', errInfo);
  }

  // 옛 형식으로 normalize — client 코드 변경 X. data.horoscope_data 항상 채워짐.
  const normalized = {
    data: {
      date: dateKey,
      period: 'daily',
      sign,
      horoscope_data: horoscopeText,
    },
    status: 200,
    success: true,
  };
  const normalizedBody = JSON.stringify(normalized);

  // KV stash (best-effort, fail silent). 사용자 명시 2026-05-09: nocache=1 시 stash skip.
  if (!noCache && context.env.GUEST_KV) {
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
