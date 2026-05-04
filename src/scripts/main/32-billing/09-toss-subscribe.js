// ─── 토스 송금 구독 모달 (사용자 명시 2026-04-30: 포트원 미설정 단계 fallback) ───
// 한 달 구독 — 자동 갱신 X. 다음 달 재구독 = 다시 송금 + 인증.
function showTossSubscribeModal(tierKey) {
  if (document.getElementById('tossSubscribeOverlay')) return;
  const tier = TIER_PLANS_CLIENT[tierKey];
  if (!tier) return;
  const memoCode = _generateUserMemoCode();
  const overlay = document.createElement('div');
  overlay.className = 'input-modal-overlay show';
  overlay.id = 'tossSubscribeOverlay';
  overlay.style.zIndex = '10001';
  overlay.innerHTML = `
    <div class="input-modal" style="max-width:400px; max-height:92vh; overflow-y:auto; padding:24px;">
      <div style="font-size:16px; font-weight:700; color:var(--text); margin-bottom:8px;">${tier.emoji} ${tier.label} 구독 — 한 달</div>
      <div style="font-size:11px; color:var(--text-dim); line-height:1.7; margin-bottom:14px;">
        토스 앱으로 보내고, 영수증 한 장 올려줘. 내가 확인하고 한 달 활성화해줄게 ✦<br>
        <strong style="color:var(--accent);">자동 갱신 X</strong> — 다음 달 재구독은 다시 송금 + 인증.
      </div>

      <div style="padding:14px; background:var(--surface); border-radius:10px; margin-bottom:14px;">
        <div style="font-size:11px; color:var(--text-dim); margin-bottom:4px;">구독 금액 (한 달)</div>
        <div style="font-size:18px; font-weight:700; color:var(--text);">${tier.krw.toLocaleString()}원</div>
      </div>

      <div style="padding:14px; background:linear-gradient(135deg, rgba(126,200,227,0.10), rgba(143,200,143,0.05)); border:1px solid rgba(126,200,227,0.30); border-radius:10px; margin-bottom:14px;">
        <div style="font-size:11px; color:var(--text-dim); margin-bottom:6px;">📲 토스 송금 정보</div>
        <div style="font-size:13px; color:var(--text); line-height:1.8;">
          <b>은행</b>: ${TOSS_ACCOUNT.bank}<br>
          <b>계좌</b>: ${TOSS_ACCOUNT.number}<br>
          <b>예금주</b>: ${TOSS_ACCOUNT.holder}<br>
          <b>금액</b>: ${tier.krw.toLocaleString()}원<br>
          <b style="color:var(--accent);">메모 (필수)</b>: <code style="background:rgba(212,167,106,0.20); padding:2px 6px; border-radius:4px; font-family:monospace;">${memoCode}</code>
        </div>
      </div>

      <div style="display:flex; gap:6px; margin-bottom:8px;">
        <button class="btn-secondary" onclick="navigator.clipboard.writeText('${TOSS_ACCOUNT.number_raw}').then(() => showToast('계좌번호 복사됨'))" style="flex:1; font-size:11px;">📋 계좌번호 복사</button>
        <button class="btn-secondary" onclick="navigator.clipboard.writeText('${memoCode}').then(() => showToast('메모 코드 복사됨'))" style="flex:1; font-size:11px;">📋 메모 코드 복사</button>
      </div>
      <div style="font-size:10px; color:var(--text-soft); margin-bottom:14px; line-height:1.6;">
        💡 토스 말고 다른 은행 앱 (우리·국민·신한 등) 도 OK.
      </div>

      <div style="border-top:1px solid var(--border); padding-top:14px; margin-bottom:8px;">
        <div style="font-size:13px; font-weight:600; color:var(--text); margin-bottom:6px;">📸 송금 보낸 후 — 캡처 올리기</div>
        <div style="font-size:11px; color:var(--text-dim); line-height:1.7; margin-bottom:10px;">
          아래 중 한 장 캡처해서 올려:<br>
          · <strong>본인 통장 거래 내역</strong> (출금 line + 메모 보이게) <span style="color:var(--text-soft);">— 가장 정확</span><br>
          · 송금 완료 화면<br>
          · 거래내역 → 클릭 → 상세 화면<br>
          <span style="color:var(--text-soft);">AI가 확인하고 한 달 구독 활성화 ✦</span>
        </div>
        <div style="font-size:10px; color:var(--text-soft); margin-bottom:10px; padding:8px; background:rgba(0,0,0,0.15); border-radius:6px; line-height:1.6;">
          📋 <b>AI(Anthropic Sonnet)가 추출하는 정보</b>:<br>
          금액 · 수신 계좌 · 메모 코드 · 송금 시각 · 화면 종류 (검증 목적). 추출 결과는 검증 후 즉시 사용·삭제 (학습 X). <a href="/privacy" target="_blank" style="color:var(--accent);">자세히</a>
        </div>
        <input type="file" id="tossSubReceiptInput" accept="image/*" style="width:100%; font-size:11px;">

        <!-- 필수 동의 -->
        <div style="margin-top:12px; padding:10px; background:var(--surface); border-radius:8px;">
          <label style="display:flex; align-items:flex-start; gap:8px; margin-bottom:10px; padding-bottom:10px; border-bottom:1px solid var(--border); font-size:12px; font-weight:600; line-height:1.6; cursor:pointer;">
            <input type="checkbox" id="tossSubConsentAll" onchange="_toggleTossSubConsentAll(this)" style="margin-top:3px; flex-shrink:0;">
            <span style="color:var(--accent);">필수 항목 전체 동의 (아래 3가지 한 번에)</span>
          </label>
          <label style="display:flex; align-items:flex-start; gap:8px; margin-bottom:8px; font-size:11px; line-height:1.6; cursor:pointer;">
            <input type="checkbox" id="tossSubConsentRefund" onchange="_syncTossSubConsentAllChk()" style="margin-top:3px; flex-shrink:0;">
            <span><b>(필수)</b> <a href="/refund" target="_blank" style="color:var(--accent);">환불정책</a> — 잔여일 비례 환불 가능</span>
          </label>
          <label style="display:flex; align-items:flex-start; gap:8px; margin-bottom:8px; font-size:11px; line-height:1.6; cursor:pointer;">
            <input type="checkbox" id="tossSubConsentTerms" onchange="_syncTossSubConsentAllChk()" style="margin-top:3px; flex-shrink:0;">
            <span><b>(필수)</b> <a href="/terms" target="_blank" style="color:var(--accent);">이용약관</a> — ${tier.label} 구독 ${tier.krw.toLocaleString()}원/월 / 자동 갱신 X</span>
          </label>
          <label style="display:flex; align-items:flex-start; gap:8px; font-size:11px; line-height:1.6; cursor:pointer;">
            <input type="checkbox" id="tossSubConsentSensitive" onchange="_syncTossSubConsentAllChk()" style="margin-top:3px; flex-shrink:0;">
            <span><b>(필수)</b> <a href="/privacy" target="_blank" style="color:var(--accent);">개인정보처리방침</a> — 정신건강 자기관찰 데이터 처리 별도 동의 (개인정보보호법 §23)</span>
          </label>
        </div>

        <button class="btn-primary" onclick="verifyTossSubscribe('${tierKey}', '${memoCode}')" style="width:100%; margin-top:8px;">✦ 자동 확인하고 한 달 활성화</button>
      </div>

      <div style="font-size:10px; color:var(--text-soft); line-height:1.6; margin-top:10px; padding:8px; background:rgba(126,200,227,0.05); border-left:3px solid rgba(126,200,227,0.40); border-radius:4px;">
        🐚 어디서 막히면 → <a href="${KAKAO_OPEN_CHAT}" target="_blank" style="color:var(--accent); font-weight:600;">💬 오픈채팅으로 톡 줘</a>
      </div>

      <button class="btn-secondary" onclick="closeTossSubscribeModal()" style="width:100%; margin-top:10px;">닫기</button>
    </div>
  `;
  document.body.appendChild(overlay);
}

function closeTossSubscribeModal() {
  const overlay = document.getElementById('tossSubscribeOverlay');
  if (overlay) overlay.remove();
}

// 토스 구독 동의 헬퍼 (양방향 sync)
const _TOSS_SUB_CONSENT_IDS = ['tossSubConsentRefund', 'tossSubConsentTerms', 'tossSubConsentSensitive'];
function _toggleTossSubConsentAll(allEl) {
  const v = !!(allEl && allEl.checked);
  _TOSS_SUB_CONSENT_IDS.forEach(id => {
    const cb = document.getElementById(id);
    if (cb) cb.checked = v;
  });
}
function _syncTossSubConsentAllChk() {
  const all = _TOSS_SUB_CONSENT_IDS.every(id => document.getElementById(id)?.checked);
  const allCb = document.getElementById('tossSubConsentAll');
  if (allCb) allCb.checked = all;
}

// 영수증 캡처 → AI 자동 인증 → 한 달 구독 활성화
async function verifyTossSubscribe(tierKey, memoCode) {
  const refundOk = document.getElementById('tossSubConsentRefund')?.checked;
  const termsOk = document.getElementById('tossSubConsentTerms')?.checked;
  const sensitiveOk = document.getElementById('tossSubConsentSensitive')?.checked;
  if (!refundOk || !termsOk || !sensitiveOk) {
    alert('환불정책 + 이용약관 + 민감정보 처리 동의 체크해야 해.');
    return;
  }
  const input = document.getElementById('tossSubReceiptInput');
  if (!input || !input.files || input.files.length === 0) {
    alert('영수증 캡처 먼저 골라줘! 📸');
    return;
  }
  const file = input.files[0];
  if (file.size > 5 * 1024 * 1024) {
    alert('파일 너무 커 (5MB 이하로) 🐚');
    return;
  }
  // 동의 기록
  try {
    const now = new Date().toISOString();
    state.preferences = state.preferences || {};
    state.preferences.consentLog = state.preferences.consentLog || [];
    state.preferences.consentLog.push({ type: 'subscribe_refund',  version: '1.0', confirmed: true, at: now, tier: tierKey, memo_code: memoCode });
    state.preferences.consentLog.push({ type: 'subscribe_terms',   version: '1.0', confirmed: true, at: now, tier: tierKey, memo_code: memoCode });
    state.preferences.consentLog.push({ type: 'subscribe_sensitive_data', version: '1.0', confirmed: true, at: now, tier: tierKey, memo_code: memoCode, scope: 'mental_health_self_observation' });
    saveState();
  } catch (e) { console.warn('subscribe consent log:', e); }

  showToast('🔍 한 번 볼게...');
  try {
    const reader = new FileReader();
    const base64Promise = new Promise((resolve, reject) => {
      reader.onload = () => resolve((reader.result || '').toString().split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const base64 = await base64Promise;
    const arrayBuffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const sha256 = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    const resp = await fetch('/api/billing/verify-toss-subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (session?.access_token || '') },
      body: JSON.stringify({ image_base64: base64, tier: tierKey, user_memo_code: memoCode, image_sha256: sha256 })
    });
    const result = await resp.json();
    if (resp.ok && result.ok && result.verified) {
      const tier = TIER_PLANS_CLIENT[tierKey];
      showToast(`✦ ${tier.label} 구독 한 달 활성화! ${tier.krw.toLocaleString()}원 잘 받았어 🐚`);
      closeTossSubscribeModal();
      if (typeof refreshBillingStatus === 'function') refreshBillingStatus();
    } else {
      alert('어... 영수증을 잘 못 알아봤어 😅 ' + (result.error || '') + '\n\n다시 시도. 안 되면 → ' + KAKAO_OPEN_CHAT);
    }
  } catch (e) {
    alert('오류 😢 ' + (e.message || e) + '\n\n💬 오픈채팅 → ' + KAKAO_OPEN_CHAT);
  }
}

