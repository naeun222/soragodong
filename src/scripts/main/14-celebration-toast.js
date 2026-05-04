// ═══════════════════════════════════════════════════════════════
// CELEBRATION / TOAST
// ═══════════════════════════════════════════════════════════════
function showCelebration(emoji, text, shell) {
  const el = document.getElementById('celebration');
  document.getElementById('celebrationEmoji').textContent = emoji;
  document.getElementById('celebrationText').textContent = text;
  document.getElementById('celebrationShell').textContent = shell;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 1800);
}

// 사용자 명시 2026-05-01 (agent audit): toast queue — 빠른 연속 호출 시 첫 메시지 사용자 못 보던 자리 fix.
let _toastQueue = [];
let _toastShowing = false;
function _toastDrain() {
  const next = _toastQueue.shift();
  if (!next) { _toastShowing = false; return; }
  _toastShowing = true;
  const el = document.getElementById('toast');
  if (!el) { _toastShowing = false; return; }
  el.textContent = next;
  el.classList.add('show');
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(_toastDrain, 200);  // 다음 표시까지 200ms 간격
  }, 2500);
}
function showToast(msg) {
  _toastQueue.push(msg);
  if (!_toastShowing) _toastDrain();
  // 사용자 명시 2026-05-02: 실패/오류 키워드 자동 감지 → 관리자 보고 (showToast 호출 50+ 자리 swap 회피).
  try {
    const s = String(msg || '');
    if (s && (s.includes('실패') || s.includes('오류') || s.includes('❌') || s.includes('⚠️') || /error/i.test(s))) {
      if (typeof _maybeReportRuntimeError === 'function') {
        _maybeReportRuntimeError('User-facing toast', s);
      }
    }
  } catch (_) {}
}

// V4 (사용자 명시): critical error 모달 — 자동 사라짐 X, 전체 메시지 표시 + 📋 복사 버튼.
// 디버깅 빠르게 하려고 추가 (압축 실패 같은 case). 사용자가 message 복사 → 채팅에 붙여넣기.
// 사용자 명시 2026-05-02: 오류 자동 관리자 보고 — 복사 button 제거, fire-and-forget POST.
// 비로그인 시 = 보내기 X (silent).
async function _reportErrorToAdmin(title, details) {
  try {
    if (typeof session === 'undefined' || !session || !session.access_token) return;
    const body = `[🐛 자동 오류 보고] ${title}\n\n${String(details || '').slice(0, 4000)}\n\n---\n앱 버전: ${typeof APP_VERSION !== 'undefined' ? APP_VERSION : 'unknown'}\n시각: ${new Date().toISOString()}\n사용자: ${typeof authUserId !== 'undefined' ? (authUserId || 'unknown') : 'unknown'}\nUA: ${navigator.userAgent || 'unknown'}\nURL: ${location.pathname}`;
    await _authedFetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: body })
    });
  } catch (e) { console.warn('[error-report] 전송 실패:', e); }
}

// 사용자 명시 2026-05-02: showToast / alert wrapper — 사용자 facing 오류 메시지 + 자동 관리자 보고 동시.
function _failToast(msg, errOpt) {
  if (typeof showToast === 'function') showToast(msg);
  const details = errOpt ? (errOpt.stack || errOpt.message || String(errOpt)) : '';
  _maybeReportRuntimeError('User-facing toast', String(msg) + (details ? '\n\n' + details : ''));
}
function _failAlert(msg, errOpt) {
  alert(msg);
  const details = errOpt ? (errOpt.stack || errOpt.message || String(errOpt)) : '';
  _maybeReportRuntimeError('User-facing alert', String(msg) + (details ? '\n\n' + details : ''));
}

// 사용자 명시 2026-05-02: 전역 unhandled error/promise rejection 자동 capture (50+ catch 자리 일괄 변경 회피).
// Rate limit — 같은 오류 1 세션 1회 + global 5건/분 (사용자 spam 차단).
const _reportedErrorsThisSession = new Set();
let _errorReportCountThisMinute = 0;
let _errorReportMinuteStart = Date.now();
function _maybeReportRuntimeError(title, details) {
  const key = (title + '|' + String(details).slice(0, 200)).toLowerCase();
  if (_reportedErrorsThisSession.has(key)) return;
  // global rate limit — 1분 내 5건 max
  const now = Date.now();
  if (now - _errorReportMinuteStart > 60000) {
    _errorReportMinuteStart = now;
    _errorReportCountThisMinute = 0;
  }
  if (_errorReportCountThisMinute >= 5) return;
  _reportedErrorsThisSession.add(key);
  _errorReportCountThisMinute++;
  _reportErrorToAdmin(title, details);
}
if (typeof window !== 'undefined' && !window._errorListenersInstalled) {
  window._errorListenersInstalled = true;
  // 사용자 명시 2026-05-02: native alert monkey patch — 25+ alert 호출 자리 swap 회피, 자동 키워드 감지 보고.
  if (!window._alertPatched) {
    window._alertPatched = true;
    const _origAlert = window.alert;
    window.alert = function(msg) {
      _origAlert.call(window, msg);
      try {
        const s = String(msg || '');
        if (s && (s.includes('실패') || s.includes('오류') || s.includes('❌') || s.includes('⚠️') || /error/i.test(s))) {
          if (typeof _maybeReportRuntimeError === 'function') {
            _maybeReportRuntimeError('User-facing alert', s);
          }
        }
      } catch (_) {}
    };
  }
  window.addEventListener('error', function(e) {
    if (!e || !e.message) return;
    const msg = e.message + '\n  at ' + (e.filename || '?') + ':' + (e.lineno || '?') + ':' + (e.colno || '?');
    const stack = (e.error && e.error.stack) ? '\n\n' + e.error.stack : '';
    _maybeReportRuntimeError('Runtime Error', msg + stack);
  });
  window.addEventListener('unhandledrejection', function(e) {
    const reason = e && e.reason;
    let details = 'Unknown promise rejection';
    if (reason instanceof Error) details = reason.message + '\n\n' + (reason.stack || '');
    else if (typeof reason === 'string') details = reason;
    else { try { details = JSON.stringify(reason); } catch (_) { details = String(reason); } }
    _maybeReportRuntimeError('Unhandled Promise Rejection', details);
  });
}

async function showErrorDetailModal(title, message) {
  const fullMsg = String(message || '알 수 없는 오류');
  // 사용자 명시 2026-05-02: 오류를 자동으로 관리자한테 보냄 (복사 button 제거, silent fire-and-forget).
  _reportErrorToAdmin(title, fullMsg);
  try {
    await showOptionsModal({
      title: '❌ ' + title,
      message: fullMsg + '\n\n📤 관리자에게 자동으로 전달됐어 — 답변은 [설정 → 받은 답변] 에서.',
      options: [
        { label: '확인', value: 'close' }
      ]
    });
  } catch (_) {
    showToast(title + ': ' + fullMsg.slice(0, 100) + ' (관리자에게 자동 전달)');
  }
}

// 사용자 명시 2026-05-01 (agent audit): modal ESC dismiss 공용 헬퍼.
// 사용: const detach = _registerModalEsc(overlay, () => closeModal()); 닫기 시 detach() 호출.
// 자동 stack — 마지막 등록 모달만 ESC 응답 (중첩 모달 안전).
const _modalEscStack = [];
function _registerModalEsc(overlay, closeFn) {
  if (!overlay || typeof closeFn !== 'function') return () => {};
  const entry = { overlay, closeFn };
  _modalEscStack.push(entry);
  if (_modalEscStack.length === 1) {
    document.addEventListener('keydown', _modalEscHandler);
  }
  return function detach() {
    const idx = _modalEscStack.indexOf(entry);
    if (idx !== -1) _modalEscStack.splice(idx, 1);
    if (_modalEscStack.length === 0) {
      document.removeEventListener('keydown', _modalEscHandler);
    }
  };
}
function _modalEscHandler(e) {
  if (e.key !== 'Escape') return;
  const top = _modalEscStack[_modalEscStack.length - 1];
  if (top && top.closeFn) {
    e.preventDefault();
    try { top.closeFn(); } catch {}
  }
}

// V3.10: prompt() 대체 — 모달로 사용자 입력 받기 (모바일 친화)
// 사용: const text = await showInputModal({ title: '뭐 적어?', placeholder: '...', multiline: false });
// 취소 시 null 반환.
let _imResolve = null;

// 사용자 명시 2026-05-01 (agent audit): modal ESC dismiss detach 함수 넣음.
let _imEscDetach = null;
function _closeInputModal(val) {
  const overlay = document.querySelector('.input-modal-overlay');
  if (!overlay) return;
  overlay.classList.remove('show');
  setTimeout(() => overlay.remove(), 180);
  if (_imEscDetach) { _imEscDetach(); _imEscDetach = null; }
  if (_imResolve) {
    _imResolve(val);
    _imResolve = null;
  }
}
function _closeConfirmModal(val) { _closeInputModal(val); }

// V3.10: picker custom 입력 stub (showOptionsModal에서 동적 설정)
let _customInputHandler = null;
function _openCustomInput() {
  if (_customInputHandler) _customInputHandler();
}

// V3.10: 삭제 확인 단축 헬퍼 — 자주 쓰는 패턴
// 사용: if (!await confirmDelete('이 카드')) return;
async function confirmDelete(what = '이 항목', extra = '') {
  return await showConfirmModal({
    title: `${what} 삭제할까?`,
    message: extra || '되돌릴 수 없어.',
    okLabel: '삭제',
    cancelLabel: '취소'
  });
}

function showInputModal(opts = {}) {
  return new Promise(resolve => {
    _imResolve = resolve;
    const {
      title = '입력',
      message = '',
      placeholder = '',
      defaultValue = '',
      multiline = false,
      okLabel = '확인',
      cancelLabel = '취소',
      maxLength = null
    } = opts;
    
    const overlay = document.createElement('div');
    overlay.className = 'input-modal-overlay';
    overlay.innerHTML = `
      <div class="input-modal" onclick="event.stopPropagation()">
        <div class="input-modal-title">${escapeHtml(title)}</div>
        ${message ? `<div class="input-modal-msg">${escapeHtml(message)}</div>` : ''}
        ${multiline 
          ? `<textarea class="input-modal-field" id="_imField" placeholder="${escapeHtml(placeholder)}" rows="4">${escapeHtml(defaultValue)}</textarea>`
          : `<input type="text" class="input-modal-field" id="_imField" placeholder="${escapeHtml(placeholder)}" value="${escapeHtml(defaultValue)}"${maxLength ? ` maxlength="${maxLength}"` : ''}>`
        }
        <div class="input-modal-actions">
          <button class="input-modal-btn cancel" onclick="_closeInputModal(null)">${escapeHtml(cancelLabel)}</button>
          <button class="input-modal-btn ok" onclick="_closeInputModal(document.getElementById('_imField').value)">${escapeHtml(okLabel)}</button>
        </div>
      </div>
    `;
    overlay.onclick = () => _closeInputModal(null);
    document.body.appendChild(overlay);
    setTimeout(() => overlay.classList.add('show'), 30);
    // 사용자 명시 2026-05-01 (agent audit): ESC = cancel.
    _imEscDetach = _registerModalEsc(overlay, () => _closeInputModal(null));

    if (!multiline) {
      const field = document.getElementById('_imField');
      field.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') _closeInputModal(field.value);
      });
    }

    setTimeout(() => { const f = document.getElementById('_imField'); if (f) f.focus(); }, 80);
  });
}

function showConfirmModal(opts = {}) {
  return new Promise(resolve => {
    _imResolve = resolve;
    const {
      title = '확인',
      message = '',
      okLabel = '예',
      cancelLabel = '아니'
    } = opts;
    
    const overlay = document.createElement('div');
    overlay.className = 'input-modal-overlay';
    overlay.innerHTML = `
      <div class="input-modal" onclick="event.stopPropagation()">
        <div class="input-modal-title">${escapeHtml(title)}</div>
        ${message ? `<div class="input-modal-msg">${escapeHtml(message)}</div>` : ''}
        <div class="input-modal-actions">
          <button class="input-modal-btn cancel" onclick="_closeConfirmModal(false)">${escapeHtml(cancelLabel)}</button>
          <button class="input-modal-btn ok" onclick="_closeConfirmModal(true)">${escapeHtml(okLabel)}</button>
        </div>
      </div>
    `;
    overlay.onclick = () => _closeConfirmModal(false);
    document.body.appendChild(overlay);
    setTimeout(() => overlay.classList.add('show'), 30);
    // 사용자 명시 2026-05-01 (agent audit): ESC = cancel.
    _imEscDetach = _registerModalEsc(overlay, () => _closeConfirmModal(false));
  });
}

// V3.10: picker 모달 — 다지선다 (시간대, 카테고리 등)
// 사용: const choice = await showOptionsModal({ title: '...', options: [{label:'아침', value:'morning'}, ...] });
// 취소 시 null. allowCustom 옵션도 가능 (직접 입력 추가).
function showOptionsModal(opts = {}) {
  return new Promise(resolve => {
    _imResolve = resolve;
    const {
      title = '선택',
      message = '',
      options = [],
      allowCustom = false,
      customLabel = '+ 직접 입력',
      cancelLabel = '취소'
    } = opts;
    
    const overlay = document.createElement('div');
    overlay.className = 'input-modal-overlay';
    
    const optionsHtml = options.map((opt, i) => {
      const label = typeof opt === 'string' ? opt : opt.label;
      const value = typeof opt === 'string' ? opt : opt.value;
      const safeValue = String(value).replace(/'/g, "\\'");
      return `<button class="options-btn" onclick="_closeInputModal('${safeValue}')">${escapeHtml(label)}</button>`;
    }).join('');
    
    overlay.innerHTML = `
      <div class="input-modal" onclick="event.stopPropagation()">
        <div class="input-modal-title">${escapeHtml(title)}</div>
        ${message ? `<div class="input-modal-msg">${escapeHtml(message)}</div>` : ''}
        <div class="options-list">
          ${optionsHtml}
          ${allowCustom ? `<button class="options-btn custom" onclick="_openCustomInput()">${escapeHtml(customLabel)}</button>` : ''}
        </div>
        <div class="input-modal-actions">
          <button class="input-modal-btn cancel" onclick="_closeInputModal(null)">${escapeHtml(cancelLabel)}</button>
        </div>
      </div>
    `;
    overlay.onclick = () => _closeInputModal(null);
    document.body.appendChild(overlay);
    setTimeout(() => overlay.classList.add('show'), 30);
    
    // custom 입력으로 전환
    _customInputHandler = async () => {
      _closeInputModal(undefined);
      _imResolve = resolve;
      const custom = await showInputModal({
        title: title,
        placeholder: '직접 입력',
        okLabel: '확인'
      });
      _imResolve = null;
      _customInputHandler = null;
      resolve(custom);
    };
  });
}

// V3.7: undo 가능한 토스트 — 관찰 친화 회복 가능성
// 사용: showUndoToast('완료됨', () => { task.status = 'active'; saveState(); renderExecute(); })
let _undoToastTimer = null;
function showUndoToast(msg, undoFn, durationMs = 5000) {
  // 기존 undo toast 있으면 즉시 닫기
  const existing = document.getElementById('undoToast');
  if (existing) existing.remove();
  if (_undoToastTimer) { clearTimeout(_undoToastTimer); _undoToastTimer = null; }
  
  const toast = document.createElement('div');
  toast.id = 'undoToast';
  toast.className = 'undo-toast';
  toast.innerHTML = `
    <span class="undo-toast-msg">${escapeHtml(msg)}</span>
    <button class="undo-toast-btn" type="button">되돌리기</button>
  `;
  toast.querySelector('.undo-toast-btn').onclick = (e) => {
    e.stopPropagation();
    try { undoFn(); } catch(err) { console.error('Undo error:', err); }
    toast.classList.add('removing');
    setTimeout(() => toast.remove(), 250);
    if (_undoToastTimer) { clearTimeout(_undoToastTimer); _undoToastTimer = null; }
    showToast('되돌렸어 ✦');
  };
  document.body.appendChild(toast);
  setTimeout(() => toast.classList.add('show'), 30);
  _undoToastTimer = setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 250);
    _undoToastTimer = null;
  }, durationMs);
}

