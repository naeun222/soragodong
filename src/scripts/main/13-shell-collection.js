// ═══════════════════════════════════════════════════════════════
// SHELL COLLECTION
// ═══════════════════════════════════════════════════════════════
// V4 (v8 묶음 9): Core 2 진입 모달 — 4단 응답의 🧬/✦ 버튼이 잠금 상태일 때 안내 (3 진입로 통합)
function _showCore2EntryModal() {
  if (window._showingCore2Entry) return;
  window._showingCore2Entry = true;
  const overlay = document.createElement('div');
  overlay.className = 'core2-entry-modal-overlay';
  overlay.innerHTML = `
    <div class="core2-entry-modal">
      <div class="core2-entry-emoji">🐚</div>
      <div class="core2-entry-title">다음 단계 — 행동 변화</div>
      <div class="core2-entry-body">
        아까 본 4단 분석을 <em>진짜</em> 행동으로 옮기면 어떻게 될까?<br>
        같이 따라가보자 ✨
        <div class="core2-entry-small">(일단 마음에 안 들어도 눌러보자 — 시뮬이라 괜찮아 ✨)</div>
      </div>
      <div class="core2-entry-buttons">
        <button class="core2-entry-btn primary" id="core2EntryAccept">좋아 ✦</button>
        <button class="core2-entry-btn secondary" id="core2EntryDecline">지금 말고</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('show'));
  const cleanup = () => {
    overlay.classList.remove('show');
    setTimeout(() => { try { overlay.remove(); } catch {} }, 200);
    window._showingCore2Entry = false;
  };
  overlay.querySelector('#core2EntryAccept').addEventListener('click', () => { cleanup(); _acceptCore2Entry(); });
  overlay.querySelector('#core2EntryDecline').addEventListener('click', () => { cleanup(); _declineCore2Entry(); });
}
function _acceptCore2Entry() {
  if (typeof startCore2 === 'function') {
    startCore2();
  } else {
    showToast('🐚 잠시만 — 준비 중');
  }
}
function _declineCore2Entry() {
  showToast('🐚 언제든 다시 눌러봐');
}
function _showCore2LockedToast() {
  // V4 (v8 사용자 명시 2026-05-03 ultrathink — v2 §6 명시): 4단 응답 disabled-locked → 단순 토스트.
  // entry modal 자동 권유는 환영 선물 모달 [고마워!] 후 _acceptWelcomeGift 가 trigger (passive 안내).
  showToast('🔒 잠깐만, 다음 단계에서 알려줄게!');
}

// V4 (사용자 명시 2026-05-04 ultrathink V193): 신규 환영 모달 UI 전면 개편 — Core 1 끝 100만 토큰
// 디자인 원칙:
//  · 첫 한 바퀴 완주 축하 + 환영 두 톤 통합 (eyebrow 'celebrate' / 본문 greeting)
//  · godong 아이콘 (브랜드 일관성) + ambient gold glow (modal::before radial)
//  · 토큰 hero: label / amount (대형 그라데이션) / hint — vertical stack
//  · 신뢰 라인 보존 (전상법 §13 / 표시광고법 §3 — '30일 유효 · 자동 결제 X')
//  · 받기 click → backend POST (idempotent) → token block 'received' 색감 변환 → 0.8s 후 닫힘
//  · burst / 별 효과 X (사용자 명시 2026-05-01 탑티어 리디자인 톤 보존)
function _showWelcomeGiftModal() {
  if (window._showingWelcomeGift) return;
  if (document.getElementById('welcomeGiftOverlay')) return;
  window._showingWelcomeGift = true;
  const overlay = document.createElement('div');
  overlay.className = 'welcome-gift-overlay';
  overlay.id = 'welcomeGiftOverlay';
  overlay.innerHTML = `
    <div class="welcome-gift-modal">
      <img class="welcome-gift-godong" src="/godongicon.png" alt="소라고동">
      <div class="welcome-gift-celebrate">🎉 첫 한 바퀴 끝!</div>
      <div class="welcome-gift-greeting">잘 따라왔어 🐚</div>
      <div class="welcome-gift-sub">
        한 달 쓰면 너 자신이<br>
        다르게 보일지도. 🫂
      </div>
      <div class="welcome-gift-token">
        <span class="welcome-gift-token-label">환영 선물 · 무료 체험</span>
        <span class="welcome-gift-token-amount">🐚 100만 토큰</span>
        <span class="welcome-gift-token-hint">약 한 달치 자유로운 대화</span>
      </div>
      <button class="welcome-gift-btn" id="welcomeGiftAccept">받을게</button>
      <div class="welcome-gift-trust">30일 동안 유효 · 자동 결제 X</div>
    </div>
  `;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('show'));
  const btn = overlay.querySelector('#welcomeGiftAccept');
  btn.addEventListener('click', async () => {
    if (btn.dataset._processing === '1') return;
    btn.dataset._processing = '1';
    btn.disabled = true;
    btn.textContent = '받는 중...';
    try { await _acceptWelcomeGift(); } catch (e) { console.warn('[welcome-gift] accept:', e); }
    const tokenEl = overlay.querySelector('.welcome-gift-token');
    if (tokenEl) tokenEl.classList.add('received');
    btn.textContent = '받았어 ✦';
    setTimeout(() => {
      overlay.classList.remove('show');
      setTimeout(() => { try { overlay.remove(); } catch {} }, 300);
      window._showingWelcomeGift = false;
    }, 800);
  });
}
async function _acceptWelcomeGift() {
  // V4 (v8 사용자 명시 2026-05-03 ultrathink — v2 §8): client-side state.welcomeGift 기록 (30일 카운트) + backend POST grant. 신규 진입 즉시 환영 = 폐기, Core 1 끝 환영만 활성.
  state.welcomeGift = {
    grantedAt: new Date().toISOString(),
    tokensGranted: 1_000_000,
    tokensRemaining: 1_000_000,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
  };
  state._welcomeGiftAccepted = true;
  state.preferences = state.preferences || {};
  state.preferences._welcomeBonusShown = true;  // 옛 flag 도 set (재출현 방지)
  try { saveState({ force: true }); } catch {}
  if (typeof saveToCloudNow === 'function') {
    saveToCloudNow().catch(e => console.warn('[welcomeGift] cloud sync:', e));
  }
  // backend POST — idempotent (already_granted 처리). 실제 grant 보장.
  if (typeof session !== 'undefined' && session && session.access_token && typeof _authedFetch === 'function') {
    try {
      const resp = await _authedFetch('/api/billing/welcome-bonus', { method: 'POST' });
      if (resp.ok) {
        const data = await resp.json().catch(() => ({}));
        if (data.already_granted) {
          if (typeof showToast === 'function') showToast('✦ 이미 받았어');
        } else if (data.granted) {
          if (typeof showToast === 'function') showToast('🎁 100만 토큰 받았어 ✦');
        }
        if (typeof refreshBillingStatus === 'function') refreshBillingStatus(false).catch(() => {});
      } else {
        console.warn('[welcomeGift] backend 비-OK:', resp.status);
      }
    } catch (e) { console.warn('[welcomeGift] backend:', e); }
  } else {
    if (typeof showToast === 'function') showToast('🎁 100만 토큰 지급 ✦');
  }
  // V4 (v8 사용자 명시 2026-05-03 ultrathink — v2 §1 [5] / §6 명시): 환영 선물 후 Core 2 자동 unlock 권유 (passive 안내)
  setTimeout(() => {
    if (state._core2NotUnlocked && typeof _showCore2EntryModal === 'function') {
      _showCore2EntryModal();
    }
  }, 600);
}

// V4 (v8 묶음 13): 카드 시각화 모달 — Core 2 튜토리얼 saveMsgAsStrategy 직후 자동
function _showStrategyCardModal(card) {
  if (!card) return;
  if (document.querySelector('.strategy-card-preview-overlay')) return;
  const overlay = document.createElement('div');
  overlay.className = 'strategy-card-preview-overlay';
  overlay.innerHTML = `
    <div class="strategy-card-preview">
      <div class="scp-icon">🧬</div>
      <div class="scp-title">${escapeHtml(card.title || '새 전략')}</div>
      <div class="scp-sub">전략 카드로 양생방에 저장됐어 ✦</div>
      <div class="scp-body">
        ${card.problemContext ? `<div class="scp-row"><span class="scp-row-icon">🔍</span> ${escapeHtml((card.problemContext || '').slice(0, 80))}</div>` : ''}
        ${card.psychConcept ? `<div class="scp-row"><span class="scp-row-icon">💡</span> ${escapeHtml((card.psychConcept || '').slice(0, 80))}</div>` : ''}
        ${card.actionStrategy ? `<div class="scp-row"><span class="scp-row-icon">🌿</span> ${escapeHtml((card.actionStrategy || '').slice(0, 80))}</div>` : ''}
      </div>
      <button class="scp-btn" id="scpClose">계속 ✦</button>
    </div>
  `;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('show'));
  overlay.querySelector('#scpClose').addEventListener('click', _closeStrategyCardModal);
}
function _closeStrategyCardModal() {
  const overlay = document.querySelector('.strategy-card-preview-overlay');
  if (!overlay) return;
  overlay.classList.remove('show');
  setTimeout(() => { try { overlay.remove(); } catch {} }, 200);
}

// V4 (v8 묶음 7): startCore2 — testerMode ON + Core 1 분석 자동 복원 + 🎭 시뮬 배지 + 채팅탭 + click_strategy step
async function startCore2() {
  // 1. 비활성화 풀림
  state._core2NotUnlocked = false;
  // 2. testerMode ON (사용자 본 데이터 격리)
  state.preferences = state.preferences || {};
  if (!state.preferences.testerMode && typeof toggleTesterMode === 'function') {
    try { await toggleTesterMode(); } catch (e) { console.warn('startCore2 testerMode:', e); }
    window._onbAutoTesterMode = true;
  }
  saveState();
  // 3. Core 1 분석 자동 복원 — _intakeArchiveId 또는 첫 archive (옛 사용자 fallback = 시드 시나리오)
  const targetArchive = (Array.isArray(state.chatArchive) && state.chatArchive.length > 0)
    ? (state._intakeArchiveId
        ? state.chatArchive.find(a => a && a.id === state._intakeArchiveId)
        : state.chatArchive[0])
    : null;
  if (targetArchive && Array.isArray(targetArchive.messages) && targetArchive.messages.length > 0) {
    state.chatMessages = JSON.parse(JSON.stringify(targetArchive.messages));
  } else {
    // Fallback (옛 사용자 _intakeArchiveId 없음) — 시드 4단 분석 시나리오
    state.chatMessages = [
      { role: 'user', content: '카페에서 30분 집중 시도해봤는데 잘 안 돼.', timestamp: new Date().toISOString() },
      {
        role: 'assistant',
        content: '[상황]\n카페 30분 집중 시도\n\n[내가 본 것]\n환경 셋업으로 집중 진입을 *시도*하는 패턴 — 좋은 자기 관찰이야 ✦\n\n[이게 뭐냐면]\n환경 단서가 행동을 끌어주는 *행동 prompting*. 의지에 기대는 대신 환경이 하게 만드는 거야.\n\n[이럴 땐 이렇게]\n같은 자리/시간 반복 → 자동으로 집중 모드 진입.\n\n[오늘의 제안]\n오늘 카페에서 30분 노트북 펴고 한 단락 쓰기',
        timestamp: new Date().toISOString(),
        fromDeeper: true,
        proposal: true,
        situation: '카페 30분 집중 시도',
        proposalData: { title: '카페 30분 한 단락' }
      }
    ];
  }
  saveState();
  showToast('🎭 시뮬 모드 시작 — 본 데이터 안전');
  // 4. 채팅탭 진입 + 튜토리얼 시작
  if (typeof showScreen === 'function') showScreen('chat');
  if (typeof renderChat === 'function') renderChat();
  setTimeout(() => {
    const idx = (typeof ONBOARDING_STEPS !== 'undefined') ? ONBOARDING_STEPS.findIndex(s => s && s.id === 'click_strategy') : -1;
    if (idx < 0) { console.warn('[startCore2] click_strategy step missing'); return; }
    _onbStep = idx;
    _onbTutorialMode = true;
    window._onbTutorialMode = true;
    if (typeof _activeCoreId !== 'undefined') _activeCoreId = 'core2';
    if (typeof onbRenderStep === 'function') onbRenderStep();
  }, 400);
}

function _finishCore2() {
  state._beachJustUnlocked = true;
  try { sessionStorage.setItem('soragodong_v4_beach_just_unlocked', '1'); } catch {}
  state.tutorialShown = state.tutorialShown || {};
  state.tutorialShown.core2 = true;
  // testerMode OFF (자동 toggle 한 경우만)
  if (window._onbAutoTesterMode && state.preferences && state.preferences.testerMode) {
    try { toggleTesterMode(); } catch (e) { console.warn('_finishCore2 testerMode OFF:', e); }
    window._onbAutoTesterMode = false;
  }
  state.chatMessages = [];
  saveState();
  if (typeof onbClose === 'function') onbClose();
  showToast('🎭 시뮬 끝 — 모래사장 가보자 ✨');
  if (typeof showScreen === 'function') showScreen('home');
}

function _checkCore2JustFinished() {
  // init 시점 호출 — sessionStorage 또는 state._beachJustUnlocked 체크 → 깜빡임 점 갱신
  if (typeof _refreshBeachPulse === 'function') _refreshBeachPulse();
}

// V4 (v8 묶음 10): startCore3A — worked 첫 경험 → 모래사장 자동 진입 + DNA 소라 안내 4 step
function startCore3A(mission) {
  if (state.tutorialShown && state.tutorialShown.core3a) return;
  if (!mission) return;
  const idx = (typeof ONBOARDING_STEPS !== 'undefined') ? ONBOARDING_STEPS.findIndex(s => s && s.id === 'success_celebrate') : -1;
  if (idx < 0) { console.warn('[startCore3A] success_celebrate step missing'); return; }
  // mission/card 정보 stash — onShow hook 에서 사용
  window._core3aMission = mission;
  if (mission.strategyId) {
    const card = (state.topicCards || []).find(c => c.id === mission.strategyId);
    if (card) window._core3aStrategyName = card.title;
  }
  _onbStep = idx;
  _onbTutorialMode = true;
  window._onbTutorialMode = true;
  if (typeof _activeCoreId !== 'undefined') _activeCoreId = 'core3a';
  if (typeof onbRenderStep === 'function') onbRenderStep();
}

function _finishCore3A() {
  state.tutorialShown = state.tutorialShown || {};
  state.tutorialShown.core3a = true;
  saveState();
  _onbTutorialMode = false;
  window._onbTutorialMode = false;
  if (typeof _activeCoreId !== 'undefined') _activeCoreId = null;
  delete window._core3aMission;
  delete window._core3aStrategyName;
  if (typeof onbClose === 'function') onbClose();
}

// V4 (v8 묶음 10): startCore3B — 진화 yes 분기 첫 경험 → mutation_intro step → onAdvance 가 openMutationChat 자동 진입
function startCore3B(strategyId, missionTitle) {
  if (state.tutorialShown && state.tutorialShown.core3b) {
    if (typeof openMutationChat === 'function') openMutationChat(strategyId, missionTitle);
    return;
  }
  const idx = (typeof ONBOARDING_STEPS !== 'undefined') ? ONBOARDING_STEPS.findIndex(s => s && s.id === 'mutation_intro') : -1;
  if (idx < 0) {
    console.warn('[startCore3B] mutation_intro step missing — fallback to direct openMutationChat');
    if (typeof openMutationChat === 'function') openMutationChat(strategyId, missionTitle);
    return;
  }
  window._core3bStrategyId = strategyId;
  window._core3bMissionTitle = missionTitle;
  _onbStep = idx;
  _onbTutorialMode = true;
  window._onbTutorialMode = true;
  if (typeof _activeCoreId !== 'undefined') _activeCoreId = 'core3b';
  if (typeof onbRenderStep === 'function') onbRenderStep();
}

function _afterMutationIntro() {
  // mutation_intro step 의 [좋아 ✦] 클릭 후 — openMutationChat 자동 진입
  state.tutorialShown = state.tutorialShown || {};
  state.tutorialShown.core3b = true;
  saveState();
  _onbTutorialMode = false;
  window._onbTutorialMode = false;
  if (typeof _activeCoreId !== 'undefined') _activeCoreId = null;
  const sid = window._core3bStrategyId;
  const mt = window._core3bMissionTitle;
  delete window._core3bStrategyId;
  delete window._core3bMissionTitle;
  if (typeof onbClose === 'function') onbClose();
  setTimeout(() => {
    if (typeof openMutationChat === 'function' && sid) openMutationChat(sid, mt);
  }, 300);
}

// V4 (v8 묶음 8): 모래사장 깜빡임 점 — Core 2 끝나고 첫 진입 안내. 클릭하면 cleanup.
function _refreshBeachPulse() {
  const dot = document.getElementById('beachPulseDot');
  if (!dot) return;
  const justUnlocked = !!(state._beachJustUnlocked || (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('soragodong_v4_beach_just_unlocked') === '1'));
  if (justUnlocked) dot.removeAttribute('hidden');
  else dot.setAttribute('hidden', '');
}
function _dismissBeachPulse() {
  state._beachJustUnlocked = false;
  try { sessionStorage.removeItem('soragodong_v4_beach_just_unlocked'); } catch {}
  saveState();
  _refreshBeachPulse();
}

function renderShellBar() {
  const countEl = document.getElementById('shellCount');
  const streakEl = document.getElementById('streakInfo');
  if (!countEl || !streakEl) return;  // FIX: prevent null errors
  countEl.textContent = state.shellCollection.length;
  const recent = state.shellCollection.slice(-7);
  let info = '탭해서 보기 →';
  if (recent.length > 0) {
    info = recent.slice(-3).map(s => s.type).join(' ') + ' →';
  }
  streakEl.innerHTML = info;
  // V4 (v8 묶음 8): 깜빡임 점 갱신 — Core 2 끝나고 첫 진입 안내
  if (typeof _refreshBeachPulse === 'function') _refreshBeachPulse();
}

let _beachTab = 'all';

function openShellCollection() {
  const modal = document.getElementById('shellModal');
  _beachTab = 'all';
  document.querySelectorAll('.beach-tab').forEach(t => t.classList.toggle('active', t.dataset.beachTab === 'all'));
  renderBeach();
  modal.classList.add('active');
  // V4 (v8 묶음 18): 모래사장 첫 진입 inline tip
  if (typeof _showInlineTip === 'function') _showInlineTip('firstShell');
}

function switchBeachTab(tab) {
  _beachTab = tab;
  document.querySelectorAll('.beach-tab').forEach(t => t.classList.toggle('active', t.dataset.beachTab === tab));
  renderBeach();
}

function renderBeach() {
  const sub = document.getElementById('shellSubtext');
  const countEl = document.getElementById('beachCount');
  const tierRow = document.getElementById('beachTierRow');
  const grid = document.getElementById('beachGrid');
  const spotlight = document.getElementById('beachSpotlight');
  const weekly = document.getElementById('beachWeekly');
  if (!grid) return;

  // 사용자 요청 2026-04-29: 튜토리얼 click_new_shell 단계엔 '방금 받은 소라'에 marker 클래스 부착
  // → tutorial-target 셀렉터로 정확히 spotlight 가능 (DNA / seed 아닌 가장 최근 shell)
  let _tutorialTargetShellId = null;
  if (window._onbTutorialMode && typeof _onbStep === 'number' && Array.isArray(ONBOARDING_STEPS)) {
    const _curStep = ONBOARDING_STEPS[_onbStep];
    if (_curStep && _curStep.id === 'click_new_shell') {
      const newest = (state.shellCollection || []).slice().reverse().find(s =>
        s && s._id && !s._id.startsWith('shell_seed') && !_isDnaShell(s)
      );
      _tutorialTargetShellId = newest ? newest._id : null;
    }
  }

  const all = state.shellCollection || [];
  const yearStart = new Date(new Date().getFullYear(), 0, 1).getTime();
  const thisYear = all.filter(s => new Date(s.date).getTime() >= yearStart);
  
  if (sub) sub.textContent = all.length === 0 ? '아직 비어있어. 첫 소라 모아보자.' : '하나하나가 네 작은 흔적';
  if (countEl) countEl.textContent = thisYear.length;
  
  // Tier counts (visual hierarchy: 가벼움 → 특별)
  if (tierRow) {
    const counts = {};
    thisYear.forEach(s => { counts[s.tier || 'unknown'] = (counts[s.tier] || 0) + 1; });
    const tiers = [
      { tier: 'light', emoji: '🐚', label: '가벼움' },
      { tier: 'daily', emoji: '🌀', label: '일상' },
      { tier: 'main', emoji: '🐢', label: '메인' },
      { tier: 'golden', emoji: '🦞', label: '황금' },
      { tier: 'call', emoji: '⭐', label: '부름' },
      { tier: 'legend', emoji: '✨', label: '특별' }
    ];
    tierRow.innerHTML = tiers
      .filter(t => counts[t.tier] > 0)
      .map(t => `<div class="beach-tier tier-${t.tier}" title="${t.label}"><span class="emoji">${t.emoji}</span> <span>${counts[t.tier]}</span></div>`)
      .join('');
  }
  
  // Weekly summary — 일요일 또는 데이터 충분할 때
  if (weekly) {
    const weekAgo = Date.now() - 7 * 86400000;
    const thisWeek = all.filter(s => new Date(s.date).getTime() > weekAgo);
    if (thisWeek.length >= 3) {
      const tierBreakdown = {};
      thisWeek.forEach(s => { tierBreakdown[s.tier] = (tierBreakdown[s.tier] || 0) + 1; });
      const breakdownStr = Object.entries(tierBreakdown)
        .map(([t, c]) => {
          const emoji = ({ light:'🐚', daily:'🌀', main:'🐢', golden:'🦞', call:'⭐', legend:'✨' })[t] || '·';
          return `${emoji}${c}`;
        }).join(' · ');
      weekly.innerHTML = `
        <div class="beach-weekly">
          <div class="beach-weekly-label">— 이번 주 —</div>
          <div class="beach-weekly-count">${thisWeek.length}개</div>
          <div class="beach-weekly-breakdown">${breakdownStr}</div>
        </div>
      `;
    } else {
      weekly.innerHTML = '';
    }
  }
  
  // Spotlight — 가장 빛나는 최근 소라
  if (spotlight) {
    const weekAgo = Date.now() - 7 * 86400000;
    const TIER_RANK = { light: 1, daily: 2, main: 3, golden: 4, call: 5, legend: 6 };
    const recentRare = all
      .filter(s => new Date(s.date).getTime() > weekAgo)
      .sort((a, b) => (TIER_RANK[b.tier] || 0) - (TIER_RANK[a.tier] || 0))[0];
    if (recentRare && ['main', 'golden', 'call', 'legend'].includes(recentRare.tier)) {
      const dateStr = new Date(recentRare.date).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
      spotlight.innerHTML = `
        <div class="beach-spotlight tier-${recentRare.tier}">
          <div class="beach-spotlight-label">✦ 이번 주 가장 빛나는</div>
          <div class="beach-spotlight-emoji">${recentRare.type}</div>
          <div class="beach-spotlight-story">${escapeHtml(recentRare.story || '')}<br>
            <span style="color:var(--text-dim); font-size:10px;">${dateStr}</span>
          </div>
        </div>
      `;
    } else {
      spotlight.innerHTML = '';
    }
  }
  
  // Filter by tab
  let filtered = all;
  if (_beachTab === 'card') {
    filtered = all.filter(s => ['light', 'daily', 'main', 'golden'].includes(s.tier));
  } else if (_beachTab === 'call') {
    filtered = all.filter(s => ['call', 'legend'].includes(s.tier));
  }
  // 'tier' 탭과 'all' 탭은 모든 항목 포함

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="beach-empty" style="grid-column: 1 / -1;">
        <div class="icon">🏖</div>
        ${_beachTab === 'call' ? '아직 소라의 부름 클리어한 적 없어' :
          _beachTab === 'card' ? '아직 오늘의 카드 클리어한 적 없어' :
          '아직 비어있어. 첫 소라 모아보자.'}
      </div>
    `;
    return;
  }

  // V4-1f: DNA 진주 — 모래사장 최상위 티어 (V4 비전 11)
  // state.pearls에 type='dna_pearl'로 저장됨. shellCollection엔 없음.
  // 'tier' 탭 + 'all' 탭에서 최상단 섹션으로 표시. 'card'/'call' 탭에선 X.
  const dnaPearls = (state.pearls || []).filter(p => p.type === 'dna_pearl');
  const showDnaSection = (_beachTab === 'tier' || _beachTab === 'all') && dnaPearls.length > 0;
  // 사용자 요청 2026-04-28: DNA 조각 검출 강화 — strategy generations.shells / attempts.shellId 모두 체크
  // 사용자 보고 2026-05-04 (B14/B15): _dnaShellIdSet 빌드 시 attempt 의 worked/meh 만 인정 — stale 'didnt' shellId / g.shells 잔재 차단.
  const _dnaShellIdSet = new Set();
  (state.topicCards || []).forEach(c => {
    if (c.category !== 'strategy' || !Array.isArray(c.generations)) return;
    c.generations.forEach(g => {
      const _workedShellIds = new Set();
      (g.attempts || []).forEach(a => {
        if (a.shellId && (a.status === 'worked' || a.status === 'meh')) {
          _workedShellIds.add(a.shellId);
          _dnaShellIdSet.add(a.shellId);
        }
      });
      // g.shells fallback — 단 같은 generation 의 worked/meh attempt 와 매칭되어야 인정
      if (Array.isArray(g.shells)) {
        g.shells.forEach(sid => { if (_workedShellIds.has(sid)) _dnaShellIdSet.add(sid); });
      }
    });
  });
  function _isDnaShell(s) {
    if (!s) return false;
    // 사용자 요청 2026-04-28: DNA 조각은 '소라의 부름' tier (call/legend)만 — 일반 오늘카드 소라는 제외
    if (s.tier !== 'call' && s.tier !== 'legend') return false;
    // 사용자 보고 2026-05-04 (B14/B15): missionId 추적 → mission 의 attemptStatus 가 worked/meh 일 때만 DNA. 'didnt'/'skipped'/미해결 (없음) → DNA X.
    if (s.missionId) {
      const _m = (state.missions || []).find(mm => mm.id === s.missionId);
      if (_m && _m.attemptStatus !== 'worked' && _m.attemptStatus !== 'meh') return false;
    }
    if (s._id && _dnaShellIdSet.has(s._id)) return true;
    // 사용자 보고 2026-04-29: legacy fallback이 attemptStatus 체크 없어 결과 체크 안 한 소라도 DNA로 판정. attemptStatus === 'worked' 인 미션만 DNA 인정.
    if (s.missionId && (state.missions || []).some(m => m.id === s.missionId && m.strategyId && m.attemptStatus === 'worked')) return true;
    return false;
  }
  // pearl_design_spec_2026-05-03 §3·§9: 모래사장 미니 진주도 v20 톤 (path별 sphere/halo/rim)
  const dnaSectionHtml = showDnaSection ? `
    <div class="beach-tier-section beach-dna-section">
      <div class="beach-tier-header">🧬 DNA 진주 — 체화 완료 · ${dnaPearls.length}</div>
      <div class="beach-tier-grid">
        ${dnaPearls.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map((p) => _renderDnaPearlMiniV20(p)).join('')}
      </div>
    </div>
  ` : '';

  // V3.13.x: '등급별로' 탭만 티어 그룹화 (높은 등급 먼저). 그 외 탭은 시간순 평면.
  if (_beachTab === 'tier') {
    const TIER_ORDER = [
      { tier: 'legend',  label: '✨ 특별 — 가장 빛나는 등급' },
      { tier: 'call',    label: '⭐ 소라의 부름 — 탑티어' },
      { tier: 'golden',  label: '🦞 황금 — 집중 메인' },
      { tier: 'main',    label: '🐢 메인' },
      { tier: 'daily',   label: '🌀 일상' },
      { tier: 'light',   label: '🐚 가벼움' }
    ];
    const grouped = {};
    filtered.forEach(s => {
      const t = s.tier || 'unknown';
      if (!grouped[t]) grouped[t] = [];
      grouped[t].push(s);
    });
    Object.keys(grouped).forEach(k => {
      grouped[k].sort((a, b) => new Date(b.date) - new Date(a.date));
    });

    let html = dnaSectionHtml;
    TIER_ORDER.forEach(({ tier, label }) => {
      if (!grouped[tier] || grouped[tier].length === 0) return;
      html += `<div class="beach-tier-section">
        <div class="beach-tier-header">${label} · ${grouped[tier].length}</div>
        <div class="beach-tier-grid">`;
      grouped[tier].forEach(s => {
        const isDnaPiece = _isDnaShell(s);
        const isTutorialTarget = _tutorialTargetShellId && s._id === _tutorialTargetShellId;
        html += `<div class="beach-shell tier-${tier}${isDnaPiece ? ' dna-shell' : ''}${isTutorialTarget ? ' tutorial-target' : ''}" onclick="openShellStory(${state.shellCollection.indexOf(s)})" title="${isDnaPiece ? '🧬 가닥 DNA 조각' : ''}">${s.type}</div>`;
      });
      html += `</div></div>`;
    });
    grid.innerHTML = html;
  } else {
    // 시간순 평면 (최신 위)
    const sorted = filtered.slice().sort((a, b) => new Date(b.date) - new Date(a.date));
    // V4-fix v3 (사용자 보고 — 안 겹치게): 'all' 탭 → 격자 칸 + 칸 안 jitter (overlap 최소화)
    const isAllTab = _beachTab === 'all';
    // shell 개수에 따라 cols 결정 (모바일 ~360px 기준 7 cols, n개 row 자동)
    const cols = 7;
    const cellW = 100 / cols;
    const sortedShellsCnt = filtered.length;
    const rows = Math.max(8, Math.ceil(sortedShellsCnt / cols) + 1);
    // 컨테이너 height: rows * 50 + jitter
    const containerH = Math.max(380, rows * 50);
    const scatterStyle = (s, idx) => {
      if (!isAllTab) return '';
      const seed = (s._id ? s._id.split('').reduce((a,c) => a + c.charCodeAt(0), 0) : idx) * 9301 + 49297;
      // 격자 칸 위치
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      // 칸 중심
      const baseLeft = col * cellW + cellW / 2;
      const baseTop = (row * 100) / rows + (100 / rows) / 2;
      // 칸 내 jitter (작게 — 칸 크기 70%만)
      const jitterX = (((seed * 7) % 11) - 5) * 0.5;       // ±2.5%
      const jitterY = (((seed * 13) % 11) - 5) * 0.5;      // ±2.5%
      const rot = (((seed * 19) % 17) - 8);                // -8deg ~ +8deg
      // shell width 46px → translate -50% 적용해 중심 정렬
      return ` style="left:calc(${(baseLeft + jitterX).toFixed(1)}% - 23px); top:calc(${(baseTop + jitterY).toFixed(1)}% - 23px); transform:rotate(${rot}deg);"`;
    };
    // scatter 컨테이너 height 동적
    if (isAllTab) {
      grid.dataset.scatterRows = rows;
    }
    grid.innerHTML = dnaSectionHtml +
      `<div class="beach-tier-grid${isAllTab ? ' scatter' : ''}">` +
      sorted.map((s, i) => {
        const isDnaPiece = _isDnaShell(s);
        const isTutorialTarget = _tutorialTargetShellId && s._id === _tutorialTargetShellId;
        return `<div class="beach-shell tier-${s.tier || 'unknown'}${isDnaPiece ? ' dna-shell' : ''}${isTutorialTarget ? ' tutorial-target' : ''}"${scatterStyle(s, i)} onclick="openShellStory(${state.shellCollection.indexOf(s)})" title="${isDnaPiece ? '🧬 가닥 DNA 조각' : ''}">${s.type}</div>`;
      }).join('') +
      `</div>`;
  }

  // V3.13.x: 지난 부름 (만료) 섹션 — 다시 받기 가능
  const lostSec = document.getElementById('lostCallsSection');
  if (lostSec) {
    const expired = (state.missions || []).filter(m => m.status === 'expired');
    if (expired.length === 0) {
      lostSec.innerHTML = '';
    } else {
      expired.sort((a, b) => {
        const ta = new Date(a.expiredAt || a.scheduledFor || 0).getTime();
        const tb = new Date(b.expiredAt || b.scheduledFor || 0).getTime();
        return tb - ta;
      });
      lostSec.innerHTML = `
        <div class="lost-calls-section">
          <div class="lost-calls-label">📜 받았지만 못 한 부름 — 다시 받을 수 있어</div>
          <div class="lost-calls-list">
            ${expired.map(m => {
              const dateStr = m.scheduledFor || (m.createdAt ? m.createdAt.slice(0, 10) : '');
              return `
                <div class="lost-call-card">
                  <div class="lost-call-card-info">
                    <div class="lost-call-title">${escapeHtml(m.title || '')}</div>
                    <div class="lost-call-meta">${escapeHtml(dateStr)} 받음</div>
                  </div>
                  <button class="lost-call-resume" onclick="resumeMission('${m.id}')">다시 받기</button>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }
  }
}

// V4-1f: DNA 진주 클릭 → 일반 story 모달 (결정화 의식보다 가벼운 톤).
// 5.7: "결정화 의식 모달 = 1회만. 이후 모래사장 컬렉션 아이템 (일반 소라 story 모달 톤)"
function openDnaPearlStory(pearlId) {
  const pearl = (state.pearls || []).find(p => p.id === pearlId && p.type === 'dna_pearl');
  if (!pearl) return;
  const card = getStrategyCard(pearl.strategyId);

  const dateStr = new Date(pearl.createdAt).toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric'
  });

  // pearl_design_spec_2026-05-03 §3 + §9: v20 진주 SVG (3 path 분기 — gradient/sparkle/strands 차등)
  const path = pearl.embodimentPath || 'one-shot';
  const pathLabel = ({
    'one-shot':        '🌱 빠른 발견',
    'quick-discovery': '🌳 성장의 길',
    'evolved':         '🧬 진화한 길'
  })[path] || '✨ DNA 진주';

  // 진주 안 소라: pearl.shellsUsed 사용 — 비어있으면 즉석 pick (legacy 데이터 호환)
  let shells = (Array.isArray(pearl.shellsUsed) && pearl.shellsUsed.length > 0)
    ? pearl.shellsUsed.slice()
    : pickLegendaryShells(pearl.workedCount || 5);
  if (!Array.isArray(pearl.shellsUsed) || pearl.shellsUsed.length === 0) {
    pearl.shellsUsed = shells.slice();
    if (typeof saveState === 'function') saveState();
  }

  const strands = (path === 'evolved') ? 2 : 1;
  const speed = (path === 'evolved') ? 0.0011 : (path === 'quick-discovery' ? 0.0009 : 0.0006);
  const groupId = ({'one-shot': 'shells-os', 'quick-discovery': 'shells-q', 'evolved': 'shells-e'})[path] || 'shells-os';

  const overlay = document.createElement('div');
  overlay.className = 'shell-story-overlay';
  let _shellEscDetach = null;
  let _pearlRafId = null;
  const _close = () => {
    if (_pearlRafId) { cancelAnimationFrame(_pearlRafId); _pearlRafId = null; }
    if (_shellEscDetach) { _shellEscDetach(); _shellEscDetach = null; }
    overlay.remove();
  };
  overlay.onclick = (e) => { if (e.target === overlay) _close(); };
  overlay.innerHTML = `
    <div class="shell-story-card dna-pearl-story">
      <div class="dna-pearl-stage-v20">
        ${_buildDnaPearlSvgV20(path)}
        <div class="dpv20-sparkle-wrap">${_buildDnaPearlSparklesV20(path)}</div>
      </div>
      <div class="shell-story-tier">${pathLabel}</div>
      <div class="shell-story-date">${dateStr}</div>
      <div class="shell-story-text">${escapeHtml(pearl.content || '')}</div>
      <div style="font-size:11px; color:var(--text-soft); margin-top:8px;">
        ${pearl.totalAttempts || 0}번 시도 · ${pearl.workedCount || 0}번 작동${pearl.totalGens > 1 ? ` · ${pearl.totalGens}세대` : ''}
      </div>
      ${card ? `<div style="font-size:11px; color:var(--text-dim); margin-top:6px;">가닥: ${escapeHtml(card.title)}</div>` : ''}
      <button class="btn-secondary" id="dnaPearlCloseBtn" style="margin-top:18px;">닫기</button>
    </div>
  `;
  document.body.appendChild(overlay);
  const _btn = overlay.querySelector('#dnaPearlCloseBtn');
  if (_btn) _btn.addEventListener('click', _close);
  if (typeof _registerModalEsc === 'function') {
    _shellEscDetach = _registerModalEsc(overlay, _close);
  }
  // helix shell 시뮬 (path별 strands/speed 차등)
  _pearlRafId = _initDnaPearlHelixV20(overlay, groupId, shells, strands, speed);
}

// pearl_design_spec_2026-05-03 §3·§9: 모래사장 미니 진주 (v20 톤 — 정적, 44×44)
function _renderDnaPearlMiniV20(p) {
  const path = p.embodimentPath || 'one-shot';
  const pid = String(p.id || '').replace(/[^a-zA-Z0-9_-]/g, '');
  const isEvolved = path === 'evolved';
  const isQuick   = path === 'quick-discovery';
  const haloColor   = isEvolved ? '#ffd0c0' : (isQuick ? '#ffd870' : '#a8d8a8');
  const sphereLight = isEvolved ? '#fff5e0' : (isQuick ? '#fff5d0' : '#dff5df');
  const sphereMid   = isEvolved ? '#f0d8b8' : (isQuick ? '#ffd870' : '#a8d8a8');
  const sphereDark  = isEvolved ? '#a89dc8' : (isQuick ? '#b8841a' : '#6aa86a');
  const iridLight   = isEvolved ? '#ffc0a8' : (isQuick ? '#fff5b8' : '#e8ffe8');
  const rimStroke   = isEvolved ? `url(#miniRainbow-${pid})` : (isQuick ? '#d4a020' : '#a8d8a8');
  const swirlDef = isEvolved ? `
    <linearGradient id="miniSwirl-${pid}" x1="20%" y1="15%" x2="80%" y2="85%">
      <stop offset="0%"   stop-color="#ffe5d4" stop-opacity="0.5"/>
      <stop offset="50%"  stop-color="#ffd870" stop-opacity="0.3"/>
      <stop offset="100%" stop-color="#9080c0" stop-opacity="0.35"/>
    </linearGradient>` : '';
  const rainbowDef = isEvolved ? `
    <linearGradient id="miniRainbow-${pid}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%"   stop-color="#ff6b6b"/>
      <stop offset="33%"  stop-color="#ffd93d"/>
      <stop offset="66%"  stop-color="#5fcfba"/>
      <stop offset="100%" stop-color="#a89dc8"/>
    </linearGradient>` : '';
  const swirlHtml = isEvolved
    ? `<circle cx="22" cy="22" r="15" fill="url(#miniSwirl-${pid})"/>`
    : '';
  return `<div class="beach-shell beach-dna-shell" onclick="openDnaPearlStory('${p.id}')" title="${escapeHtml(p.content || '')}">
    <svg class="dna-mini-svg" viewBox="0 0 44 44" width="40" height="40" aria-hidden="true">
      <defs>
        <radialGradient id="miniHalo-${pid}" cx="50%" cy="50%" r="50%">
          <stop offset="60%" stop-color="${haloColor}" stop-opacity="0"/>
          <stop offset="80%" stop-color="${haloColor}" stop-opacity="0.55"/>
          <stop offset="100%" stop-color="${haloColor}" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="miniSphere-${pid}" cx="35%" cy="30%" r="65%">
          <stop offset="0%"   stop-color="${sphereLight}" stop-opacity="0.7"/>
          <stop offset="50%"  stop-color="${sphereMid}"   stop-opacity="0.22"/>
          <stop offset="100%" stop-color="${sphereDark}"  stop-opacity="0.1"/>
        </radialGradient>
        <radialGradient id="miniIrid-${pid}" cx="50%" cy="55%" r="45%">
          <stop offset="0%"   stop-color="#ffffff" stop-opacity="0.42"/>
          <stop offset="60%"  stop-color="${iridLight}" stop-opacity="0.18"/>
          <stop offset="100%" stop-color="${iridLight}" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="miniHi-${pid}" cx="35%" cy="28%" r="35%">
          <stop offset="0%"  stop-color="#ffffff" stop-opacity="0.92"/>
          <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
        </radialGradient>
        ${swirlDef}
        ${rainbowDef}
      </defs>
      <circle cx="22" cy="22" r="22" fill="url(#miniHalo-${pid})"/>
      ${swirlHtml}
      <circle cx="22" cy="22" r="15" fill="url(#miniSphere-${pid})"/>
      <circle cx="22" cy="22" r="11" fill="url(#miniIrid-${pid})"/>
      <circle cx="22" cy="22" r="15" fill="none" stroke="${rimStroke}" stroke-width="0.65" stroke-opacity="0.6"/>
      <ellipse cx="18" cy="17" rx="4" ry="2.5" fill="url(#miniHi-${pid})"/>
    </svg>
  </div>`;
}

// pearl_design_spec_2026-05-03 §9-2: 🌱 one-shot SVG
function _buildDnaPearlSvgV20_OS() {
  return `
    <svg id="pearl-os" viewBox="0 0 220 220" style="overflow: visible;">
      <defs>
        <radialGradient id="halo-near-os" cx="50%" cy="50%" r="50%">
          <stop offset="68%" stop-color="#a8d8a8" stop-opacity="0"/>
          <stop offset="80%" stop-color="#a8d8a8" stop-opacity="0.55"/>
          <stop offset="90%" stop-color="#c8ecd8" stop-opacity="0.32"/>
          <stop offset="100%" stop-color="#fff0d8" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="pearl-base-os" cx="35%" cy="30%" r="65%">
          <stop offset="0%"  stop-color="#fff8e8" stop-opacity="0.18"/>
          <stop offset="50%" stop-color="#fff0d8" stop-opacity="0.10"/>
          <stop offset="100%" stop-color="#f5e8d0" stop-opacity="0.06"/>
        </radialGradient>
        <radialGradient id="sphere-os4" cx="35%" cy="30%" r="65%">
          <stop offset="0%"   stop-color="#f5fff5" stop-opacity="0.45"/>
          <stop offset="22%"  stop-color="#dff5df" stop-opacity="0.20"/>
          <stop offset="38%"  stop-color="#c8ecc8" stop-opacity="0.13"/>
          <stop offset="55%"  stop-color="#bce0bc" stop-opacity="0.09"/>
          <stop offset="72%"  stop-color="#a8d8a8" stop-opacity="0.05"/>
          <stop offset="88%"  stop-color="#88c088" stop-opacity="0.06"/>
          <stop offset="100%" stop-color="#6aa86a" stop-opacity="0.08"/>
        </radialGradient>
        <radialGradient id="iridescent-os" cx="50%" cy="55%" r="45%">
          <stop offset="0%"   stop-color="#ffffff" stop-opacity="0.36"/>
          <stop offset="28%"  stop-color="#e8ffe8" stop-opacity="0.20"/>
          <stop offset="55%"  stop-color="#a8d8a8" stop-opacity="0.10"/>
          <stop offset="78%"  stop-color="#ffd0e0" stop-opacity="0.06"/>
          <stop offset="100%" stop-color="#a8d8a8" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="rainbow-rim-os" cx="50%" cy="50%" r="55%">
          <stop offset="60%" stop-color="#ffd0e8" stop-opacity="0"/>
          <stop offset="78%" stop-color="#ffd0e8" stop-opacity="0.18"/>
          <stop offset="88%" stop-color="#c8e0ff" stop-opacity="0.15"/>
          <stop offset="100%" stop-color="#c8e0ff" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="highlight-os4" cx="35%" cy="28%" r="22%">
          <stop offset="0%"  stop-color="#ffffff" stop-opacity="0.95"/>
          <stop offset="40%" stop-color="#ffffff" stop-opacity="0.3"/>
          <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="highlight2-os" cx="50%" cy="50%" r="50%">
          <stop offset="0%"  stop-color="#ffffff" stop-opacity="0.65"/>
          <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="back-reflect-os" cx="50%" cy="50%" r="50%">
          <stop offset="0%"  stop-color="#e8ffe8" stop-opacity="0.5"/>
          <stop offset="60%" stop-color="#a8d8a8" stop-opacity="0.15"/>
          <stop offset="100%" stop-color="#a8d8a8" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="overlay-os4" cx="35%" cy="30%" r="65%">
          <stop offset="0%"  stop-color="#f5fff5" stop-opacity="0.12"/>
          <stop offset="40%" stop-color="#c8ecc8" stop-opacity="0.03"/>
          <stop offset="100%" stop-color="#a8d8a8" stop-opacity="0"/>
        </radialGradient>
        <filter id="glow-os" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="5" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      <circle class="dpv20-halo" cx="110" cy="110" r="105" fill="url(#halo-near-os)" filter="url(#glow-os)"/>
      <circle cx="110" cy="110" r="76" fill="url(#sphere-os4)"/>
      <circle cx="110" cy="110" r="76" fill="url(#pearl-base-os)"/>
      <circle cx="110" cy="110" r="60" fill="url(#iridescent-os)"/>
      <circle cx="110" cy="110" r="76" fill="url(#rainbow-rim-os)" pointer-events="none"/>
      <circle cx="110" cy="110" r="76" fill="none" stroke="#ffffff" stroke-width="0.4" stroke-opacity="0.4" filter="url(#glow-os)"/>
      <circle cx="110" cy="110" r="76" fill="none" stroke="#a8d8a8" stroke-width="0.3" stroke-opacity="0.35"/>
      <ellipse cx="135" cy="142" rx="14" ry="9" fill="url(#back-reflect-os)" pointer-events="none"/>
      <g id="shells-os"></g>
      <circle cx="110" cy="110" r="76" fill="url(#overlay-os4)" pointer-events="none"/>
      <g class="dpv20-highlight-flow" pointer-events="none">
        <ellipse cx="92" cy="85" rx="22" ry="14" fill="url(#highlight-os4)"/>
        <ellipse cx="86" cy="76" rx="5" ry="2.5" fill="#ffffff" opacity="0.85"/>
        <ellipse cx="138" cy="92" rx="8" ry="4" fill="url(#highlight2-os)"/>
      </g>
      <circle class="dpv20-glint" cx="105" cy="50"  r="1.2" fill="#ffffff" style="animation-delay:0s;"/>
      <circle class="dpv20-glint" cx="155" cy="120" r="1"   fill="#ffffff" style="animation-delay:0.7s;"/>
      <circle class="dpv20-glint" cx="78"  cy="150" r="1.3" fill="#ffffff" style="animation-delay:1.4s;"/>
      <circle class="dpv20-glint" cx="60"  cy="100" r="0.9" fill="#ffffff" style="animation-delay:2.1s;"/>
    </svg>
  `;
}

// pearl_design_spec_2026-05-03 §9-3: 🌳 quick-discovery SVG
function _buildDnaPearlSvgV20_Q() {
  return `
    <svg id="pearl-q" viewBox="0 0 220 220" style="overflow: visible;">
      <defs>
        <radialGradient id="halo-near-q" cx="50%" cy="50%" r="50%">
          <stop offset="68%" stop-color="#ffd870" stop-opacity="0"/>
          <stop offset="80%" stop-color="#ffd870" stop-opacity="0.65"/>
          <stop offset="90%" stop-color="#ffe5b8" stop-opacity="0.36"/>
          <stop offset="100%" stop-color="#fff5e0" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="pearl-base-q" cx="35%" cy="30%" r="65%">
          <stop offset="0%"  stop-color="#fff8e0" stop-opacity="0.20"/>
          <stop offset="50%" stop-color="#fff0c8" stop-opacity="0.12"/>
          <stop offset="100%" stop-color="#f5e0b8" stop-opacity="0.06"/>
        </radialGradient>
        <radialGradient id="sphere-q4" cx="35%" cy="30%" r="65%">
          <stop offset="0%"   stop-color="#fffce8" stop-opacity="0.48"/>
          <stop offset="22%"  stop-color="#fff5d0" stop-opacity="0.22"/>
          <stop offset="38%"  stop-color="#ffe9a0" stop-opacity="0.16"/>
          <stop offset="55%"  stop-color="#ffe088" stop-opacity="0.11"/>
          <stop offset="72%"  stop-color="#ffd870" stop-opacity="0.08"/>
          <stop offset="88%"  stop-color="#d4a838" stop-opacity="0.08"/>
          <stop offset="100%" stop-color="#b8841a" stop-opacity="0.1"/>
        </radialGradient>
        <radialGradient id="iridescent-q" cx="50%" cy="55%" r="45%">
          <stop offset="0%"   stop-color="#ffffff" stop-opacity="0.38"/>
          <stop offset="28%"  stop-color="#fff5b8" stop-opacity="0.22"/>
          <stop offset="55%"  stop-color="#ffd870" stop-opacity="0.12"/>
          <stop offset="78%"  stop-color="#ffc8d8" stop-opacity="0.06"/>
          <stop offset="100%" stop-color="#ffd870" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="rainbow-rim-q" cx="50%" cy="50%" r="55%">
          <stop offset="60%" stop-color="#ffd0a8" stop-opacity="0"/>
          <stop offset="78%" stop-color="#ffd0a8" stop-opacity="0.2"/>
          <stop offset="88%" stop-color="#ffe5d0" stop-opacity="0.18"/>
          <stop offset="100%" stop-color="#ffe5d0" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="highlight-q4" cx="35%" cy="28%" r="22%">
          <stop offset="0%"  stop-color="#ffffff" stop-opacity="0.95"/>
          <stop offset="40%" stop-color="#ffffff" stop-opacity="0.32"/>
          <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="highlight2-q" cx="50%" cy="50%" r="50%">
          <stop offset="0%"  stop-color="#ffffff" stop-opacity="0.7"/>
          <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="back-reflect-q" cx="50%" cy="50%" r="50%">
          <stop offset="0%"  stop-color="#fff5b8" stop-opacity="0.55"/>
          <stop offset="60%" stop-color="#ffd870" stop-opacity="0.18"/>
          <stop offset="100%" stop-color="#ffd870" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="overlay-q4" cx="35%" cy="30%" r="65%">
          <stop offset="0%"  stop-color="#fffce8" stop-opacity="0.14"/>
          <stop offset="40%" stop-color="#fff0a8" stop-opacity="0.04"/>
          <stop offset="100%" stop-color="#ffd870" stop-opacity="0"/>
        </radialGradient>
        <pattern id="texture-q4" x="0" y="0" width="14" height="14" patternUnits="userSpaceOnUse">
          <circle cx="7" cy="7" r="0.6" fill="#ffd870" opacity="0.10"/>
        </pattern>
        <filter id="glow-q" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="5.5" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      <circle class="dpv20-halo" cx="110" cy="110" r="105" fill="url(#halo-near-q)" filter="url(#glow-q)"/>
      <circle cx="110" cy="110" r="76" fill="url(#sphere-q4)"/>
      <circle cx="110" cy="110" r="76" fill="url(#pearl-base-q)"/>
      <circle cx="110" cy="110" r="60" fill="url(#iridescent-q)"/>
      <circle cx="110" cy="110" r="76" fill="url(#rainbow-rim-q)" pointer-events="none"/>
      <circle cx="110" cy="110" r="76" fill="url(#texture-q4)" opacity="0.5"/>
      <circle cx="110" cy="110" r="76" fill="none" stroke="#ffffff" stroke-width="0.4" stroke-opacity="0.4" filter="url(#glow-q)"/>
      <circle cx="110" cy="110" r="76" fill="none" stroke="#d4a020" stroke-width="0.3" stroke-opacity="0.35"/>
      <ellipse cx="135" cy="142" rx="14" ry="9" fill="url(#back-reflect-q)" pointer-events="none"/>
      <g id="shells-q"></g>
      <circle cx="110" cy="110" r="76" fill="url(#overlay-q4)" pointer-events="none"/>
      <g class="dpv20-highlight-flow" pointer-events="none">
        <ellipse cx="92" cy="85" rx="22" ry="14" fill="url(#highlight-q4)"/>
        <ellipse cx="86" cy="76" rx="5" ry="2.5" fill="#ffffff" opacity="0.9"/>
        <ellipse cx="138" cy="92" rx="8" ry="4" fill="url(#highlight2-q)"/>
      </g>
      <circle class="dpv20-glint" cx="105" cy="50"  r="1.3" fill="#ffffff" style="animation-delay:0s;"/>
      <circle class="dpv20-glint" cx="155" cy="120" r="1.1" fill="#ffffff" style="animation-delay:0.6s;"/>
      <circle class="dpv20-glint" cx="78"  cy="150" r="1.4" fill="#ffffff" style="animation-delay:1.2s;"/>
      <circle class="dpv20-glint" cx="60"  cy="100" r="1"   fill="#ffffff" style="animation-delay:1.8s;"/>
      <circle class="dpv20-glint" cx="125" cy="68"  r="1.2" fill="#ffffff" style="animation-delay:2.4s;"/>
    </svg>
  `;
}

// pearl_design_spec_2026-05-03 §9-4: 🧬 evolved SVG (swirl + 2 strand)
function _buildDnaPearlSvgV20_E() {
  return `
    <svg id="pearl-e" viewBox="0 0 220 220" style="overflow: visible;">
      <defs>
        <radialGradient id="halo-near-e" cx="50%" cy="50%" r="50%">
          <stop offset="68%" stop-color="#ffd0c0" stop-opacity="0"/>
          <stop offset="80%" stop-color="#ffd0c0" stop-opacity="0.55"/>
          <stop offset="90%" stop-color="#e8c8e0" stop-opacity="0.35"/>
          <stop offset="100%" stop-color="#fff0e0" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="swirl-e4" x1="20%" y1="15%" x2="80%" y2="85%">
          <stop offset="0%"   stop-color="#ffe5d4" stop-opacity="0.32"/>
          <stop offset="30%"  stop-color="#ffc0a8" stop-opacity="0.22"/>
          <stop offset="55%"  stop-color="#ffd870" stop-opacity="0.18"/>
          <stop offset="80%"  stop-color="#88d0c8" stop-opacity="0.22"/>
          <stop offset="100%" stop-color="#9080c0" stop-opacity="0.24"/>
        </linearGradient>
        <radialGradient id="pearl-base-e" cx="35%" cy="30%" r="65%">
          <stop offset="0%"  stop-color="#fff8e8" stop-opacity="0.18"/>
          <stop offset="50%" stop-color="#fff0d8" stop-opacity="0.10"/>
          <stop offset="100%" stop-color="#f0d8b8" stop-opacity="0.06"/>
        </radialGradient>
        <radialGradient id="sphere-e4" cx="35%" cy="30%" r="65%">
          <stop offset="0%"   stop-color="#fffce8" stop-opacity="0.5"/>
          <stop offset="22%"  stop-color="#fff5e0" stop-opacity="0.22"/>
          <stop offset="42%"  stop-color="#fff0d8" stop-opacity="0.14"/>
          <stop offset="62%"  stop-color="#f5e0c0" stop-opacity="0.08"/>
          <stop offset="82%"  stop-color="#d8b890" stop-opacity="0.06"/>
          <stop offset="100%" stop-color="#8a6510" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="iridescent-e" cx="50%" cy="55%" r="45%">
          <stop offset="0%"   stop-color="#ffffff" stop-opacity="0.38"/>
          <stop offset="22%"  stop-color="#fff5b8" stop-opacity="0.22"/>
          <stop offset="48%"  stop-color="#ffc0a8" stop-opacity="0.14"/>
          <stop offset="72%"  stop-color="#c8c0e8" stop-opacity="0.10"/>
          <stop offset="100%" stop-color="#a89dc8" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="rainbow-rim-e" cx="50%" cy="50%" r="55%">
          <stop offset="60%" stop-color="#ffd0e0" stop-opacity="0"/>
          <stop offset="76%" stop-color="#ffd0e0" stop-opacity="0.22"/>
          <stop offset="86%" stop-color="#c0e0ff" stop-opacity="0.18"/>
          <stop offset="100%" stop-color="#c0e0ff" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="highlight-e4" cx="35%" cy="28%" r="22%">
          <stop offset="0%"  stop-color="#ffffff" stop-opacity="0.95"/>
          <stop offset="40%" stop-color="#ffffff" stop-opacity="0.35"/>
          <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="highlight2-e" cx="50%" cy="50%" r="50%">
          <stop offset="0%"  stop-color="#ffffff" stop-opacity="0.7"/>
          <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="back-reflect-e" cx="50%" cy="50%" r="50%">
          <stop offset="0%"  stop-color="#ffe5d4" stop-opacity="0.5"/>
          <stop offset="60%" stop-color="#a89dc8" stop-opacity="0.18"/>
          <stop offset="100%" stop-color="#a89dc8" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="overlay-e4" cx="35%" cy="30%" r="65%">
          <stop offset="0%"  stop-color="#fffce8" stop-opacity="0.14"/>
          <stop offset="40%" stop-color="#fff0d8" stop-opacity="0.04"/>
          <stop offset="100%" stop-color="#a89dc8" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="rainbow-e4" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"   stop-color="#ff6b6b"/>
          <stop offset="33%"  stop-color="#ffd93d"/>
          <stop offset="66%"  stop-color="#5fcfba"/>
          <stop offset="100%" stop-color="#a89dc8"/>
        </linearGradient>
        <filter id="glow-e" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="6" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      <circle class="dpv20-halo" cx="110" cy="110" r="105" fill="url(#halo-near-e)" filter="url(#glow-e)"/>
      <circle cx="110" cy="110" r="76" fill="url(#swirl-e4)"/>
      <circle cx="110" cy="110" r="76" fill="url(#sphere-e4)"/>
      <circle cx="110" cy="110" r="76" fill="url(#pearl-base-e)"/>
      <circle cx="110" cy="110" r="60" fill="url(#iridescent-e)"/>
      <circle cx="110" cy="110" r="76" fill="url(#rainbow-rim-e)" pointer-events="none"/>
      <circle cx="110" cy="110" r="76" fill="none" stroke="#ffffff" stroke-width="0.4" stroke-opacity="0.4" filter="url(#glow-e)"/>
      <circle cx="110" cy="110" r="76" fill="none" stroke="url(#rainbow-e4)" stroke-width="0.3" stroke-opacity="0.45"/>
      <ellipse cx="135" cy="142" rx="14" ry="9" fill="url(#back-reflect-e)" pointer-events="none"/>
      <g id="shells-e"></g>
      <circle cx="110" cy="110" r="76" fill="url(#overlay-e4)" pointer-events="none"/>
      <g class="dpv20-highlight-flow" pointer-events="none">
        <ellipse cx="92" cy="85" rx="22" ry="14" fill="url(#highlight-e4)"/>
        <ellipse cx="86" cy="76" rx="5" ry="2.5" fill="#ffffff" opacity="0.9"/>
        <ellipse cx="138" cy="92" rx="8" ry="4" fill="url(#highlight2-e)"/>
      </g>
      <circle class="dpv20-glint" cx="105" cy="50"  r="1.4" fill="#ffffff" style="animation-delay:0s;"/>
      <circle class="dpv20-glint" cx="155" cy="120" r="1.2" fill="#ffffff" style="animation-delay:0.5s;"/>
      <circle class="dpv20-glint" cx="78"  cy="150" r="1.5" fill="#ffffff" style="animation-delay:1s;"/>
      <circle class="dpv20-glint" cx="60"  cy="100" r="1.1" fill="#ffffff" style="animation-delay:1.5s;"/>
      <circle class="dpv20-glint" cx="125" cy="68"  r="1.3" fill="#ffffff" style="animation-delay:2s;"/>
    </svg>
  `;
}

function _buildDnaPearlSvgV20(path) {
  if (path === 'evolved')         return _buildDnaPearlSvgV20_E();
  if (path === 'quick-discovery') return _buildDnaPearlSvgV20_Q();
  return _buildDnaPearlSvgV20_OS();
}

function _buildDnaPearlSparklesV20(path) {
  if (path === 'evolved') {
    return [
      `<div class="dpv20-sparkle rainbow sm" style="left: 80%; top: 28%; animation-delay: 0.6s;">✦</div>`,
      `<div class="dpv20-sparkle iridescent md" style="left: 86%; top: 70%; animation-delay: 1.2s;">✦</div>`,
      `<div class="dpv20-sparkle rainbow sm" style="left: 18%; top: 80%; animation-delay: 1.8s;">✦</div>`,
      `<div class="dpv20-sparkle rainbow sm" style="left: 50%; top: 8%;  animation-delay: 2.4s;">✦</div>`
    ].join('');
  }
  if (path === 'quick-discovery') {
    return [
      `<div class="dpv20-sparkle yellow sm"     style="left: 86%; top: 22%; animation-delay: 0.6s;">✦</div>`,
      `<div class="dpv20-sparkle iridescent sm" style="left: 88%; top: 56%; animation-delay: 1.1s;">✦</div>`,
      `<div class="dpv20-sparkle yellow sm"     style="left: 84%; top: 80%; animation-delay: 1.6s;">✦</div>`,
      `<div class="dpv20-sparkle yellow sm"     style="left: 12%; top: 78%; animation-delay: 2.1s;">✦</div>`
    ].join('');
  }
  // one-shot
  return [
    `<div class="dpv20-sparkle green sm"      style="left: 86%; top: 24%; animation-delay: 1s;">✦</div>`,
    `<div class="dpv20-sparkle iridescent sm" style="left: 88%; top: 70%; animation-delay: 1.7s;">✦</div>`,
    `<div class="dpv20-sparkle green sm"      style="left: 22%; top: 82%; animation-delay: 2.3s;">✦</div>`
  ].join('');
}

function _initDnaPearlHelixV20(scope, groupId, shells, strands, speed) {
  const PEARL_CX = 110, PEARL_CY = 110;
  const HELIX_RADIUS = 32, HELIX_TOP = -52, HELIX_BOTTOM = 52;
  const group = scope.querySelector('#' + groupId);
  if (!group || !Array.isArray(shells) || shells.length === 0) return null;
  const ns = 'http://www.w3.org/2000/svg';
  const elements = shells.map((emoji) => {
    const text = document.createElementNS(ns, 'text');
    text.setAttribute('class', 'dpv20-helix-text');
    text.textContent = emoji;
    group.appendChild(text);
    return text;
  });
  const n = shells.length;
  let rafId = null;
  function update(timestamp) {
    const t = timestamp * speed;
    elements.forEach((el, i) => {
      let phase, yPos;
      if (strands === 1) {
        const yT = (i + 0.5) / n;
        yPos = HELIX_TOP + yT * (HELIX_BOTTOM - HELIX_TOP);
        phase = t + yT * Math.PI * 2.5;
      } else {
        const half = Math.ceil(n / 2);
        const isStrand1 = i < half;
        const j = isStrand1 ? i : (i - half);
        const m = isStrand1 ? half : (n - half);
        const yT = (j + 0.5) / m;
        yPos = HELIX_TOP + yT * (HELIX_BOTTOM - HELIX_TOP);
        const strandPhase = isStrand1 ? 0 : Math.PI;
        phase = t + strandPhase + yT * Math.PI * 2.5;
      }
      const x = HELIX_RADIUS * Math.cos(phase);
      const z = Math.sin(phase);
      const screenX = PEARL_CX + x;
      const screenY = PEARL_CY + yPos;
      const depthScale = 0.85 + z * 0.22;
      const fontSize = 20 * depthScale;
      const tNorm = (z + 1) * 0.5;
      const depthOpacity = 0.7 + tNorm * 0.3;
      const glowAlpha = 0.5 + Math.max(0, z) * 0.4;
      const glowBlur = 3 + Math.max(0, z) * 2;
      el.setAttribute('x', screenX);
      el.setAttribute('y', screenY);
      el.setAttribute('font-size', fontSize);
      el.setAttribute('opacity', depthOpacity.toFixed(3));
      el.style.filter = `drop-shadow(0 0 ${glowBlur.toFixed(1)}px rgba(255,255,240,${glowAlpha.toFixed(2)}))`;
    });
    rafId = requestAnimationFrame(update);
  }
  rafId = requestAnimationFrame(update);
  return rafId;
}

// V3.13.x: 만료된 부름 다시 받기 — 오늘 pending으로 복원
function resumeMission(id) {
  const m = (state.missions || []).find(x => x.id === id);
  if (!m) return;
  m.status = 'pending';
  m.scheduledFor = todayKey();
  delete m.expiredAt;
  saveState();
  if (typeof renderTodayMission === 'function') renderTodayMission();
  if (typeof renderBeach === 'function') renderBeach();
  showToast('⭐ 부름 다시 받음 — 홈에서 확인');
}

// Shell detail / story modal
function openShellStory(shellIdx) {
  const shell = state.shellCollection[shellIdx];
  if (!shell) return;

  const dateStr = new Date(shell.date).toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'short'
  });
  const timeStr = new Date(shell.date).toLocaleTimeString('ko-KR', {
    hour: '2-digit', minute: '2-digit'
  });
  const tierLabel = ({
    light: '가벼움', daily: '일상', main: '메인',
    golden: '황금', call: '소라의 부름', legend: '특별한 부름'
  })[shell.tier] || '소라';

  // 사용자 요청 2026-04-27: DNA 조각인지 확인 (어떤 strategy generation의 shells에 속함)
  // 사용자 보고 2026-05-04 (B14/B15): missionId 가 있으면 attemptStatus 'worked'/'meh' 일 때만 DNA 인정.
  // 'didnt' (실패) / 미해결 (attemptStatus 없음) → DNA 표시 X.
  let _missionGate = true;
  if (shell.missionId) {
    const _m = (state.missions || []).find(mm => mm.id === shell.missionId);
    if (_m && _m.attemptStatus !== 'worked' && _m.attemptStatus !== 'meh') _missionGate = false;
  }
  const dnaStrategy = _missionGate ? (state.topicCards || []).find(c =>
    c.category === 'strategy' && Array.isArray(c.generations) &&
    c.generations.some(g => Array.isArray(g.shells) && g.shells.includes(shell._id))
  ) : null;
  const isDnaPiece = !!dnaStrategy;

  const overlay = document.createElement('div');
  overlay.className = 'shell-story-overlay';
  // V4 fix (사용자 보고 2026-05-04): _close / _shellEscDetach 미선언 ReferenceError = 튜토리얼 step 'DNA 한 조각'에서
  // 닫기 버튼 누르면 ESC handler stale 채로 throw → 후속 step (예: 다음 step 의 onShow / 사용자 다른 click 등) 에서 코칭마크 사라짐.
  // fix: openDnaPearlStory 와 동일 패턴으로 함수 scope 안 _shellEscDetach + _close 명시 선언.
  let _shellEscDetach = null;
  const _close = () => {
    if (_shellEscDetach) { _shellEscDetach(); _shellEscDetach = null; }
    overlay.remove();
  };
  overlay.onclick = (e) => { if (e.target === overlay) _close(); };
  // V3.13: 인증샷이 있으면 thumbnail 표시
  const photoBlock = shell.photoThumb
    ? `<img src="${shell.photoThumb}" alt="인증샷" style="width:100%; max-width:200px; aspect-ratio:1; object-fit:cover; border-radius:12px; margin:12px auto; display:block; border: 2px solid rgba(201,169,110,0.3);">`
    : '';
  const dnaBadgeHtml = isDnaPiece
    ? `<div class="shell-story-dna-badge">🧬 <b>DNA 한 조각</b><br><span style="font-size:11px; color:var(--text-dim);">전략 「${escapeHtml(dnaStrategy.title)}」의 일부</span></div>`
    : '';
  const emojiHtml = isDnaPiece
    ? `<div class="shell-story-emoji" style="position:relative; display:inline-block;">${shell.type}<span style="position:absolute; top:-4px; right:-12px; font-size:24px; filter:drop-shadow(0 0 4px gold);">🧬</span></div>`
    : `<div class="shell-story-emoji">${shell.type}</div>`;
  overlay.innerHTML = `
    <div class="shell-story-card tier-${shell.tier}">
      ${emojiHtml}
      <div class="shell-story-tier">${tierLabel}</div>
      <div class="shell-story-date">${dateStr} · ${timeStr}</div>
      ${dnaBadgeHtml}
      ${photoBlock}
      <div class="shell-story-text">${escapeHtml(shell.story || '')}</div>
      <button class="btn-secondary" id="shellStoryCloseBtn" style="margin-top:18px; width:100%;">닫기</button>
    </div>
  `;
  document.body.appendChild(overlay);
  const _btn = overlay.querySelector('#shellStoryCloseBtn');
  if (_btn) _btn.addEventListener('click', _close);
  _shellEscDetach = _registerModalEsc(overlay, _close);
}

function closeModal(id) {
  document.getElementById(id).classList.remove('active');
}

