// 사용자 명시 2026-05-09: 별자리 운세 backend proxy.
// 사용자 보고: client 가 horoscope-app-api.vercel.app 직접 호출 시 'Failed to fetch' (CORS 의심).
// → cloudflare worker 에서 server-side fetch 로 우회 + 동일 origin (/api/horoscope) 제공.
// Cache: same sign 6h 동안 KV cache (vercel free 의 cold start 부담 ↓).
//
// 사용자 보고 2026-05-09 (재정정 ultrathink): horoscope-app-api 가 자주 빈 응답 반환 (vercel free 불안정).
// → upstream 빈 응답 시 Anthropic Haiku fallback 으로 영문 horoscope 생성 (의존성 X).
// → 빈 응답 fail rate 사실상 0 (Anthropic 안정).

interface Env {
  GUEST_KV?: KVNamespace;
  ANTHROPIC_API_KEY?: string;
}

const ZODIAC_KEYS = ['aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo',
                     'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces'];

const ZODIAC_LABELS: Record<string, string> = {
  aries: 'Aries', taurus: 'Taurus', gemini: 'Gemini', cancer: 'Cancer',
  leo: 'Leo', virgo: 'Virgo', libra: 'Libra', scorpio: 'Scorpio',
  sagittarius: 'Sagittarius', capricorn: 'Capricorn', aquarius: 'Aquarius', pisces: 'Pisces',
};

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

// 사용자 보고 2026-05-09: horoscope-app-api 빈 응답 시 fallback. Anthropic Haiku 에 영문 horoscope 한 단락 생성 요청.
// client 의 _rcCallHoroscopeHaiku 가 이걸 다시 한국어 친구 톤으로 변환 — 흐름 동일.
async function _generateHoroscopeFromAnthropic(env: Env, sign: string, dateKey: string): Promise<string> {
  if (!env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY 미설정');
  const signLabel = ZODIAC_LABELS[sign] || sign;
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: `Generate today's daily horoscope for ${signLabel} (zodiac sign). Date: ${dateKey}.

Rules:
- One paragraph, English, friendly mystical tone (typical horoscope style).
- 2-3 sentences total. Concise but evocative.
- Talk about energy, focus, relationships, opportunity, intuition, etc. (vary topic).
- Avoid medical / clinical terms. Avoid forced positivity.
- Just the horoscope text. No preamble, no JSON, no markdown, no quotes.`,
      }],
    }),
  });
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Anthropic ${resp.status}: ${errText.slice(0, 200)}`);
  }
  const data: any = await resp.json();
  const text = (data?.content?.[0]?.text || '').trim();
  if (!text || text.length < 30) throw new Error('Anthropic 빈 응답 또는 너무 짧음');
  return text;
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

  // Upstream fetch — server-side, CORS 영향 X. redirect follow (default).
  // 사용자 보고 2026-05-09 (재정정): vercel free API 자주 빈 응답 → fallback chain.
  // 1) horoscope-app-api 시도 → 응답 OK + horoscope text 있으면 사용.
  // 2) 빈 응답 / non-2xx / network fail → Anthropic Haiku fallback 으로 영문 horoscope 생성.
  // 3) Anthropic 도 fail → 502 + 자세한 hint.
  const target = `https://horoscope-app-api.vercel.app/api/v1/get-horoscope/daily?sign=${encodeURIComponent(sign)}&day=TODAY`;
  let horoscopeText = '';
  let source = 'upstream';
  let upstreamErrInfo = '';

  try {
    const upstreamResp = await fetch(target, {
      method: 'GET',
      headers: { 'accept': 'application/json' },
      redirect: 'follow',
    });
    if (!upstreamResp.ok) {
      upstreamErrInfo = `HTTP ${upstreamResp.status}`;
    } else {
      const body = await upstreamResp.text();
      if (!body || body.length < 10) {
        upstreamErrInfo = 'empty body';
      } else {
        try {
          const json: any = JSON.parse(body);
          horoscopeText = (
            json?.data?.horoscope_data ||
            json?.data?.horoscope ||
            json?.data?.horoscopeData ||
            json?.data?.text ||
            json?.data?.message ||
            ''
          ).toString().trim();
          if (!horoscopeText || horoscopeText.length < 10) {
            upstreamErrInfo = `empty horoscope (data fields: ${Object.keys(json?.data || {}).join(', ') || '(no data)'})`;
            horoscopeText = '';
          }
        } catch (e: any) {
          upstreamErrInfo = `JSON parse fail: ${e?.message || 'unknown'}`;
        }
      }
    }
  } catch (e: any) {
    upstreamErrInfo = `network fail: ${e?.message || 'unknown'}`;
  }

  // Fallback — Anthropic Haiku 로 영문 horoscope 생성
  if (!horoscopeText) {
    try {
      horoscopeText = await _generateHoroscopeFromAnthropic(context.env, sign, dateKey);
      source = 'anthropic-fallback';
    } catch (fallbackErr: any) {
      return jsonError(502, 'upstream + fallback 둘 다 실패',
        `upstream: ${upstreamErrInfo}\nfallback: ${fallbackErr?.message || 'unknown'}`);
    }
  }

  // 옛 형식으로 normalize — client 코드 변경 X. data.horoscope_data 항상 채워짐.
  const normalized = {
    data: {
      date: dateKey,
      period: 'daily',
      sign,
      horoscope_data: horoscopeText.trim(),
    },
    status: 200,
    success: true,
    source,
  };
  const normalizedBody = JSON.stringify(normalized);

  // KV stash (best-effort, fail silent). 사용자 명시 2026-05-09: nocache=1 시 stash skip.
  // fallback 결과도 stash OK — 어차피 사용자에 노출되는 운세 (외부 API 다시 살아나면 다음 cutoff 때 자동 갱신).
  if (!noCache && context.env.GUEST_KV) {
    try {
      await context.env.GUEST_KV.put(cacheKey, normalizedBody, { expirationTtl: 6 * 3600 });
    } catch {}
  }

  return new Response(normalizedBody, {
    status: 200,
    headers: { ...HEADERS, 'x-cache': 'miss', 'x-source': source },
  });
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
