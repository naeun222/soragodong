// === 체크인 카드 helper (사용자 명시 2026-05-06: 카드 매력 강화) ===
function getCheckinTimeSlot() {
  const h = new Date().getHours();
  if (h >= 4 && h < 11) return 'morning';
  if (h >= 11 && h < 17) return 'noon';
  if (h >= 17 && h < 21) return 'evening';
  return 'night';
}

function _checkinCardCopy(slot, isDone) {
  // 사용자 명시 2026-05-08 (재): 옛 hero 문구 (이모티콘+단어) 복원 + 평문 한 문장 sub.
  if (isDone) return { icon: '✓', title: '오늘 기록 완료', sub: '' };
  const map = {
    morning: { icon: '☀️', title: '오늘 어떻게 시작해?', sub: '오늘 어떻게 시작하는지 한 줄 적어둘래?' },
    noon:    { icon: '🌤', title: '지금 컨디션 어때?',  sub: '지금 컨디션 어떤지 한 줄로 짚어둘래?' },
    evening: { icon: '🌅', title: '오늘 지나간 흐름 짚어볼래?', sub: '오늘 지나간 흐름 메모 한 줄로 적어둘래?' },
    night:   { icon: '🌙', title: '오늘 어땠어?', sub: '오늘 어땠는지 한 호흡 닫아볼래?' }
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

  let cardHtml;
  if (checkinDoneToday) {
    // 사용자 명시 2026-05-09: 카드 X — 작은 한 줄 텍스트만 (예전 형태 복원).
    cardHtml = `
      <div class="checkin-mini-line" onclick="enterCheckin()">
        <span class="checkin-mini-text">오늘 기록 완료</span>
        <span class="checkin-mini-arrow">›</span>
      </div>
    `;
  } else {
    // 사용자 명시 2026-05-06 ultrathink: 신규 사용자 (entries 0개) — 카드 우측 상단 깜빡이는 점 (has-pulse).
    const isBrandNew = !Array.isArray(state.entries) || state.entries.length === 0;
    const pulseClass = isBrandNew ? ' has-pulse' : '';
    const subHtml = copy.sub ? `<div class="action-sub checkin-card-sub">${copy.sub}</div>` : '';
    cardHtml = `
      <div class="action-card checkin-card${pulseClass}" onclick="enterCheckin()" style="background: linear-gradient(135deg, rgba(139,126,196,0.18), rgba(45,40,80,0.15)); border-color: rgba(139,126,196,0.35);">
        <div class="action-icon">${copy.icon}</div>
        <div class="action-text">
          <div class="action-title">${copy.title}</div>
          ${subHtml}
        </div>
        <div class="action-arrow">›</div>
      </div>
    `;
  }

  // 사용자 명시 2026-05-09 (ultrathink): 진주 hero 자리 = 회전 카드 source 1 으로 이동.
  // mainActionContainer = 체크인 카드 only (완료 시 한 줄 미니 / 미완 시 시간대 카드).
  container.innerHTML = cardHtml;
}

// 마법의 소라고동 미니 링크 — 작지만 카드 모양
// 사용자 명시 2026-05-09 (#7, spec 5-3): 활성 결정 + 활성 숙고 둘 다 카운트. reflectionContainer zone 폐기 흡수.
function renderDecisionMiniLink() {
  const container = document.getElementById('decisionMiniLinkContainer');
  if (!container) return;

  const decisionCount = (state.decisions || []).filter(d => d.status === 'in_progress').length;
  const reflectionCount = (state.reflectionQuestions || []).filter(q => q.status === 'active').length;
  const totalActive = decisionCount + reflectionCount;
  // 사용자 명시 2026-05-09: 활성 ≥1 → "N 안고 있어" / 활성 0 → "풀어볼래" (짧게)
  const subText = totalActive > 0 ? `${totalActive} 안고 있어` : '풀어볼래';

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
