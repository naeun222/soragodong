// 사용자 명시 2026-04-30 ultrathink: admin 잔액 정정 — 이전 누적 잔액 fix 용
async function adminResetBalance() {
  if (typeof _isAdmin === 'function' && !_isAdmin()) {
    showToast('admin 권한 필요');
    return;
  }
  if (!session || !session.access_token) {
    showToast('로그인 필요');
    return;
  }
  const newBalanceStr = prompt('정정할 잔액 (USD, 0~100):\n예) 0 = 비우기 / 2.14 = 무료 토큰 3,000원', '2.14');
  if (newBalanceStr === null) return;
  const newBalance = parseFloat(newBalanceStr);
  if (isNaN(newBalance) || newBalance < 0 || newBalance > 100) {
    alert('잘못된 값 — 0 ~ 100 USD 범위');
    return;
  }
  const resetIdempotency = confirm('idempotency 기록도 reset?\n\nYes = 과거 결제 다시 처리 가능 (위험)\nNo = 잔액만 정정 (권장)');
  const _origFetch = window._anthropicOrigFetch || window.fetch;
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

async function adminLoadPendingCharges() {
  const container = document.getElementById('adminPendingList');
  if (!container) return;
  container.innerHTML = '<span style="color:var(--text-soft);">불러오는 중...</span>';
  try {
    const resp = await _authedFetch('/api/admin/pending-charges', {
      headers: { 'Authorization': 'Bearer ' + (session?.access_token || '') }
    });
    if (resp.status === 403) {
      container.innerHTML = '<span style="color:var(--text-soft);">관리자 권한 X (Cloudflare env에 ADMIN_USER_ID 포함되어 있어야 함)</span>';
      return;
    }
    if (!resp.ok) {
      container.innerHTML = `<span style="color:#e89090;">실패 (${resp.status})</span>`;
      return;
    }
    const data = await resp.json();
    const pending = data.pending || [];
    if (pending.length === 0) {
      container.innerHTML = '<span style="color:var(--text-soft);">대기 중인 송금 X</span>';
      return;
    }
    let html = '<div style="display:flex; flex-direction:column; gap:6px;">';
    pending.forEach(p => {
      const at = new Date(p.created_at).toLocaleString('ko-KR');
      html += `
        <div style="padding:8px; background:var(--surface); border-radius:6px; line-height:1.6;">
          <div><b>${p.amount_krw.toLocaleString()}원</b> — ${p.user_email || '[email X]'}</div>
          <div style="font-size:10px; color:var(--text-soft);">메모: <code>${p.portone_merchant_uid}</code> · ${at}</div>
          <div style="display:flex; gap:4px; margin-top:6px;">
            <button class="btn-secondary" onclick="adminConfirm(${p.id})" style="font-size:11px; padding:4px 8px; background:rgba(143,200,143,0.20); border-color:rgba(143,200,143,0.40); color:#9ed4a0;">✓ 입금 확인</button>
            <button class="btn-secondary" onclick="adminRevoke(${p.id})" style="font-size:11px; padding:4px 8px; background:rgba(220,80,80,0.15); border-color:rgba(220,80,80,0.40); color:#e89090;">✗ 환수</button>
          </div>
        </div>`;
    });
    html += '</div>';
    container.innerHTML = html;
  } catch (e) {
    container.innerHTML = `<span style="color:#e89090;">예외: ${e.message || e}</span>`;
  }
}

async function adminConfirm(paymentId) {
  if (!confirm('입금 확인하셨나요? status를 paid로 변경합니다.')) return;
  try {
    const resp = await _authedFetch('/api/admin/confirm-charge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (session?.access_token || '') },
      body: JSON.stringify({ payment_id: paymentId })
    });
    if (resp.ok) {
      showToast('✓ 입금 확인 완료');
      adminLoadPendingCharges();
    } else {
      const r = await resp.json();
      alert('실패: ' + (r.error || resp.status));
    }
  } catch (e) { alert('예외: ' + (e.message || e)); }
}

async function adminRevoke(paymentId) {
  if (!confirm('미입금 또는 거짓 송금 — 잔액 환수 + status cancelled 처리합니다. 정말?')) return;
  try {
    const resp = await fetch('/api/admin/revoke-charge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (session?.access_token || '') },
      body: JSON.stringify({ payment_id: paymentId, ban_user: false })
    });
    if (resp.ok) {
      showToast('✗ 환수 완료');
      adminLoadPendingCharges();
    } else {
      const r = await resp.json();
      alert('실패: ' + (r.error || resp.status));
    }
  } catch (e) { alert('예외: ' + (e.message || e)); }
}

// 사용자 명시 2026-04-30: confirmTossSent 폐기 — manual-charge endpoint 410 Gone. 영수증 캡처 (verify-toss-receipt) 만 사용.

