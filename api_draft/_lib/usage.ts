// 사용량 추적 — Anthropic API call 후 토큰 사용량을 Supabase에 기록.
// 청구 / dashboard / 사용량 cap 체크에 활용.

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export type UsageRecord = {
  user_id: string;          // Supabase auth uid
  endpoint: string;         // 'chat' | 'topic_extract' | 'crystallize' | ...
  model: string;            // 'claude-sonnet-4-6' 등
  input_tokens: number;
  cache_read_tokens?: number;
  cache_creation_tokens?: number;
  output_tokens: number;
  // 비용 (USD, 소수점 6자리) — Anthropic 가격표 기준 계산
  cost_usd: number;
};

const PRICING: Record<string, { in: number; out: number; cache_read: number; cache_write: number }> = {
  // per 1M tokens (USD)
  'claude-sonnet-4-6':  { in: 3,  out: 15,  cache_read: 0.30, cache_write: 3.75 },
  'claude-haiku-4-5':   { in: 1,  out: 5,   cache_read: 0.10, cache_write: 1.25 },
  'claude-opus-4-7':    { in: 15, out: 75,  cache_read: 1.50, cache_write: 18.75 }
};

export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens = 0,
  cacheCreationTokens = 0
): number {
  const p = PRICING[model] || PRICING['claude-sonnet-4-6'];
  const cost =
    (inputTokens       * p.in        / 1_000_000) +
    (outputTokens      * p.out       / 1_000_000) +
    (cacheReadTokens   * p.cache_read  / 1_000_000) +
    (cacheCreationTokens * p.cache_write / 1_000_000);
  return Math.round(cost * 1_000_000) / 1_000_000;  // 소수점 6자리
}

export async function recordUsage(record: UsageRecord): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.warn('[usage] SUPABASE_SERVICE_ROLE_KEY 누락 — 기록 X');
    return;
  }
  // soragodong_usage 테이블에 row 박음. service_role 로 RLS 우회 (의도).
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/soragodong_usage`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        ...record,
        recorded_at: new Date().toISOString()
      })
    });
  } catch (e) {
    console.warn('[usage] 기록 실패 (무시):', e);
  }
}

// 월별 사용량 조회 (사용자 dashboard 용)
export async function getMonthlyUsage(userId: string): Promise<{ tokens: number; cost_usd: number }> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return { tokens: 0, cost_usd: 0 };
  }
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const url = `${SUPABASE_URL}/rest/v1/soragodong_usage?user_id=eq.${userId}&recorded_at=gte.${startOfMonth.toISOString()}&select=input_tokens,output_tokens,cache_read_tokens,cache_creation_tokens,cost_usd`;
  const resp = await fetch(url, {
    headers: {
      'apikey': SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
    }
  });
  if (!resp.ok) return { tokens: 0, cost_usd: 0 };
  const rows: any[] = await resp.json();
  const tokens = rows.reduce((s, r) => s + (r.input_tokens || 0) + (r.output_tokens || 0) + (r.cache_read_tokens || 0) + (r.cache_creation_tokens || 0), 0);
  const cost = rows.reduce((s, r) => s + (r.cost_usd || 0), 0);
  return { tokens, cost_usd: Math.round(cost * 1_000_000) / 1_000_000 };
}
