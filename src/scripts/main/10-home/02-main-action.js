// === 체크인 카드 helper (사용자 명시 2026-05-06: 카드 매력 강화) ===
function getCheckinTimeSlot() {
  const h = new Date().getHours();
  if (h >= 4 && h < 11) return 'morning';
  if (h >= 11 && h < 17) return 'noon';
  if (h >= 17 && h < 21) return 'evening';
  return 'night';
}

function _checkinCardCopy(slot, isDone) {
  if (isDone) return { icon: '✓', title: '오늘 기록 완료', sub: '' };
  const map = {
    morning: { icon: '☀️', title: '오늘 어떻게 시작해?', sub: '어젯밤 잠 + 지금 컨디션 한 줄이면 OK' },
    noon: { icon: '🌤', title: '지금 컨디션 어때?', sub: '30초만. 점심 전후 짚어두자' },
    evening: { icon: '🌅', title: '오늘 지나간 흐름 짚어볼래?', sub: '메모 한 줄로도 충분해' },
    night: { icon: '🌙', title: '오늘 어땠어?', sub: '하루 닫고 자기 전 한 호흡' }
  };
  return map[slot] || map.night;
}

function _shiftDateKey(key, deltaDays) {
  const d = new Date(key + 'T00:00:00');
  d.setDate(d.getDate() + deltaDays);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function getCheckinStreak() {
  const entries = state.entries || [];
  if (!entries.length) return 0;
  const todayK = todayKey();
  const todayE = entries.find(e => e.date === todayK);
  let streak = 0;
  let cursorKey;
  if (todayE && (todayE.vitality || todayE.mood || todayE.note)) {
    streak = 1;
    cursorKey = _shiftDateKey(todayK, -1);
  } else {
    cursorKey = _shiftDateKey(todayK, -1);
  }
  while (streak < 365) {
    const e = entries.find(en => en.date === cursorKey);
    if (e && (e.vitality || e.mood || e.note)) {
      streak++;
      cursorKey = _shiftDateKey(cursorKey, -1);
    } else {
      break;
    }
  }
  return streak;
}

function getYesterdayMoodSummary() {
  const yKey = _shiftDateKey(todayKey(), -1);
  const entry = (state.entries || []).find(e => e.date === yKey);
  if (!entry) return null;
  const vEmojis = ['😵', '😴', '🙂', '😊', '✨'];
  const mEmojis = ['😞', '😐', '🙂', '😊', '✨'];
  const v = entry.vitality ? vEmojis[entry.vitality - 1] : null;
  const m = entry.mood ? mEmojis[entry.mood - 1] : null;
  if (!v && !m) return null;
  return { vitalityEmoji: v, moodEmoji: m };
}

function _todayMoodSummaryHtml(entry) {
  if (!entry) return '';
  const vEmojis = ['😵', '😴', '🙂', '😊', '✨'];
  const mEmojis = ['😞', '😐', '🙂', '😊', '✨'];
  const parts = [];
  if (entry.vitality) parts.push(`⚡${vEmojis[entry.vitality - 1]}`);
  if (entry.mood) parts.push(`💭${mEmojis[entry.mood - 1]}`);
  if (!parts.length && entry.note) return '메모 한 줄 적어뒀어';
  if (!parts.length) return '기록됨';
  return parts.join(' · ');
}

function renderMainAction() {
  const container = document.getElementById('mainActionContainer');
  if (!container) return;

  // V3.13.x: 튜토리얼 모드면 시간대/체크인 여부 무관하게 체크인 카드 강제
  if (window._onbTutorialMode) {
    container.innerHTML = `
      <div class="action-card checkin-card" onclick="enterCheckin()" style="background: linear-gradient(135deg, rgba(139,126,196,0.18), rgba(45,40,80,0.15)); border-color: rgba(139,126,196,0.35);">
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

  const todayKeyVal = todayKey();
  const todayEntry = state.entries.find(e => e.date === todayKeyVal);
  const checkinDoneToday = !!(todayEntry && (todayEntry.vitality || todayEntry.note));
  const slot = getCheckinTimeSlot();
  const copy = _checkinCardCopy(slot, checkinDoneToday);
  const streak = getCheckinStreak();
  const streakHtml = streak > 0 ? `<span class="streak-chip">🌊 ${streak}일째</span>` : '';

  let cardHtml;
  if (checkinDoneToday) {
    const summary = _todayMoodSummaryHtml(todayEntry);
    cardHtml = `
      <div class="action-card checkin-card is-done" onclick="enterCheckin()">
        ${streakHtml}
        <div class="action-icon">${copy.icon}</div>
        <div class="action-text">
          <div class="action-title">${copy.title}</div>
          <div class="action-sub">${summary}</div>
        </div>
        <div class="action-arrow">›</div>
      </div>
    `;
  } else {
    const ySum = getYesterdayMoodSummary();
    let yPreview = '';
    if (ySum) {
      const parts = [];
      if (ySum.vitalityEmoji) parts.push(`⚡${ySum.vitalityEmoji}`);
      if (ySum.moodEmoji) parts.push(`💭${ySum.moodEmoji}`);
      yPreview = `<div class="yesterday-preview">어제 ${parts.join(' · ')}</div>`;
    }
    cardHtml = `
      <div class="action-card checkin-card" onclick="enterCheckin()" style="background: linear-gradient(135deg, rgba(139,126,196,0.18), rgba(45,40,80,0.15)); border-color: rgba(139,126,196,0.35);">
        ${streakHtml}
        <div class="action-icon">${copy.icon}</div>
        <div class="action-text">
          <div class="action-title">${copy.title}</div>
          <div class="action-sub">${copy.sub}</div>
          ${yPreview}
        </div>
        <div class="action-arrow">›</div>
      </div>
    `;
  }

  // V4 (사용자 명시 2026-05-06): '오늘의 너' 큐레이션 = 최상단. 체크인 카드 = 그 아래.
  let heroHtml = '';
  if (typeof _pickHeroPearl === 'function' && typeof _heroCardHtml === 'function' && typeof _heroEmptyHtml === 'function') {
    const pick = _pickHeroPearl();
    const inner = pick ? _heroCardHtml(pick, { linkTo: 'pearls-tab' }) : _heroEmptyHtml();
    if (inner) heroHtml = `<div style="margin-bottom: 14px;">${inner}</div>`;
  }

  container.innerHTML = heroHtml + cardHtml;
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
