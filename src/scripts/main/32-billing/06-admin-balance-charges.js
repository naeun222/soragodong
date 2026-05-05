// 사용자 명시 2026-05-06: admin charge / pending / confirm / revoke 흐름 통째 폐기 (legacy 충전 / 토스 흐름 정리).
// adminResetBalance 만 잔존 — 잔액 정정 도구 (overage_pack 등 잔여 처리 케이스).

// 사용자 보고 2026-05-06: 모바일 KG이니시스 redirect 흐름에서 verify-pay 가 다른 user.id 로 INSERT → 환불 NOT_OWN.
// 이 도구로 paymentId 진단 + 본인 user_id 강제 sync.
async function adminFixPayment() {
  if (typeof _isAdmin === 'function' && !_isAdmin()) {
    showToast('admin 권한 필요');
    return;
  }
  if (!session || !session.access_token) {
    showToast('로그인 필요');
    return;
  }
  const paymentId = prompt('paymentId (DB row id, UUID 형식) — settings 결제 history 에서 환불 안 되는 row:', '');
  if (paymentId === null || !paymentId.trim()) return;

  // 1. 진단
  let data;
  try {
    const resp = await _authedFetch('/api/admin/payment-fix', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentId: paymentId.trim(), action: 'diagnose' })
    });
    data = await resp.json();
    if (!resp.ok) {
      alert('진단 실패: ' + (data.error || resp.status));
      return;
    }
  } catch (e) {
    alert('통신 오류: ' + (e?.message || e));
    return;
  }

  const p = data.payment;
  const c = data.caller;
  const d = data.diagnose;
  const summary = `📋 결제 row 진단

ID: ${p.id}
status: ${p.status}
type: ${p.payment_type}
amount: ${(p.amount_krw || 0).toLocaleString()}원
created: ${p.created_at}
refund_started_at: ${p.refund_started_at || '(없음)'}
refunded_at: ${p.refunded_at || '(없음)'}

▶ row.user_id:    ${p.user_id || '(null)'}
▶ caller.user_id: ${c.user_id}
▶ 매칭: ${d.match ? '✅ OK' : '❌ 불일치'}

${d.reason}`;

  if (d.match) {
    alert(summary + '\n\nuser_id 매칭 OK — 환불 안 되는 다른 원인 (status / 외부 환불 / etc).');
    return;
  }

  // 2. 불일치 — target_user_id 입력 받음 (실제 결제 계정의 user_id 인 경우 등).
  const promptMsg = summary + '\n\n' +
    'row.user_id 를 어떤 user_id 로 sync?\n' +
    '  • 비워두기 = 본인 (caller, admin) user_id 로\n' +
    '  • UUID 입력 = 그 user_id 로 (실제 결제한 사용자 계정 등)\n\n' +
    '결제 row 의 user_email = ' + (p.user_email || '(없음)') + '\n' +
    '→ 이 이메일 계정의 user.id 가 일반 결제 계정. supabase auth.users 에서 조회 가능.\n\n' +
    '입력:';
  const targetInput = prompt(promptMsg, '');
  if (targetInput === null) return;
  const targetUserId = targetInput.trim() || null;

  try {
    const resp = await _authedFetch('/api/admin/payment-fix', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        paymentId: paymentId.trim(),
        action: 'sync_user',
        target_user_id: targetUserId
      })
    });
    const result = await resp.json();
    if (!resp.ok || !result.ok) {
      alert('sync 실패: ' + (result.error || resp.status));
      return;
    }
    showToast('✦ user_id sync 완료');
    alert(`${result.message}\n\n이제 결제 history 에서 환불 다시 시도해줘.`);
    if (typeof loadPayments === 'function') loadPayments();
  } catch (e) {
    alert('sync 통신 오류: ' + (e?.message || e));
  }
}

async function adminResetBalance() {
  if (typeof _isAdmin === 'function' && !_isAdmin()) {
    showToast('admin 권한 필요');
    return;
  }
  if (!session || !session.access_token) {
    showToast('로그인 필요');
    return;
  }
  const newBalanceStr = prompt('정정할 잔액 (USD, 0~100):\n예) 0 = 비우기', '0');
  if (newBalanceStr === null) return;
  const newBalance = parseFloat(newBalanceStr);
  if (isNaN(newBalance) || newBalance < 0 || newBalance > 100) {
    alert('잘못된 값 — 0 ~ 100 USD 범위');
    return;
  }
  const resetIdempotency = confirm('idempotency 기록도 reset?\n\nYes = 과거 결제 다시 처리 가능 (위험)\nNo = 잔액만 정정 (권장)');
  try {
    const resp = await _authedFetch('/api/admin/reset-balance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        new_balance_usd: newBalance,
        reset_idempotency: resetIdempotency
      })
    });
    const data = await resp.json();
    if (!resp.ok) {
      alert('실패: ' + (data.error || resp.status));
      return;
    }
    const msg = `✦ 잔액 $${data.old_balance_usd} → $${data.new_balance_usd}` +
                (data.idempotency_deleted ? ` (idempotency ${data.idempotency_deleted}개 삭제)` : '');
    showToast(msg);
    if (typeof refreshBillingStatus === 'function') refreshBillingStatus(true);
  } catch (e) {
    alert('에러: ' + (e.message || e));
  }
}
