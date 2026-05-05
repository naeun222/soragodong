// Cloudflare Pages Functions — 게스트 모드 비용 방어선 (Phase 0).
// 사용자 명시 2026-05-05 ultrathink: 게스트 (Supabase anonymous) 사용자 한정 — 인증 사용자는 이 경로 안 거침.
//
// 방어선 3 종:
//   1. per-IP 일일 한도 (10 req / IP / day) — KV 카운터.
//   2. 글로벌 일일 budget (env.GUEST_DAILY_BUDGET_USD, 기본 $5) — 모든 게스트 합산.
//   3. (별도 모듈) Turnstile 토큰 검증 — 봇 차단.
//
// KV binding: GUEST_KV — Cloudflare Pages Dashboard → Settings → Functions → KV namespace bindings.
//   - Variable name: GUEST_KV
//   - 새 KV namespace 생성: 'soragodong-guest-rate-limit' (또는 기존 namespace 재사용)
// KV 미설정 시 게스트 chat = 503 (fail-closed). 인증 사용자는 영향 X.

import type { Env } from './auth';

export interface GuestEnv extends Env {
  GUEST_KV?: KVNamespace;
  GUEST_DAILY_BUDGET_USD?: string;
  TURNSTILE_SECRET_KEY?: string;
  // 사용자 명시 2026-05-06: 개발자 본인 IP 화이트리스트 — 게스트 흐름 테스트 시 IP/글로벌 한도 우회.
  // 콤마 구분 IPv4/IPv6. secret 으로 관리 권장 (git 커밋 X): npx wrangler pages secret put GUEST_IP_ALLOWLIST.
  GUEST_IP_ALLOWLIST?: string;
}

// 사용자 명시 2026-05-06 ultrathink (재): 10회 → 20회 (intake+분석+chat 8-10+retry 여유). 글로벌 $5 → $7 (16명 안전).
const PER_IP_DAILY_LIMIT = 20;
const DEFAULT_GLOBAL_BUDGET_USD = 7;
const KV_TTL_SECONDS = 90000;  // 25h (24h + 1h margin)

function _todayKey(): string {
  // UTC 기준 — 게스트 = anonymous 라 KST 4AM cutoff 무관.
  return new Date().toISOString().slice(0, 10);
}

// 사용자 명시 2026-05-06: GUEST_IP_ALLOWLIST 안 IP 면 rate limit / 글로벌 budget / cost 카운터 모두 우회.
// 본인 테스트 IP 만 (가족/사무실 NAT 등 공유 IP 면 옆 사용자도 우회되니 주의).
export function isAllowlistedGuestIp(env: GuestEnv, ip: string): boolean {
  const raw = (env.GUEST_IP_ALLOWLIST || '').trim();
  if (!raw || !ip || ip === 'unknown') return false;
  return raw.split(',').map(s => s.trim()).filter(Boolean).includes(ip);
}

export type RateLimitResult =
  | { ok: true }
  | { ok: false; code: 'IP_LIMIT' | 'GLOBAL_BUDGET' | 'KV_UNAVAILABLE'; reason: string; status: number };

export function extractClientIp(request: Request): string {
  return request.headers.get('CF-Connecting-IP')
    || request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim()
    || 'unknown';
}

export async function checkAndIncIpRate(env: GuestEnv, ip: string): Promise<RateLimitResult> {
  // 사용자 명시 2026-05-06: 화이트리스트 IP 면 카운터 안 증가 + 즉시 통과.
  if (isAllowlistedGuestIp(env, ip)) return { ok: true };
  if (!env.GUEST_KV) {
    console.error('[rate-limit] GUEST_KV binding 누락 — Pages Dashboard 설정 필요');
    return { ok: false, code: 'KV_UNAVAILABLE', reason: '게스트 모드 미설정 — 잠시 후 다시', status: 503 };
  }
  const key = `ip:${ip}:${_todayKey()}`;
  try {
    const cur = parseInt((await env.GUEST_KV.get(key)) || '0', 10);
    if (cur >= PER_IP_DAILY_LIMIT) {
      return {
        ok: false,
        code: 'IP_LIMIT',
        reason: `오늘 게스트 한도 다 썼어 (${PER_IP_DAILY_LIMIT}회). 가입하면 즉시 더 — 첫 달 무료 ✦`,
        status: 429
      };
    }
    await env.GUEST_KV.put(key, String(cur + 1), { expirationTtl: KV_TTL_SECONDS });
    return { ok: true };
  } catch (e: any) {
    console.warn('[rate-limit] IP check throw:', e?.message || e);
    return { ok: false, code: 'KV_UNAVAILABLE', reason: '게스트 rate limit 일시 X — 잠시 후', status: 503 };
  }
}

export async function checkGlobalGuestBudget(env: GuestEnv, ip?: string): Promise<RateLimitResult> {
  // 사용자 명시 2026-05-06: 화이트리스트 IP 면 글로벌 budget 검사 우회 (본인 테스트가 일반 게스트 한도 잡아먹지 않도록).
  if (ip && isAllowlistedGuestIp(env, ip)) return { ok: true };
  if (!env.GUEST_KV) {
    return { ok: false, code: 'KV_UNAVAILABLE', reason: '게스트 모드 미설정', status: 503 };
  }
  const limit = parseFloat(env.GUEST_DAILY_BUDGET_USD || String(DEFAULT_GLOBAL_BUDGET_USD));
  const key = `global:${_todayKey()}`;
  try {
    const microUsd = parseInt((await env.GUEST_KV.get(key)) || '0', 10);
    const usd = microUsd / 1_000_000;
    if (usd >= limit) {
      return {
        ok: false,
        code: 'GLOBAL_BUDGET',
        reason: '오늘 게스트 모드가 너무 붐벼 — 가입하면 즉시 사용 가능 (첫 달 무료)',
        status: 429
      };
    }
    return { ok: true };
  } catch (e: any) {
    console.warn('[rate-limit] global check throw:', e?.message || e);
    // 글로벌 check 는 fail-open — IP rate limit 이 1차 방어선이라 OK.
    return { ok: true };
  }
}

export async function recordGuestCost(env: GuestEnv, costUsd: number, ip?: string): Promise<void> {
  // 사용자 명시 2026-05-06: 화이트리스트 IP 발생 비용은 글로벌 카운터에서 제외 (개발자 테스트 격리).
  if (ip && isAllowlistedGuestIp(env, ip)) return;
  if (!env.GUEST_KV || costUsd <= 0) return;
  const key = `global:${_todayKey()}`;
  try {
    const cur = parseInt((await env.GUEST_KV.get(key)) || '0', 10);
    const microUsd = Math.round(costUsd * 1_000_000);
    await env.GUEST_KV.put(key, String(cur + microUsd), { expirationTtl: KV_TTL_SECONDS });
  } catch (e: any) {
    console.warn('[rate-limit] global record throw:', e?.message || e);
  }
}
