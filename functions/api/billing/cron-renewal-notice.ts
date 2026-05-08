// POST /api/billing/cron-renewal-notice
// 사용자 명시 2026-05-08 ultrathink (audit FAIL #2): 콘텐츠산업진흥법 §25 사전고지 의무 충족.
//
// 매일 1회 외부 cron 서비스 (cron-job.org / GitHub Actions) 가 호출.
// 헤더 'X-Cron-Secret' 으로 인증.
//
// 동작:
//   1) next_billing_at BETWEEN now AND now+7d
//      AND renewal_notice_7d_at IS NULL
//      AND subscription_active=true AND cancel_at_period_end=false
//      AND portone_billing_key NOT NULL
//      인 row 들 fetch (limit 50)
//   2) 각 row 마다 Resend 이메일 발송 — 갱신 시점 / 금액 / 결제 수단 / 해지 방법 명시
//   3) 발송 성공 → renewal_notice_7d_at = now 기록 (중복 발송 차단)
//
// 멱등: renewal_notice_7d_at IS NULL 필터 — 재시도 안전.

import { jsonResponse, type Env as BaseEnv } from '../_lib/auth';
import { TIER_PLANS } from '../_lib/billing';

type Env = BaseEnv & {
  RESEND_API_KEY?: string;
  ERROR_REPORT_FROM?: string;
  CRON_SECRET?: string;
};

const MAX_BATCH = 50;
const NOTICE_LEAD_DAYS = 7;

interface BillingRow {
  user_id: string;
  user_email?: string | null;
  subscription_plan: string;
  subscription_expires_at: string | null;
  next_billing_at: string | null;
  portone_billing_key: string | null;
}

function escapeHtml(s: string): string {
  return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function _formatKoreanDate(iso: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

export async function onRequestPost(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context;
  // 인증 — CRON_SECRET 헤더.
  const cronSecret = env.CRON_SECRET;
  if (!cronSecret) return jsonResponse({ error: 'CRON_SECRET env 미설정' }, 500);
  const provided = request.headers.get('x-cron-secret') || '';
  if (provided !== cronSecret) return jsonResponse({ error: 'unauthorized' }, 401);

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: 'supabase env 미설정' }, 500);
  }

  if (!env.RESEND_API_KEY) {
    // 이메일 발송 인프라 미구성 — silent skip + 로그.
    console.warn('[cron-renewal-notice] RESEND_API_KEY 미설정 — 발송 스킵');
    return jsonResponse({ ok: true, processed: 0, sent: 0, skipped: 'NO_RESEND_KEY' });
  }

  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const sevenDaysLater = new Date(now + NOTICE_LEAD_DAYS * 86400_000).toISOString();

  // due rows 조회 — 7일 안 갱신 + 미발송.
  let dueRows: BillingRow[] = [];
  try {
    const url = `${env.SUPABASE_URL}/rest/v1/soragodong_billing?` +
      `select=user_id,user_email,subscription_plan,subscription_expires_at,next_billing_at,portone_billing_key&` +
      `next_billing_at=gte.${encodeURIComponent(nowIso)}&` +
      `next_billing_at=lte.${encodeURIComponent(sevenDaysLater)}&` +
      `renewal_notice_7d_at=is.null&` +
      `subscription_active=eq.true&` +
      `cancel_at_period_end=eq.false&` +
      `portone_billing_key=not.is.null&` +
      `limit=${MAX_BATCH}`;
    const resp = await fetch(url, {
      headers: {
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
      }
    });
    if (!resp.ok) {
      const upstreamBody = await resp.text().catch(() => '');
      return jsonResponse({
        error: 'due rows 조회 실패: ' + resp.status,
        upstream_body: upstreamBody.slice(0, 500),
        hint: /column .* does not exist|renewal_notice_7d_at/i.test(upstreamBody)
          ? 'supabase migration 0013 (renewal_notice_7d_at 컬럼) 미적용 — SQL Editor 에서 0013 apply 필요'
          : (/portone_billing_key|cancel_at_period_end/i.test(upstreamBody)
              ? 'supabase migration 0012 (portone_billing_key / cancel_at_period_end 컬럼) 미적용'
              : 'env / RLS 정책 확인')
      }, 500);
    }
    dueRows = await resp.json();
  } catch (e: any) {
    return jsonResponse({ error: 'due rows throw: ' + (e?.message || e) }, 500);
  }

  if (dueRows.length === 0) {
    return jsonResponse({ ok: true, processed: 0, sent: 0 });
  }

  const from = env.ERROR_REPORT_FROM || 'onboarding@resend.dev';
  let sent = 0;
  const errors: Array<{ user_id: string; error: string }> = [];

  for (const row of dueRows) {
    if (!row.user_email) {
      errors.push({ user_id: row.user_id, error: 'user_email 없음 — 이메일 발송 skip' });
      continue;
    }

    const tier = (TIER_PLANS as any)[row.subscription_plan];
    const amount = tier?.krw || 0;
    const planLabel = tier?.label || row.subscription_plan;
    const renewDateStr = _formatKoreanDate(row.next_billing_at);

    // 콘텐츠산업진흥법 §25 의무 — 갱신 시점 / 금액 / 결제 수단 / 해지 방법 명시.
    const subject = `[소라고동] 자동 갱신 7일 전 안내 — ${planLabel} ${amount.toLocaleString()}원`;
    const html = `
<!DOCTYPE html>
<html><body style="font-family: 'Noto Sans KR', sans-serif; font-size: 14px; line-height: 1.7; color: #333;">
  <div style="max-width: 560px; margin: 0 auto; padding: 24px;">
    <h2 style="color: #c9a96e; font-size: 20px; margin: 0 0 16px;">🐚 소라고동 자동 갱신 안내</h2>
    <p>다음 자동 갱신이 <strong>7일 후</strong>로 예정되어 있어 미리 안내드려.</p>
    <table style="width:100%; border-collapse: collapse; margin: 18px 0; background: #f6f3ee; border-radius: 8px;">
      <tr><td style="padding: 10px 14px; color: #888; width: 130px;">플랜</td><td style="padding: 10px 14px; font-weight: 600;">${escapeHtml(planLabel)}</td></tr>
      <tr><td style="padding: 10px 14px; color: #888;">갱신 시점</td><td style="padding: 10px 14px; font-weight: 600;">${escapeHtml(renewDateStr)}</td></tr>
      <tr><td style="padding: 10px 14px; color: #888;">결제 금액</td><td style="padding: 10px 14px; font-weight: 600;">${amount.toLocaleString()}원 <span style="font-weight: 400; color: #888;">(부가세 10% 포함)</span></td></tr>
      <tr><td style="padding: 10px 14px; color: #888;">결제 수단</td><td style="padding: 10px 14px;">앱 등록 카드 (PortOne V2 빌링키)</td></tr>
    </table>
    <p style="margin-top: 18px;"><strong>해지하려면?</strong></p>
    <ul style="margin: 8px 0 16px; padding-left: 20px;">
      <li>앱 → [설정 → 구독 → 다음 갱신 해지] 1-click 으로 OFF 가능</li>
      <li>해지하면 현재 결제 만료일까지 사용 + 다음 자동 결제 X</li>
      <li>또는 <a href="https://soragodong.com/settings" style="color: #c9a96e;">웹에서 직접 해지</a></li>
    </ul>
    <p style="margin-top: 18px; font-size: 12px; color: #888; line-height: 1.6;">
      이 안내는 「콘텐츠산업진흥법 §25」 사전고지 의무에 따라 발송돼.<br>
      본 메일에 응답하면 답장 받을 수 없어. 문의: <a href="mailto:soragodongapp@gmail.com" style="color: #c9a96e;">soragodongapp@gmail.com</a>
    </p>
    <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
    <p style="font-size: 11px; color: #aaa;">
      나은 랩(Lab) · 사업자등록번호 261-21-02592 · 통신판매업 신고번호 2026-서울동작-0613<br>
      서울특별시 동작구 상도로47아길 14
    </p>
  </div>
</body></html>
`.trim();

    try {
      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ from, to: [row.user_email], subject, html })
      });

      if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        errors.push({ user_id: row.user_id, error: `Resend ${resp.status}: ${errText.slice(0, 200)}` });
        continue;
      }

      // 발송 성공 → DB 기록 (중복 발송 차단).
      await fetch(`${env.SUPABASE_URL}/rest/v1/soragodong_billing?user_id=eq.${row.user_id}`, {
        method: 'PATCH',
        headers: {
          'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ renewal_notice_7d_at: new Date().toISOString() })
      });

      sent++;
    } catch (e: any) {
      errors.push({ user_id: row.user_id, error: 'throw: ' + (e?.message || e) });
    }
  }

  return jsonResponse({
    ok: true,
    processed: dueRows.length,
    sent,
    failed: errors.length,
    errors: errors.slice(0, 20)
  });
}
