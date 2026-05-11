// Cloudflare Pages Functions — 사용량 logging + 가격 계산.
// 사용자 요청 2026-04-30: env를 함수 인자로 받음 (process.env X).

import type { Env } from './auth';

export type UsageRecord = {
  user_id: string;
  endpoint: string;
  model: string;
  input_tokens: number;
  cache_read_tokens?: number;
  cache_creation_tokens?: number;
  output_tokens: number;
  cost_usd: number;
};

// 사용자 명시 2026-05-02 ultrathink (pricing_redesign.md 부록 A): Opus 4.7 실제 가격 = $5/$25 (Sonnet 의 1.67x).
// 옛 4 의 $15/$75 stale — 정정. 이전 코드의 "Opus 5x 차감" 가정도 자연스럽게 1.67x 로 보정됨 (실제 가격 비율).
// V4 (사용자 보고 2026-05-11 ultrathink): Anthropic 정확 model ID 는 dated suffix 포함 — 'claude-haiku-4-5-20251001'.
//   frontend dated suffix 사용 — PRICING 에도 동일 alias 추가 (가격 동일).
const PRICING: Record<string, { in: number; out: number; cache_read: number; cache_write: number }> = {
  'claude-sonnet-4-6':  { in: 3,  out: 15,  cache_read: 0.30, cache_write: 3.75 },
  'claude-haiku-4-5':   { in: 1,  out: 5,   cache_read: 0.10, cache_write: 1.25 },
  'claude-haiku-4-5-20251001': { in: 1, out: 5, cache_read: 0.10, cache_write: 1.25 },
  'claude-opus-4-7':    { in: 5,  out: 25,  cache_read: 0.50, cache_write: 6.25 }
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
    (inputTokens         * p.in           / 1_000_000) +
    (outputTokens        * p.out          / 1_000_000) +
    (cacheReadTokens     * p.cache_read   / 1_000_000) +
    (cacheCreationTokens * p.cache_write  / 1_000_000);
  return Math.round(cost * 1_000_000) / 1_000_000;
}

export async function recordUsage(env: Env, record: UsageRecord): Promise<void> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn('[usage] env 누락');
    return;
  }
  try {
    // 사용자 보고 2026-04-30 ultrathink: fetch 가 비-2xx 도 throw X — .ok 검사 + 에러 본문 로깅으로 silent drop 방지.
    const resp = await fetch(`${env.SUPABASE_URL}/rest/v1/soragodong_usage`, {
      method: 'POST',
      headers: {
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ ...record, recorded_at: new Date().toISOString() })
    });
    if (!resp.ok) {
      const errText = await resp.text().catch(() => '<no body>');
      console.error('[usage] INSERT 실패', resp.status, errText, 'record=', JSON.stringify(record));
    }
  } catch (e) {
    console.warn('[usage] 기록 실패:', e);
  }
}

export async function getMonthlyUsage(env: Env, userId: string): Promise<{ tokens: number; cost_usd: number }> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return { tokens: 0, cost_usd: 0 };
  }
  // 사용자 보고 2026-04-30: Cloudflare Workers는 UTC. 한국 사용자 월 경계는 KST(UTC+9).
  // KST 월 1일 00:00 = UTC 월 직전 마지막 날 15:00. KST 시각으로 계산해서 UTC로 변환.
  const KST_OFFSET_MS = 9 * 3600 * 1000;
  const nowKst = new Date(Date.now() + KST_OFFSET_MS);
  const startOfMonthKstUtc = Date.UTC(nowKst.getUTCFullYear(), nowKst.getUTCMonth(), 1, 0, 0, 0);
  const startOfMonth = new Date(startOfMonthKstUtc - KST_OFFSET_MS);  // UTC 시각 (DB 저장 형식)
  const url = `${env.SUPABASE_URL}/rest/v1/soragodong_usage?user_id=eq.${userId}&recorded_at=gte.${startOfMonth.toISOString()}&select=input_tokens,output_tokens,cache_read_tokens,cache_creation_tokens,cost_usd`;
  try {
    const resp = await fetch(url, {
      headers: {
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
      }
    });
    if (!resp.ok) return { tokens: 0, cost_usd: 0 };
    const rows: any[] = await resp.json();
    const tokens = rows.reduce((s, r) => s + (r.input_tokens || 0) + (r.output_tokens || 0) + (r.cache_read_tokens || 0) + (r.cache_creation_tokens || 0), 0);
    const cost = rows.reduce((s, r) => s + (r.cost_usd || 0), 0);
    return { tokens, cost_usd: Math.round(cost * 1_000_000) / 1_000_000 };
  } catch (e) {
    console.warn('[usage] 조회 실패:', e);
    return { tokens: 0, cost_usd: 0 };
  }
}
