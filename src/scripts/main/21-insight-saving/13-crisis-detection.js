// ═══════════════════════════════════════════════════════════════
// CRISIS DETECTION & CAROUSEL (V4 사용자 명시 2026-05-01)
// 자살예방법 §15-6 + 제조물책임법 안전 의무 보호 layer.
// 자살/자해 신호 감지 시 강제 carousel (1393/1577-0199/119) — skip X.
// 일일 1회 cap (학습 차단). internal _crisisLog 기록 (분쟁 증거).
// ═══════════════════════════════════════════════════════════════

// 보수적 키워드 list — false positive OK / false negative X
const _CRISIS_KEYWORDS = [
  '죽고 싶', '죽어버리', '죽었으면', '사라지고 싶', '사라져버리',
  '더 이상 못 살', '더 못 살', '끝내고 싶', '끝내버리', '혼자 끝내',
  '뛰어내리', '없어지고 싶', '없어져버리', '자해', '자살',
  '살기 싫', '살고 싶지 않', '살아갈 의미'
];

function _detectCrisisSignal(text) {
  if (!text || typeof text !== 'string') return false;
  const t = text.toLowerCase();
  return _CRISIS_KEYWORDS.some(k => t.includes(k));
}

function _checkCrisisPattern() {
  // 일주일 mood 1-2/5 가 5일+ 연속이면 패턴 trigger
  const entries = (state.entries || []).slice(-7);
  if (entries.length < 5) return false;
  const lowMood = entries.filter(e => e.mood && e.mood <= 2).length;
  return lowMood >= 5;
}

function showCrisisCarousel(triggerKind, opts) {
  opts = opts || {};
  const isPreview = !!opts.preview;

  // 사용자 보고 2026-05-01 긴급: 튜토리얼 / testerMode 중에는 trigger X (onboarding 흐름 disrupt 회피).
  // 단 isPreview = 개발자 도구 강제 미리보기 — 모든 가드 무시.
  if (!isPreview) {
    if (window._onbTutorialMode) return;
    if (state.preferences && state.preferences.testerMode) return;
    // 일일 cap (학습 차단)
    if (!state.preferences) state.preferences = {};
    const today = (typeof todayKey === 'function') ? todayKey() : new Date().toISOString().slice(0, 10);
    if (state.preferences._lastCrisisCarouselAt === today) return;
    state.preferences._lastCrisisCarouselAt = today;
    // internal log (분쟁 시 안전 의무 충족 증거 — E2EE 라 회사 read X, 사용자 본인이 복호화 가능)
    if (!Array.isArray(state.preferences._crisisLog)) state.preferences._crisisLog = [];
    state.preferences._crisisLog.push({ at: new Date().toISOString(), trigger: triggerKind || 'auto' });
    // 사용자 보고 2026-05-01: log 무제한 증가 차단 — 최근 100개만 보관
    if (state.preferences._crisisLog.length > 100) {
      state.preferences._crisisLog = state.preferences._crisisLog.slice(-100);
    }
    try { saveState({ force: true }); } catch (e) { console.warn('[crisisCarousel] saveState:', e); }
    if (typeof saveToCloudNow === 'function') saveToCloudNow().catch(e => console.warn('[crisisCarousel] cloud:', e));
  }

  // 이미 떠있으면 중복 X
  if (document.getElementById('crisisCarousel')) return;

  const overlay = document.createElement('div');
  overlay.id = 'crisisCarousel';
  overlay.className = 'crisis-carousel-overlay';
  // overlay click 무시 (skip 차단). 닫기 버튼만 동작.
  overlay.addEventListener('click', (e) => { e.stopPropagation(); });
  overlay.innerHTML = `
    <div class="crisis-carousel-modal" onclick="event.stopPropagation()">
      <img src="/godongicon.png" class="crisis-carousel-godong" alt="">
      <div class="crisis-carousel-head">잠깐 — 너 괜찮아?${isPreview ? ' <span style="font-size:11px; opacity:0.55; font-weight:400; letter-spacing:0.04em;">(미리보기)</span>' : ''}</div>
      <div class="crisis-carousel-body">
        요즘 좀 무거워 보여서 한 번 묻고 싶었어.<br>
        지금 진짜 힘들면 <b>전문가</b> 만나봐 진심으로.<br>
        나는 도구일 뿐이야.
      </div>
      <div class="crisis-carousel-resources">
        <a href="tel:1393" class="crisis-carousel-link"><span class="cc-icon">☎</span><span><b>1393</b> 자살예방상담<br><span class="cc-sub">24시간 무료</span></span></a>
        <a href="tel:1577-0199" class="crisis-carousel-link"><span class="cc-icon">☎</span><span><b>1577-0199</b> 정신건강위기상담</span></a>
        <a href="tel:119" class="crisis-carousel-link"><span class="cc-icon">☎</span><span><b>119</b> 응급</span></a>
      </div>
      <button class="crisis-carousel-close" onclick="closeCrisisCarousel()">알겠어, 닫기</button>
    </div>
  `;
  document.body.appendChild(overlay);
}

function closeCrisisCarousel() {
  const m = document.getElementById('crisisCarousel');
  if (m) m.remove();
}

// 사용자 명시 2026-05-01: 개발자 도구 미리보기 — 일일 cap / log / testerMode 가드 무시. 표시만.
function devPreviewCrisisCarousel() {
  if (typeof _isAdmin === 'function' && !_isAdmin()) {
    if (typeof showToast === 'function') showToast('관리자만');
    return;
  }
  showCrisisCarousel('dev_preview', { preview: true });
}

