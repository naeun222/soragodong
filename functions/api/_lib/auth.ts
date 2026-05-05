// Cloudflare Pages Functions 형식. Supabase JWT 검증 + 사용자 ID 추출.
// 사용자 요청 2026-04-30: api/ (Vercel) → functions/api/ (Cloudflare Pages) 변환.

export type AuthedUser = {
  id: string;
  email?: string;
};

export type Env = {
  ANTHROPIC_API_KEY: string;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  PORTONE_API_KEY?: string;
  PORTONE_API_SECRET?: string;
  PORTONE_CHANNEL_KEY?: string;
};

export async function verifyAuth(request: Request, env: Env): Promise<AuthedUser | null> {
  const authHeader = request.headers.get('authorization') || request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) return null;
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    throw new Error('SUPABASE env 누락');
  }
  // 사용자 보고 2026-05-05 ultrathink: Supabase /auth/v1/user 5xx + network throw 1회 재시도 (1s backoff).
  // 이전 = throw 시 verifyAuth 자체 throw → Cloudflare Pages Functions 자동 500 → 클라이언트 'AI 서버 일시 과부하' 토스트.
  const url = `${env.SUPABASE_URL}/auth/v1/user`;
  const headers = { 'apikey': env.SUPABASE_ANON_KEY, 'Authorization': `Bearer ${token}` };
  let resp: Response;
  try {
    resp = await fetch(url, { headers });
  } catch (e: any) {
    console.warn('[verifyAuth] Supabase throw:', e?.message || e);
    await new Promise(r => setTimeout(r, 1000));
    try {
      resp = await fetch(url, { headers });
    } catch (e2: any) {
      console.error('[verifyAuth] Supabase retry throw:', e2?.message || e2);
      return null;  // 5xx 던지지 않고 401 처리 — 클라이언트가 session 만료로 인지하고 refresh 시도 가능
    }
  }
  if (!resp.ok) {
    if (resp.status >= 500 && resp.status < 600) {
      console.warn(`[verifyAuth] Supabase ${resp.status} — 1s 후 1회 재시도`);
      await new Promise(r => setTimeout(r, 1000));
      try {
        resp = await fetch(url, { headers });
      } catch (e: any) {
        console.error('[verifyAuth] retry throw:', e?.message || e);
        return null;
      }
    }
    if (!resp.ok) return null;
  }
  const user: any = await resp.json();
  if (!user || !user.id) return null;
  return { id: user.id, email: user.email };
}

export function unauthorized(message = '인증 필요'): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' }
  });
}

export function jsonResponse(body: unknown, status = 200): Response {
  // 사용자 보고 2026-04-30 ultrathink: Cache-Control no-store — 브라우저 / SW / 중간 프록시 캐시 차단.
  // 옛 버그: GET /api/usage 응답이 SW 캐시 또는 브라우저 heuristic 캐시로 stale 노출.
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store, no-cache, must-revalidate'
    }
  });
}
