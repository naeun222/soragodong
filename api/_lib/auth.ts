// Supabase JWT 검증 + 사용자 ID 추출. 클라이언트가 Authorization: Bearer <access_token> 보내면 → uid 반환.
// 사용자 요청 2026-04-30 (Phase C 활성): api_draft → api/ 옮김.

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

export type AuthedUser = {
  id: string;        // Supabase auth uid
  email?: string;
};

export async function verifyAuth(req: Request): Promise<AuthedUser | null> {
  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) return null;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('SUPABASE_URL / SUPABASE_ANON_KEY env 누락');
  }
  const resp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${token}`
    }
  });
  if (!resp.ok) return null;
  const user = await resp.json();
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
