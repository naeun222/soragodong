function renderMainAction() {
  const container = document.getElementById('mainActionContainer');
  if (!container) return;

  // V3.13.x: 튜토리얼 모드면 시간대/체크인 여부 무관하게 체크인 카드 강제
  // (낮엔 체크인 카드가 작은 링크 또는 아예 없어서 튜토리얼 spotlight 못 잡힘)
  if (window._onbTutorialMode) {
    container.innerHTML = `
      <div class="action-card" onclick="enterCheckin()" style="background: linear-gradient(135deg, rgba(139,126,196,0.18), rgba(45,40,80,0.15)); border-color: rgba(139,126,196,0.35);">
        <div class="action-icon">✓</div>
        <div class="action-text">
          <div class="action-title">체크인</div>
          <div class="action-sub">매일 짧게 기록하는 곳</div>
        </div>
        <div class="action-arrow">›</div>
      </div>
    `;
    return;
  }

  const isNight = isNightTime();
  const todayKeyVal = todayKey();
  const todayEntry = state.entries.find(e => e.date === todayKeyVal);
  const checkinDoneToday = !!(todayEntry && (todayEntry.vitality || todayEntry.note));
  
  // V3.13.x: 메인 카드 + 작은 체크인 링크 항상 (이미 했어도 들어가서 수정 가능)
  let mainCard;
  if (isNight && !checkinDoneToday) {
    // 밤 + 미체크인: 체크인 메인
    mainCard = `
      <div class="action-card" onclick="enterCheckin()" style="background: linear-gradient(135deg, rgba(139,126,196,0.18), rgba(45,40,80,0.15)); border-color: rgba(139,126,196,0.35);">
        <div class="action-icon">🌙</div>
        <div class="action-text">
          <div class="action-title">오늘 어땠어?</div>
          <div class="action-sub">하루를 차분히 닫아보자</div>
        </div>
        <div class="action-arrow">›</div>
      </div>
    `;
  } else {
    // V4 (사용자 명시 2026-05-05): 실행 카드 제거 → '오늘의 너' 큐레이션 (도서관 hero 동일).
    // 진주 0개면 '첫 진주 추가' 유도 카드 (_heroEmptyHtml).
    if (typeof _pickHeroPearl === 'function' && typeof _heroCardHtml === 'function' && typeof _heroEmptyHtml === 'function') {
      const pick = _pickHeroPearl();
      mainCard = pick ? _heroCardHtml(pick) : _heroEmptyHtml();
    } else {
      mainCard = '';
    }
  }
  // 메인 카드가 체크인 아닐 때 항상 작은 링크 노출 (이미 했어도 수정 가능)
  let checkinSubLink = '';
  if (!(isNight && !checkinDoneToday)) {
    const label = checkinDoneToday ? '✓ 오늘 체크인 보기 / 수정' : '✨ 오늘 체크인하기 →';
    checkinSubLink = `<div onclick="enterCheckin()" style="font-size:12px; color:var(--text-dim); padding:10px 14px; text-align:center; cursor:pointer; margin-top:6px;">${label}</div>`;
  }
  container.innerHTML = mainCard + checkinSubLink;
}

// 마법의 소라고동 미니 링크 — 작지만 카드 모양
function renderDecisionMiniLink() {
  const container = document.getElementById('decisionMiniLinkContainer');
  if (!container) return;

  // 진행 중인 결정 개수
  const inProgressCount = (state.decisions || []).filter(d => d.status === 'in_progress').length;
  const subText = inProgressCount > 0 ? `숙성 중 ${inProgressCount}개` : '14일 숙성';

  container.innerHTML = `
    <div onclick="showScreen('decisions')" class="decision-mini-card">
      <div class="dm-icon"><img src="/godong.webp" alt="" class="godong-icon" decoding="async"></div>
      <div class="dm-text">
        <div class="dm-title">마법고동</div>
        <div class="dm-sub">${subText}</div>
      </div>
      <div class="dm-arrow">›</div>
    </div>
  `;
  // V4: 잠금 시각 갱신
  setTimeout(() => { if (typeof applyCoreLockMarkers === 'function') applyCoreLockMarkers(); }, 0);
}

// V3.7: Today's Shell 제거 — 자존감 외부화 / habituation / Anti-sycophancy 충돌 우려.
// 함수는 stub으로 남김 (호출처가 어딘가 남아있을 경우 안전).
async function renderTodaysShell() { return; }
async function generateTodaysShellContent() { return ''; }
function refreshTodaysShell() { return; }

// V3.7: renderModeDisplay / expandModeRow — modeDisplay element가 HTML에 없음 (dead code).
// 안전을 위해 stub으로 유지. 실제 사용되는 함수는 renderModes.
function renderModeDisplay() {
  // mode-chip 상태 동기화는 renderModes가 처리함
  document.querySelectorAll('.mode-chip').forEach(c => {
    const m = c.dataset.mode;
    c.classList.toggle('active', !!state.modes[m]);
  });
}
function expandModeRow() { return; }

// Conditional decision card - only on action days (3/5/7/10/14)
