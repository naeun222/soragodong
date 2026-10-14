// 2026-10-15 — Anthropic upstream 에러 정리 (사용자 노출 차단) + 운영자 알림.
//
// 배경: 옛 chat.ts / chat-batch.ts 는 Anthropic 의 에러 본문을 그대로 클라이언트에 pass-through 했다.
//   → "Your credit balance is too low to access the Anthropic API ..." 같은 벤더 과금 문구가
//     사용자 말풍선에 그대로 떴고, 운영자는 아무 알림도 못 받았다 (2026-10-15 실제 발생).
//
// 이 모듈:
//   1) classifyUpstreamError — upstream status + body 를 보고 사용자용 code / 문구 / HTTP status 결정.
//      벤더 메시지는 절대 사용자에게 안 나감 (서버 로그에만).
//   2) alertOpsOnce — 운영 장애 (키/잔액/권한) 시 Resend 로 운영자 메일. KV 로 6h dedupe.
//   3) upstreamErrorResponse — 위 둘을 묶어 Response 생성. 'X-AI-Outage' 헤더로 클라이언트
//      circuit breaker (src/scripts/main/02a-ai-outage.js) 에 "자동 작업 n초 중지" 신호.

import { jsonResponse } from './auth';

export type UpstreamErrorClass = {
  code: string;            // 클라이언트 분기용 안정 코드
  status: number;          // 클라이언트에 돌려줄 HTTP status
  userMessage: string;     // 사용자에게 보여도 되는 문구
  opsAlert: boolean;       // 운영자 알림 필요 (우리 쪽 설정/과금 문제)
  outageSeconds: number;   // 클라이언트 자동 작업 중지 권고 (0 = 없음)
  upstreamType: string;    // 로그용 (Anthropic error.type)
};

function _parseUpstream(errText: string): { type: string; message: string } {
  try {
    const j = JSON.parse(errText);
    return {
      type: String(j?.error?.type || j?.type || ''),
      message: String(j?.error?.message || j?.message || '')
    };
  } catch {
    return { type: '', message: String(errText || '').slice(0, 300) };
  }
}

export function classifyUpstreamError(upstreamStatus: number, errText: string): UpstreamErrorClass {
  const { type, message } = _parseUpstream(errText);
  const lower = (type + ' ' + message).toLowerCase();

  // 과금 / 키 / 권한 — 전부 "우리 쪽" 문제. 사용자는 아무것도 할 수 없다.
  const billing = /credit balance|billing|plans & billing|purchase credits|insufficient.*(credit|fund)/.test(lower);
  const auth = upstreamStatus === 401 || upstreamStatus === 403
    || /authentication_error|permission_error|invalid x-api-key|api key/.test(lower);
  if (billing || auth) {
    return {
      code: 'AI_SERVICE_UNAVAILABLE',
      status: 503,
      userMessage: 'AI 쪽에 문제가 생겨서 지금은 답을 못 해. 운영자한테 자동으로 알렸어 — 복구되면 바로 다시 돼.',
      opsAlert: true,
      outageSeconds: 6 * 3600,
      upstreamType: type || (billing ? 'billing' : 'auth')
    };
  }

  if (upstreamStatus === 429 || /rate_limit/.test(lower)) {
    return {
      code: 'AI_RATE_LIMITED',
      status: 429,
      userMessage: 'AI 서버가 지금 바빠. 1분쯤 뒤에 다시 보내봐.',
      opsAlert: false,
      outageSeconds: 10 * 60,
      upstreamType: type || 'rate_limit'
    };
  }

  if (upstreamStatus === 529 || upstreamStatus >= 500 || /overloaded/.test(lower)) {
    return {
      code: 'AI_OVERLOADED',
      status: 503,
      userMessage: 'AI 서버가 일시적으로 과부하야 (우리 앱 문제는 아냐). 잠깐 뒤에 다시 보내줘.',
      opsAlert: false,
      outageSeconds: 15 * 60,
      upstreamType: type || 'overloaded'
    };
  }

  // 그 외 4xx = 우리가 보낸 요청이 잘못됨 (프롬프트/파라미터 버그). 사용자 잘못 아님.
  return {
    code: 'AI_BAD_REQUEST',
    status: 502,
    userMessage: '요청을 처리하다 문제가 생겼어. 다시 보내도 같으면 운영자한테 알려줘 (설정 → 피드백).',
    opsAlert: true,
    outageSeconds: 0,
    upstreamType: type || 'invalid_request'
  };
}

type OpsEnv = {
  RESEND_API_KEY?: string;
  ERROR_REPORT_FROM?: string;
  ERROR_REPORT_TO?: string;
  GUEST_KV?: { get: (k: string) => Promise<string | null>; put: (k: string, v: string, o?: any) => Promise<void> };
};

function _escapeHtml(s: string): string {
  return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

// 운영자 알림 — 같은 key 는 6h 에 1통만 (KV dedupe). RESEND_API_KEY 없으면 console.error 만.
export async function alertOpsOnce(env: OpsEnv, key: string, subject: string, detail: string): Promise<void> {
  const tag = `[ops-alert:${key}]`;
  try {
    if (env.GUEST_KV) {
      const kvKey = `ops_alert:${key}`;
      if (await env.GUEST_KV.get(kvKey)) return;  // 이미 보냄
      await env.GUEST_KV.put(kvKey, String(Date.now()), { expirationTtl: 6 * 3600 });
    }
  } catch (e: any) {
    console.warn(tag, 'KV dedupe fail:', e?.message || e);
  }
  console.error(tag, subject, '\n', detail.slice(0, 1000));
  if (!env.RESEND_API_KEY) return;
  const from = env.ERROR_REPORT_FROM || 'onboarding@resend.dev';
  const to = env.ERROR_REPORT_TO || 'soragodongapp@gmail.com';
  const html = `<!DOCTYPE html><html><body style="font-family:ui-monospace,monospace;font-size:13px;line-height:1.6">
<h3 style="margin:0 0 12px">${_escapeHtml(subject)}</h3>
<p>time: ${_escapeHtml(new Date().toISOString())}</p>
<pre style="background:#f4f4f4;padding:10px;border-radius:6px;white-space:pre-wrap;word-break:break-word">${_escapeHtml(detail.slice(0, 4000))}</pre>
<p style="color:#888">같은 알림은 6시간에 1통만 발송됩니다.</p>
</body></html>`;
  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject: `[소라고동 🚨] ${subject}`.slice(0, 200), html })
    });
    if (!resp.ok) console.warn(tag, 'Resend 비-OK:', resp.status, (await resp.text().catch(() => '')).slice(0, 200));
  } catch (e: any) {
    console.warn(tag, 'Resend throw:', e?.message || e);
  }
}

// upstream 실패 → 사용자 안전 Response. 벤더 본문은 서버 로그에만.
export function upstreamErrorResponse(
  env: OpsEnv,
  waitUntil: ((p: Promise<any>) => void) | undefined,
  upstreamStatus: number,
  errText: string,
  ctx: { where: string; endpoint?: string; model?: string; userId?: string }
): Response {
  const cls = classifyUpstreamError(upstreamStatus, errText);
  console.error(`[${ctx.where}] Anthropic upstream ${upstreamStatus} → ${cls.code} (${cls.upstreamType})`, {
    endpoint: ctx.endpoint, model: ctx.model, user: ctx.userId, body: String(errText || '').slice(0, 500)
  });
  if (cls.opsAlert) {
    const p = alertOpsOnce(
      env,
      cls.code === 'AI_SERVICE_UNAVAILABLE' ? 'ai-service-unavailable' : `ai-bad-request:${ctx.endpoint || 'unknown'}`,
      cls.code === 'AI_SERVICE_UNAVAILABLE'
        ? 'Anthropic API 사용 불가 — 잔액/키/권한 확인 필요 (전 사용자 AI 중단 중)'
        : `Anthropic 4xx — ${ctx.where} / ${ctx.endpoint || '?'} / ${ctx.model || '?'}`,
      `upstream ${upstreamStatus} ${cls.upstreamType}\nendpoint=${ctx.endpoint}\nmodel=${ctx.model}\nuser=${ctx.userId}\n\n${String(errText || '').slice(0, 2000)}`
    );
    if (waitUntil) waitUntil(p.catch(() => {})); else p.catch(() => {});
  }
  const resp = jsonResponse({
    error: cls.userMessage,
    code: cls.code,
    upstream_status: upstreamStatus,
    retry_after_seconds: cls.outageSeconds || undefined
  }, cls.status);
  if (cls.outageSeconds > 0) resp.headers.set('X-AI-Outage', String(cls.outageSeconds));
  return resp;
}
