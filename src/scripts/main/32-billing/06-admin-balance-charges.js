// 사용자 명시 2026-05-06: admin charge / pending / confirm / revoke 흐름 통째 폐기 (legacy 충전 / 토스 흐름 정리).
// adminResetBalance 만 잔존 — 잔액 정정 도구 (overage_pack 등 잔여 처리 케이스).

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
