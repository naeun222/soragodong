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
    night:   { icon: '🌙', title: '오늘 하루 닫아보기', sub: '' }
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

// buildCheckinCardHtml 폐기 (사용자 명시 2026-05-17 ultrathink revert) — 회전카드 _rcBuildCheckinBodyHtml 가 _checkinCardCopy/getCheckinTimeSlot 를 직접 호출.
// renderMainAction noop — mainActionContainer HTML 컨테이너만 compat 보존.
function renderMainAction() {
  const container = document.getElementById('mainActionContainer');
  if (!container) return;
  container.innerHTML = '';
}

// 사용자 명시 2026-05-17 ultrathink: 마법고동 mini 카드 홈에서 제거 — renderDecisionMiniLink noop.
//   호출처 (init-fn / navigation) 의 container null guard 가 자연 no-op. openMagicReflectionChooser 본체 보존 (다른 진입점 가능성).
function renderDecisionMiniLink() { /* noop — 2026-05-17 홈에서 마법고동 카드 제거 */ }

// 사용자 명시 2026-05-09: 마법고동 카드 클릭 → 숙고/마법 chooser 모달.
// 진입 path 분기: '마법의 방' = decisions screen / '숙고의 방' = active 숙고 → reflection screen / 활성 0 → addReflectionQuestion 입력 모달.
function openMagicReflectionChooser() {
  const existing = document.getElementById('magicChooser');
  if (existing) existing.remove();
  const decisionCount = (state.decisions || []).filter(d => d.status === 'in_progress').length;
  const reflectionCount = (state.reflectionQuestions || []).filter(q => q.status === 'active').length;
  const overlay = document.createElement('div');
  overlay.id = 'magicChooser';
  overlay.className = 'magic-chooser-overlay';
  overlay.innerHTML = `
    <div class="magic-chooser-card">
      <div class="magic-chooser-header">
        <div class="magic-chooser-title">어디로 갈래?</div>
        <button class="magic-chooser-close" type="button" onclick="closeMagicChooser()" aria-label="닫기">×</button>
      </div>
      <div class="magic-chooser-options">
        <button class="magic-chooser-opt" type="button" onclick="closeMagicChooser(); showScreen('decisions');">
          <div class="mco-icon"><img src="/character/godong-wizard.svg" alt="" class="godong-icon godong-mood-wizard" decoding="async"></div>
          <div class="mco-text">
            <div class="mco-title">마법의 방</div>
            <div class="mco-sub">${decisionCount > 0 ? `${decisionCount}개 숙성 중` : '14일 숙성으로 큰 결정'}</div>
          </div>
          <div class="mco-arrow">›</div>
        </button>
        <button class="magic-chooser-opt" type="button" onclick="closeMagicChooser(); _enterReflectionRoom();">
          <div class="mco-icon mco-icon-emoji">🌊</div>
          <div class="mco-text">
            <div class="mco-title">숙고의 방</div>
            <div class="mco-sub">${reflectionCount > 0 ? `${reflectionCount}개 안고 있어` : '질문 풀어보기'}</div>
          </div>
          <div class="mco-arrow">›</div>
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  setTimeout(() => overlay.classList.add('show'), 30);
  // overlay 외 영역 클릭 시 닫기
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeMagicChooser();
  });
}

function closeMagicChooser() {
  const m = document.getElementById('magicChooser');
  if (!m) return;
  m.classList.remove('show');
  setTimeout(() => m.remove(), 200);
}

function _enterReflectionRoom() {
  const active = (state.reflectionQuestions || []).find(q => q.status === 'active');
  if (active) {
    if (typeof showScreen === 'function') showScreen('reflection');
  } else if (typeof addReflectionQuestion === 'function') {
    addReflectionQuestion();
  }
}

// Conditional decision card - only on action days (3/5/7/10/14)
