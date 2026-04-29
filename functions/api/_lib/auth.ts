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
  const resp = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      'apikey': env.SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${token}`
    }
  });
  if (!resp.ok) return null;
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
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
