// V4 (사용자 명시 2026-05-17 ultrathink): 간단 튜토 모달 — single page or multi-page chain.
//   opts: { key (optional persistence — _shownInlineTips guard), pages: [{html}], onClose }
//   key 있으면 _shownInlineTips 에 push 후 영구 dismiss. 다시 안 뜸. key 없으면 매번 노출 (직접 호출 dev / preview 용).
//
// 사용처:
//   - 모래사장 첫 진입 (key='firstShell', 1 page)
//   - 게스트 첫 '더 알아보기' 나타남 (key='firstDeeperBtn', 2 pages chain)
//
// 토스트 (_showInlineTip) 보다 강조 + 메시지 길이 자유. 사용자 명시적 dismiss 필요.

function _showSimpleTutoModal(opts) {
  if (!opts || !Array.isArray(opts.pages) || opts.pages.length === 0) return;
  // 영구 dismiss 가드
  if (opts.key) {
    if (!Array.isArray(state._shownInlineTips)) state._shownInlineTips = [];
    if (state._shownInlineTips.includes(opts.key)) return;
    state._shownInlineTips.push(opts.key);
    try { saveState(); } catch {}
  }
  // 중복 노출 방지
  const existing = document.getElementById('simpleTutoOverlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'simpleTutoOverlay';
  overlay.className = 'simple-tuto-overlay';
  document.body.appendChild(overlay);

  let idx = 0;
  const total = opts.pages.length;

  function _renderPage() {
    const p = opts.pages[idx] || {};
    const isLast = idx === total - 1;
    const btnLabel = isLast ? '알겠어' : '다음 →';
    const dots = total > 1
      ? `<div class="simple-tuto-dots">${opts.pages.map((_, i) => `<span class="std-dot ${i === idx ? 'is-active' : ''}"></span>`).join('')}</div>`
      : '';
    overlay.innerHTML = `
      <div class="simple-tuto-card">
        <div class="simple-tuto-body">${p.html || ''}</div>
        ${dots}
        <div class="simple-tuto-actions">
          <button class="simple-tuto-btn" type="button" onclick="_simpleTutoNextOrClose()">${btnLabel}</button>
        </div>
      </div>
    `;
  }
  _renderPage();

  window._simpleTutoNextOrClose = function() {
    idx++;
    if (idx >= total) {
      overlay.classList.remove('show');
      setTimeout(() => {
        overlay.remove();
        delete window._simpleTutoNextOrClose;
        if (typeof opts.onClose === 'function') { try { opts.onClose(); } catch {} }
      }, 200);
      return;
    }
    _renderPage();
  };

  setTimeout(() => overlay.classList.add('show'), 30);
}
