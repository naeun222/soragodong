// ═══════════════════════════════════════════════════════════════
// MODEL RENDERING (unchanged)
// ═══════════════════════════════════════════════════════════════
function renderModelPreview() {
  const el = document.getElementById('modelPreviewContent');
  if (!el) return;  // FIX
  const allItems = [...state.traits, ...state.patterns, ...state.values];
  if (allItems.length === 0) {
    el.innerHTML = '<div class="model-preview-empty">아직은 백지야 ✦<br>며칠 같이 지내면 여기에 네 모습이 보이기 시작해.</div>';
    return;
  }
  const top = allItems.slice(0, 3);
  el.innerHTML = top.map(item => `<div style="margin-bottom:4px;">· ${escapeHtml(item.name)}</div>`).join('') +
    '<div style="font-size:11px;color:var(--text-dim);margin-top:8px;">탭해서 더 보기 →</div>';
}

// 사용자 요청 2026-04-28: 메타인지 카드 — 지난 7일 몰입 시간 + 자주 한 활동 + 시간대 패턴
// (ADHD time blindness 보정 — 객관적 데이터로 자기 사용 시간 보기)
function computeTimeUsageStats() {
  const now = Date.now();
  const weekAgo = now - 7 * 86400000;
  const recent = (state.starts || []).filter(s => {
    if (!s.returnedAt) return false;
    const startMs = new Date(s.startedAt).getTime();
    return !isNaN(startMs) && startMs >= weekAgo;
  });
  if (recent.length === 0) return null;

  const taskMap = {};
  const periodMap = { dawn: 0, morning: 0, afternoon: 0, evening: 0 };
  let totalMin = 0;
  let validSessions = 0;

  recent.forEach(s => {
    const startMs = new Date(s.startedAt).getTime();
    const endMs = new Date(s.returnedAt).getTime();
    let mins = Math.round((endMs - startMs) / 60000);
    if (mins < 1 || mins > 480) return;  // sanity (1분 이하 / 8시간 초과 제외)
    const title = (s.taskTitle || '제목 없음').trim();
    if (!taskMap[title]) taskMap[title] = { mins: 0, count: 0 };
    taskMap[title].mins += mins;
    taskMap[title].count += 1;
    totalMin += mins;
    validSessions += 1;
    const hour = new Date(s.startedAt).getHours();
    if (hour >= 0 && hour < 6) periodMap.dawn += mins;
    else if (hour < 12) periodMap.morning += mins;
    else if (hour < 18) periodMap.afternoon += mins;
    else periodMap.evening += mins;
  });
  if (validSessions === 0) return null;

  const topTasks = Object.entries(taskMap)
    .map(([title, d]) => ({ title, mins: d.mins, count: d.count, avg: Math.round(d.mins / d.count) }))
    .sort((a, b) => b.mins - a.mins)
    .slice(0, 3);

  const periodLabels = {
    dawn: '🌙 새벽 (0-6시)',
    morning: '🌅 오전 (6-12시)',
    afternoon: '☀️ 오후 (12-18시)',
    evening: '🌆 저녁 (18-24시)'
  };
  const topPeriod = Object.entries(periodMap).reduce((a, b) => b[1] > a[1] ? b : a);

  return {
    totalMin,
    sessionCount: validSessions,
    topTasks,
    topPeriod: { key: topPeriod[0], label: periodLabels[topPeriod[0]], mins: topPeriod[1] },
    days: 7
  };
}

function renderTimeUsageCard() {
  const stats = computeTimeUsageStats();
  if (!stats) {
    return `<div class="model-section">
      <div class="model-section-title">task별 평균 시간 <span style="font-size:11px; color:var(--text-dim); font-weight:normal;">지난 7일</span></div>
      <div style="font-size:12px; color:var(--text-dim); padding:8px 0; line-height:1.7;">
        몰입 기록 쌓이면 여기 표시돼.<br>
        실행 탭 → 시작 → 돌아옴 누르면 자동 기록.
      </div>
    </div>`;
  }
  // 사용자 요청 2026-04-28: 깔끔하게 — task별 평균 시간만 (최대 4개). 시간대/총시간/세션수 제거 (의미 약함)
  const tasks = stats.topTasks.slice(0, 4);
  return `<div class="model-section">
    <div class="model-section-title">task별 평균 시간 <span style="font-size:11px; color:var(--text-dim); font-weight:normal;">지난 7일</span></div>
    <div style="font-size:11px; color:var(--text-dim); margin-bottom:8px; line-height:1.6;">다음에 이 일 얼마나 걸릴지 — 객관적 데이터.</div>
    ${tasks.map(t => `
      <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; font-size:13px; padding:9px 0; border-bottom:1px dashed rgba(212,167,106,0.15);">
        <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(t.title)}</span>
        <span style="color:var(--accent2); font-size:13px; font-weight:600; flex-shrink:0;">평균 ${t.avg}분</span>
      </div>
    `).join('')}
  </div>`;
}

// 사용자 명시 2026-05-05 Phase 1 (aha moment): 게스트가 자동 추출 결과 본 직후 가입 유도 배너.
// 조건: state.isGuest && state._guestAutoExtracted && !state._guestNudgeDismissed.
// 추출 끝나기 전엔 노출 X (premature). dismissable — 한 번 닫으면 같은 anonymous 세션 내 영구 dismiss.
function _renderGuestNudgeBanner() {
  if (!state.isGuest || !state._guestAutoExtracted || state._guestNudgeDismissed) return '';
  return `<div class="guest-nudge-banner">
    <button class="guest-nudge-close" onclick="_dismissGuestNudge()" aria-label="닫기">✕</button>
    <div class="guest-nudge-icon">🌊</div>
    <div class="guest-nudge-title">여기까지 모은 거, 안전하게 챙기자</div>
    <div class="guest-nudge-sub">지금 데이터는 이 기기에만 있어 — 정리되면 사라져. 로그인하면 종단간 암호화로 영구 보관 + 너만 풀 수 있어 (나도 못 봐).</div>
    <button class="guest-nudge-cta" onclick="showGuestConversionModal({reason:'manual'})">로그인하기 →</button>
  </div>`;
}

function _dismissGuestNudge() {
  state._guestNudgeDismissed = true;
  saveState();
  renderModel();
}

function renderModel() {
  const container = document.getElementById('modelContent');
  if (!container) return;  // FIX BUG-1: null guard
  // 사용자 명시 2026-05-10 (큐 10): traits/values/patterns 의 extractedFrom='simulation' 항목은 나 탭 표시 X (도서관 시뮬 영역 별도).
  const _filterNonSim = (arr) => (arr || []).filter(x => x && x.extractedFrom !== 'simulation');
  const _traitsForRender = _filterNonSim(state.traits);
  const _valuesForRender = _filterNonSim(state.values);
  const _patternsForRender = _filterNonSim(state.patterns);
  // 사용자 명시 2026-05-06 ultrathink: task 평균 시간 기능 주석 — empty state / details 둘 다 노출 X.
  const timeCardHtml = '';  // renderTimeUsageCard() 호출 안 함
  const guestNudgeHtml = _renderGuestNudgeBanner();
  if (!_traitsForRender.length && !_patternsForRender.length && !_valuesForRender.length) {
    // 사용자 요청 2026-04-29 (Q2): 모델 비어있어도 더 깊은 나 입력은 시작 가능 — Q2 섹션 같이 노출.
    container.innerHTML = guestNudgeHtml + timeCardHtml + `<div class="model-empty">
      <div style="font-size:32px; margin-bottom:12px;">🐚</div>
      <div style="font-size:14px; color:var(--text); margin-bottom:10px;">아직은 백지야.</div>
      <div style="margin-bottom:14px;">그게 맞는 시작이야.<br>며칠 같이 지내자 ✦</div>
      <div style="font-size:11px; color:var(--text-soft); margin-top:18px; line-height:1.7;">
        대화 한 줄, 체크인 하나씩 쌓일 때마다<br>
        네 모습이 천천히 보이기 시작해.
      </div>
    </div>` + _renderUserDeepProfileSection();
    return;
  }
  
  // V3.13.x: confidence 내림차순 → evidence_count 내림차순
  // V3.13.x.후속2: prioritizeUnverified 시 user_verified===false 항목 우선
  const sortItems = (arr, prioritizeUnverified = false) => {
    return arr.slice().sort((a, b) => {
      if (prioritizeUnverified) {
        const va = a.user_verified === false ? 0 : 1;
        const vb = b.user_verified === false ? 0 : 1;
        if (va !== vb) return va - vb;
      }
      const ca = a.confidence || 0;
      const cb = b.confidence || 0;
      if (cb !== ca) return cb - ca;
      return (b.evidence_count || 0) - (a.evidence_count || 0);
    });
  };
  const splitItems = (arr, topN = 5, draftThreshold = 0.4, prioritizeUnverified = false) => {
    const sorted = sortItems(arr, prioritizeUnverified);
    const main = sorted.filter(item => (item.confidence || 0) >= draftThreshold);
    const draft = sorted.filter(item => (item.confidence || 0) < draftThreshold);
    return { top: main.slice(0, topN), more: main.slice(topN), draft };
  };
  
  // 사용자 명시 2026-05-02 ultrathink: "나" 탭 layout 재정렬.
  // 정체성 위 (values / traits / patterns) → 분석 중 (case_formulation / diagnoses) → 메타 아래 (task 평균 / 더 깊은 나).
  // 자기친밀 hook 우선 / 분석 해석 후순위 / 메타 데이터 collapse.
  let html = '';
  // _renderConfirmableSection — 정체성 3종 공용 헬퍼
  const _renderConfirmableSection = (category, label, arr) => {
    if (!arr || arr.length === 0) return '';
    const split = splitItems(arr, 1, 0.4, true);
    let inner = `<div class="model-section"><div class="model-section-title">${label}</div>`;
    split.top.forEach(item => {
      // V4 fix (사용자 보고 2026-05-14 ultrathink): idx 는 state[category] (full array) 기준이어야 confirmModelItem 이 정확한 item 을 찾는다.
      //   옛 `arr.indexOf(item)` = _filterNonSim 한 filtered idx → state.values 에 시뮬 항목이 있으면 mismatch → 엉뚱한 (시뮬) 항목이 user_verified=true.
      //   자세히 보기 안의 renderMoreSection 은 처음부터 state[category].indexOf 였음 — 그래서 거기선 정상 동작.
      const idx = state[category].indexOf(item);
      inner += renderModelItem(item, category, idx);
    });
    if (split.more.length > 0 || split.draft.length > 0) {
      inner += renderMoreSection(category, split.more, split.draft);
    }
    inner += '</div>';
    return inner;
  };

  // ── 1. 정체성 — values / traits / patterns (top, 자기친밀 hook 매일) ──
  // 사용자 명시 2026-05-10 (큐 10): 시뮬 추출 항목 (extractedFrom='simulation') 은 hide.
  html += _renderConfirmableSection('values', '네가 중시하는 것', _valuesForRender);
  html += _renderConfirmableSection('traits', '네 특성', _traitsForRender);
  html += _renderConfirmableSection('patterns', '보이는 패턴', _patternsForRender);

  // ── 2. 분석 — 통합 분석 + 작동 중인 패턴 (mid, 큰 그림 가끔) ──
  // 사용자 보고 2026-05-05: 신규 사용자 (caseFormulation.version=0) 한테 '통합 분석' 섹션 자체가 안 떠서 존재 모르던 문제 — placeholder 추가.
  if (state.caseFormulation.version === 0 || !state.caseFormulation.version) {
    html += `<div class="model-section">
      <div class="model-section-title">통합 분석</div>
      <div style="font-size:11.5px; color:var(--text-soft); line-height:1.7; padding:10px 12px; background:rgba(255,255,255,0.02); border-radius:8px; border-left:2px solid rgba(255,255,255,0.06);">며칠 같이 지내면 너의 데이터에서 큰 그림 (강점 · 어떻게 작동하는지 · 다루어야 할 특성) 을 종합해줄게 ✦</div>
    </div>`;
  } else {
    html += `<div class="model-section"><div class="model-section-title">통합 분석</div>
      <div style="font-size:11px; color:var(--text-dim); margin-bottom:10px;">네 데이터 종합. 틀린 건 ✎ 수정 / ✕ 삭제.</div>`;
    // 사용자 보고 2026-05-09: Quiz 답변 반영 — user_verified=true 시각 표시 + 객체 array 안전 처리.
    // 옛 cfBullet 는 text 인자 = string 가정 → V4 객체 array ({text, user_verified, ...}) 들어가면 [object Object] 위험.
    // 새 cfBullet: 객체/string 둘 다 안전 처리 + user_verified 마크.
    const cfBullet = (it, field, idx) => {
      const text = (typeof it === 'string') ? it : (it?.text || it?.name || '');
      const verified = (typeof it === 'object' && it && it.user_verified === true);
      const cls = 'cf-bullet' + (verified ? ' cf-verified' : '');
      const mark = verified ? '✓' : '•';
      return `<div class="${cls}">
        <span class="cf-text">${mark} ${escapeHtml(text)}</span>
        <span class="cf-actions"><button onclick="editCFItem('${field}', ${idx})" title="수정">✎</button><button onclick="deleteCFItem('${field}', ${idx})" title="삭제">✕</button></span>
      </div>`;
    };
    // 사용자 명시 2026-05-14: 통합 분석 (cf 5차원) 항목 정렬 — created_at 내림차순 (최신순) 단일 기준.
    //   옛 user_verified=false 우선 정렬 폐기 (2026-05-10).
    //   원본 array index 보존 (edit/delete CF item 호출용) — 정렬은 [item, originalIdx] 페어로.
    const _sortCFItems = (arr) => {
      const indexed = (arr || []).map((it, i) => ({ it, i }));
      indexed.sort((a, b) => {
        const aT = (a.it && typeof a.it === 'object' && a.it.created_at) ? new Date(a.it.created_at).getTime() : 0;
        const bT = (b.it && typeof b.it === 'object' && b.it.created_at) ? new Date(b.it.created_at).getTime() : 0;
        return bT - aT;
      });
      return indexed;
    };
    const cfSection = (label, sub, items, field) => {
      if (!items || items.length === 0) return '';
      const sorted = _sortCFItems(items);
      const top = sorted.slice(0, 1);
      const rest = sorted.slice(1);
      const topHtml = top.map(({ it, i }) => cfBullet(it, field, i)).join('');
      const restHtml = rest.length > 0
        ? `<details class="cf-more"><summary>+${rest.length}</summary><div class="cf-list">${rest.map(({ it, i }) => cfBullet(it, field, i)).join('')}</div></details>`
        : '';
      return `<div class="model-item"><div class="model-item-name">${label}</div>
        ${sub ? `<div style="font-size:11px; color:var(--text-soft); margin-bottom:8px;">${sub}</div>` : ''}
        <div class="model-item-desc cf-list">${topHtml}</div>
        ${restHtml}</div>`;
    };
    // 사용자 요청 2026-04-30: 강점 → 작동 → 다루어야 할 특성 순서 (긍정 먼저)
    html += cfSection('네 강점', '', state.caseFormulation.strengths, 'strengths');
    html += cfSection('어떻게 작동하는지', '네 마음과 행동의 흐름', state.caseFormulation.mechanisms, 'mechanisms');
    html += cfSection('다루어야 할 특성', '고쳐야 할 결점이 아니라, 알고 잘 다뤄야 할 네 결', state.caseFormulation.problems, 'problems');
    html += '</div>';
  }

  // 사용자 보고 2026-05-05: 이름 변경 (의료법 회피) + 기존 사용자한테도 항상 노출.
  // 옛 '작동 중인 패턴' → '잘 안 풀릴 때' (위 '보이는 패턴' 단어 중복 회피, '진단' 의료 단어 회피).
  // disclaimer 도 '의료 진단' → '의료 조언' 으로 워딩 정정.
  const visibleDiags = (state.diagnoses || []).filter(d => d.status === 'active' || d.status === 'shown');
  const diagLabels = {
    weak_tool: '도구 약함',
    wrong_layer: '가지 안 맞음',
    value_clash: '가치 상충',
    avoidance: '회피',
    willpower_cap: '의지 임계'
  };
  if (visibleDiags.length > 0) {
    html += `<div class="model-section">
      <div class="model-section-title">잘 안 풀릴 때</div>
      <div style="font-size:11px; color:var(--text-dim); margin-bottom:10px; line-height:1.6;">시도가 막히는 결 — 결과 쌓이면 갱신돼.</div>
      ${visibleDiags.sort((a,b) => (b.confidence || 0) - (a.confidence || 0)).map(d => `
        <div class="model-item" style="border-left: 3px solid var(--purple); padding-left: 12px;">
          <div class="model-item-name">${diagLabels[d.type] || d.type}</div>
          <div class="model-item-desc" style="font-size:12px; line-height:1.6;">${escapeHtml(d.evidence || '')}</div>
          <div class="model-item-meta">
            <span class="conf">신뢰도 ${Math.round((d.confidence || 0.5) * 100)}%</span>
            ${d.status === 'shown' ? '<span style="color:var(--text-soft);">대화에서 한 번 인용됨</span>' : '<span style="color:#8fc88f;">발견됨</span>'}
          </div>
        </div>
      `).join('')}
      <div style="font-size:10px; color:var(--text-soft); margin-top:10px; line-height:1.55; opacity:0.7;">의료 조언 아님 — 마음이 힘들면 전문가 상담 권장.</div>
    </div>`;
  } else {
    // visibleDiags 없을 때 — strategy 유무 따라 분기 placeholder. 둘 다 항상 노출.
    const stratCount = (state.topicCards || []).filter(c => c.category === 'strategy').length;
    const placeholderText = stratCount === 0
      ? '아직 살펴볼 만큼 데이터 X — 미션 시도 + 결과 체크 쌓이면 자동 보여줄게 ✦'
      : '지금은 잘 흘러가는 중';
    html += `<div class="model-section">
      <div class="model-section-title">잘 안 풀릴 때</div>
      <div style="font-size:11.5px; color:var(--text-soft); line-height:1.7; padding:10px 12px; background:rgba(255,255,255,0.02); border-radius:8px; border-left:2px solid rgba(255,255,255,0.06);">${placeholderText}</div>
    </div>`;
  }

  // ── 3. 메타 — task 평균 (collapse default 닫힘) + 더 깊은 나 (collapse default 닫힘) ──
  // 사용자 명시 2026-05-06 ultrathink: 추적 항목 (projectsSection) 실행 탭으로 이동.
  // 사용자 명시 2026-05-06 추가 ultrathink: task 평균 시간 기능 주석 처리 (의미 약함, 가독성 우선).
  html += `<div class="model-meta-divider">— 메타 —</div>`;

  // 사용자 요청 2026-04-29 (Q2): 더 깊은 사용자 모델 입력 UI — 발달 맥락 / 관계 맵 / 자기서사·핵심 신념.
  html += _renderUserDeepProfileSection();
  // 게스트 가입 유도 배너 — 추출 결과 노출된 화면 최상단.
  container.innerHTML = guestNudgeHtml + html;
}

// 사용자 요청 2026-04-29 (Q2): 더 깊은 나 — state.userDeepProfile 입력 섹션.
// 점진 입력 (한 번에 다 X). 각 필드 ✎ 누르면 modal로 입력. stable cache 적용 → 비용 부담 ~$3/월.
function _renderUserDeepProfileSection() {
  const udp = state.userDeepProfile || {};
  const dev = udp.development || {};
  const rels = udp.relationships || [];
  const sn = udp.selfNarrative || {};
  const cb = sn.coreBeliefs || {};

  const fieldRow = (label, value, fnCall, placeholder = '비어있음') => {
    const display = value
      ? `<div style="font-size:12px;color:var(--text);line-height:1.6;flex:1;white-space:pre-wrap;">${escapeHtml(value.length > 200 ? value.slice(0, 200) + '…' : value)}</div>`
      : `<div style="font-size:11px;color:var(--text-soft);font-style:italic;flex:1;">${placeholder}</div>`;
    return `<div style="display:flex;align-items:flex-start;gap:8px;padding:10px 12px;border-bottom:1px solid var(--border);">
      <div style="font-size:11px;color:var(--text-dim);min-width:90px;font-weight:500;">${label}</div>
      ${display}
      <button onclick="${fnCall}" style="background:none;border:none;color:var(--accent);cursor:pointer;font-size:14px;padding:2px 6px;">✎</button>
    </div>`;
  };

  const arrayRow = (label, items, formatter, fnCall, placeholder = '비어있음') => {
    const display = (items && items.length > 0)
      ? `<div style="font-size:12px;color:var(--text);line-height:1.7;flex:1;">${items.slice(0, 5).map(s => `<div>• ${escapeHtml(formatter(s))}</div>`).join('')}${items.length > 5 ? `<div style="font-size:11px;color:var(--text-soft);">+${items.length - 5}</div>` : ''}</div>`
      : `<div style="font-size:11px;color:var(--text-soft);font-style:italic;flex:1;">${placeholder}</div>`;
    return `<div style="display:flex;align-items:flex-start;gap:8px;padding:10px 12px;border-bottom:1px solid var(--border);">
      <div style="font-size:11px;color:var(--text-dim);min-width:90px;font-weight:500;">${label}</div>
      ${display}
      <button onclick="${fnCall}" style="background:none;border:none;color:var(--accent);cursor:pointer;font-size:14px;padding:2px 6px;">✎</button>
    </div>`;
  };

  const isEmpty = !dev.childhood && !dev.schoolYears && !dev.adhdDiscovery
    && (dev.turningPoints || []).length === 0 && rels.length === 0
    && !sn.selfStory && !sn.howWantToBeSeen
    && (cb.aboutSelf || []).length === 0 && (cb.aboutWorld || []).length === 0 && (cb.aboutFuture || []).length === 0
    && (sn.identityKeywords || []).length === 0;

  // 사용자 명시 2026-05-02: 더 깊은 나 = 항상 닫힘 default. 사용자 click 해야 펼침 (긴 폼 방어).
  return `<details class="model-section" style="margin-top:18px;">
    <summary style="font-size:13px;font-weight:600;color:var(--text);padding:10px 0;cursor:pointer;">더 깊은 나</summary>
    <div style="font-size:11px;color:var(--text-dim);margin:6px 0 14px;line-height:1.7;">
      채워질수록 고동이가 더 깊이 분석해줘.<br>
      대화에서 알아서 채워줄게 — 직접 적어도 돼.
    </div>

    <div style="margin-bottom:16px;">
      <div style="font-size:12px;color:var(--accent);margin-bottom:4px;font-weight:500;">발달·역사 맥락</div>
      ${fieldRow('어린 시절', dev.childhood, "editDeepDevField('childhood','어린 시절·가족 구조·양육 톤')", '가족·양육 분위기')}
      ${fieldRow('학창 시절', dev.schoolYears, "editDeepDevField('schoolYears','학창 시절 핵심 사건')", '의미 있는 사건')}
      ${fieldRow('자기 인식·발견', dev.adhdDiscovery, "editDeepDevField('adhdDiscovery','자기 인식·발견 시점 (진단명·정체성·큰 깨달음 등) + 그 전 어떻게 살았는지')", '발견 시점, 그 전 삶')}
      ${arrayRow('전환점', dev.turningPoints, (tp) => `${tp.when || '?'}: ${(tp.title || '').slice(0, 40)}${tp.impact ? ' — ' + tp.impact.slice(0, 40) : ''}`, "editDeepTurningPoints()", '큰 이사·이별·진학·손실')}
    </div>

    <div style="margin-bottom:16px;">
      <div style="font-size:12px;color:var(--accent);margin-bottom:4px;font-weight:500;">관계 맵</div>
      ${arrayRow('핵심 인물', rels, (r) => `${r.name || '?'}${r.relation ? ' (' + r.relation : ''}${r.tone ? ', ' + r.tone : ''}${r.relation ? ')' : ''}${r.notes ? ' — ' + r.notes.slice(0, 40) : ''}`, "editDeepRelationships()", '가족·친구·연인·동료 5–8명')}
    </div>

    <div style="margin-bottom:16px;">
      <div style="font-size:12px;color:var(--accent);margin-bottom:4px;font-weight:500;">자기서사·핵심 신념</div>
      ${fieldRow('자기 이야기', sn.selfStory, "editDeepSelfNarrativeField('selfStory','자기 이야기 한 단락 (자기소개처럼)')", '한 단락 자기소개')}
      ${fieldRow('보이고 싶은 모습', sn.howWantToBeSeen, "editDeepSelfNarrativeField('howWantToBeSeen','어떻게 보이고 싶은지')", '이상적 모습')}
      ${arrayRow('자신에 대한 신념', cb.aboutSelf, (s) => s, "editDeepCoreBeliefs('aboutSelf')", '\"나는 …\" 형태')}
      ${arrayRow('세상에 대한 신념', cb.aboutWorld, (s) => s, "editDeepCoreBeliefs('aboutWorld')", '\"세상은 …\" 형태')}
      ${arrayRow('미래에 대한 신념', cb.aboutFuture, (s) => s, "editDeepCoreBeliefs('aboutFuture')", '\"미래는 …\" 형태')}
      ${arrayRow('정체성 keyword', sn.identityKeywords, (s) => s, "editDeepIdentityKeywords()", '예: 연구자, queer, 큰언니')}
    </div>
  </details>`;
}

// === Q2 편집 함수들 ===
function _ensureUserDeepProfile() {
  if (!state.userDeepProfile) state.userDeepProfile = JSON.parse(JSON.stringify(DEFAULT_STATE.userDeepProfile));
  if (!state.userDeepProfile.development) state.userDeepProfile.development = { childhood: '', schoolYears: '', adhdDiscovery: '', turningPoints: [] };
  if (!Array.isArray(state.userDeepProfile.development.turningPoints)) state.userDeepProfile.development.turningPoints = [];
  if (!Array.isArray(state.userDeepProfile.relationships)) state.userDeepProfile.relationships = [];
  if (!state.userDeepProfile.selfNarrative) state.userDeepProfile.selfNarrative = { selfStory: '', coreBeliefs: { aboutSelf: [], aboutWorld: [], aboutFuture: [] }, howWantToBeSeen: '', identityKeywords: [] };
  if (!state.userDeepProfile.selfNarrative.coreBeliefs) state.userDeepProfile.selfNarrative.coreBeliefs = { aboutSelf: [], aboutWorld: [], aboutFuture: [] };
  ['aboutSelf','aboutWorld','aboutFuture'].forEach(k => {
    if (!Array.isArray(state.userDeepProfile.selfNarrative.coreBeliefs[k])) state.userDeepProfile.selfNarrative.coreBeliefs[k] = [];
  });
  if (!Array.isArray(state.userDeepProfile.selfNarrative.identityKeywords)) state.userDeepProfile.selfNarrative.identityKeywords = [];
}

function _bumpUserDeepProfile() {
  state.userDeepProfile.version = (state.userDeepProfile.version || 0) + 1;
  state.userDeepProfile.lastUpdated = new Date().toISOString();
}

async function editDeepDevField(field, title) {
  _ensureUserDeepProfile();
  const current = state.userDeepProfile.development[field] || '';
  const newText = await showInputModal({
    title,
    message: '천천히 떠올리는 만큼, 자유롭게.',
    defaultValue: current, multiline: true, maxLength: 800, okLabel: '저장'
  });
  if (newText === null) return;
  state.userDeepProfile.development[field] = (newText || '').trim();
  _bumpUserDeepProfile();
  saveState();
  renderModel();
}

async function editDeepSelfNarrativeField(field, title) {
  _ensureUserDeepProfile();
  const current = state.userDeepProfile.selfNarrative[field] || '';
  const newText = await showInputModal({
    title,
    message: '자유롭게 — 떠오르는 만큼.',
    defaultValue: current, multiline: true, maxLength: 800, okLabel: '저장'
  });
  if (newText === null) return;
  state.userDeepProfile.selfNarrative[field] = (newText || '').trim();
  _bumpUserDeepProfile();
  saveState();
  renderModel();
}

async function editDeepCoreBeliefs(category) {
  _ensureUserDeepProfile();
  const labels = { aboutSelf: '자신', aboutWorld: '세상', aboutFuture: '미래' };
  const current = (state.userDeepProfile.selfNarrative.coreBeliefs[category] || []).join('\n');
  const newText = await showInputModal({
    title: `${labels[category] || '?'}에 대한 신념`,
    message: '한 줄에 하나씩. enter로 분리.\n예: "나는 패턴 인식이 강해" / "세상은 예측 불가능해"',
    defaultValue: current, multiline: true, maxLength: 1500, okLabel: '저장'
  });
  if (newText === null) return;
  const items = newText.split('\n').map(s => s.trim()).filter(Boolean);
  state.userDeepProfile.selfNarrative.coreBeliefs[category] = items;
  _bumpUserDeepProfile();
  saveState();
  renderModel();
}

async function editDeepIdentityKeywords() {
  _ensureUserDeepProfile();
  const current = (state.userDeepProfile.selfNarrative.identityKeywords || []).join(', ');
  const newText = await showInputModal({
    title: '정체성 keyword',
    message: '콤마로 분리. 예: 연구자, queer, 큰언니, ADHD, 작가',
    defaultValue: current, maxLength: 500, okLabel: '저장'
  });
  if (newText === null) return;
  const items = newText.split(',').map(s => s.trim()).filter(Boolean);
  state.userDeepProfile.selfNarrative.identityKeywords = items;
  _bumpUserDeepProfile();
  saveState();
  renderModel();
}

async function editDeepTurningPoints() {
  _ensureUserDeepProfile();
  const tps = state.userDeepProfile.development.turningPoints || [];
  const current = tps.map(tp => {
    const w = tp.when || '?';
    const t = tp.title || '';
    const imp = tp.impact || '';
    return imp ? `${w}: ${t} — ${imp}` : `${w}: ${t}`;
  }).join('\n');
  const newText = await showInputModal({
    title: '전환점',
    message: '한 줄에 하나씩. 형식: "YYYY-MM: 제목 — 영향"\n예: 2020-03: 첫 자취 — 갑자기 자유 + 스스로 챙겨야 함',
    defaultValue: current, multiline: true, maxLength: 2000, okLabel: '저장'
  });
  if (newText === null) return;
  const items = newText.split('\n').map(line => line.trim()).filter(Boolean).map(line => {
    let when = '', rest = line;
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0 && colonIdx < 30) {
      when = line.slice(0, colonIdx).trim();
      rest = line.slice(colonIdx + 1).trim();
    }
    let title = rest, impact = '';
    const dashIdx = rest.indexOf(' — ');
    if (dashIdx > 0) {
      title = rest.slice(0, dashIdx).trim();
      impact = rest.slice(dashIdx + 3).trim();
    }
    return { id: 'tp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5), when, title, description: '', impact };
  });
  state.userDeepProfile.development.turningPoints = items;
  _bumpUserDeepProfile();
  saveState();
  renderModel();
}

async function editDeepRelationships() {
  _ensureUserDeepProfile();
  const rels = state.userDeepProfile.relationships || [];
  const current = rels.map(r => {
    const meta = [r.relation, r.tone, r.influence].filter(Boolean).join(', ');
    const notes = r.notes ? ' — ' + r.notes : '';
    return meta ? `${r.name || '?'} (${meta})${notes}` : `${r.name || '?'}${notes}`;
  }).join('\n');
  const newText = await showInputModal({
    title: '관계 맵',
    message: '한 줄에 한 명. 형식: "이름 (관계, 톤, 영향) — 메모"\n관계: 가족|친구|연인|동료|전문가|기타\n톤: 안전|자극|혼합\n영향: positive|negative|mixed\n예: 엄마 (가족, 혼합, mixed) — 매일 연락, 비교 많음',
    defaultValue: current, multiline: true, maxLength: 3000, okLabel: '저장'
  });
  if (newText === null) return;
  const items = newText.split('\n').map(line => line.trim()).filter(Boolean).map(line => {
    let name = line, relation = '', tone = '', influence = '', notes = '';
    const metaMatch = line.match(/^([^(]+)\s*\(([^)]+)\)\s*(.*)$/);
    if (metaMatch) {
      name = metaMatch[1].trim();
      const parts = metaMatch[2].split(',').map(s => s.trim());
      relation = parts[0] || '';
      tone = parts[1] || '';
      influence = parts[2] || '';
      const tail = metaMatch[3].trim();
      const dashIdx = tail.indexOf('—');
      if (dashIdx >= 0) notes = tail.slice(dashIdx + 1).trim();
    } else {
      const dashIdx = line.indexOf('—');
      if (dashIdx > 0) {
        name = line.slice(0, dashIdx).trim();
        notes = line.slice(dashIdx + 1).trim();
      }
    }
    return {
      id: 'rel_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5),
      name, relation, tone, influence, notes
    };
  });
  state.userDeepProfile.relationships = items;
  _bumpUserDeepProfile();
  saveState();
  renderModel();
}

function renderMoreSection(category, more, draft) {
  let html = '';
  if (more.length > 0) {
    html += `
      <details class="model-collapse">
        <summary>+${more.length}</summary>
        <div class="model-collapse-content">
    `;
    more.forEach(item => {
      const realIdx = state[category].indexOf(item);
      html += renderModelItem(item, category, realIdx);
    });
    html += `</div></details>`;
  }
  if (draft.length > 0) {
    html += `
      <details class="model-collapse model-draft">
        <summary>+${draft.length}</summary>
        <div class="model-collapse-content">
    `;
    draft.forEach(item => {
      const realIdx = state[category].indexOf(item);
      html += renderModelItem(item, category, realIdx);
    });
    html += `</div></details>`;
  }
  return html;
}

function renderModelItem(item, category, idx) {
  // V4 (사용자 보고 2026-05-13): 옛 e750781 dead code 청소에서 잘못 삭제된 confLabel + model-item-meta 복원.
  //   각 model item 아래 "확신/관찰 중/가설 N%" 칩 + "근거 N개" 표시.
  const confLabel = item.confidence >= 0.7 ? '확신' : item.confidence >= 0.4 ? '관찰 중' : '가설';
  // V4-1l-mini + 사용자 fix: values/patterns/traits 모두 '맞아' / '아니야' / '확인됨' 토글
  const isVerifiable = (category === 'values' || category === 'patterns' || category === 'traits');
  const isVerified = isVerifiable && item.user_verified === true;
  const showNew = isVerifiable && !isVerified;
  const newClass = showNew ? ' model-item-new' : '';
  const newBadge = showNew ? `<span class="cf-new-badge">NEW</span>` : '';

  let actionsHtml;
  if (isVerifiable) {
    if (isVerified) {
      actionsHtml = `<button class="model-item-action cf-confirmed" onclick="toggleVerifyModelItem('${category}', ${idx})">✓ 확인됨</button>`;
    } else {
      actionsHtml = `
        <button class="model-item-action cf-confirm" onclick="confirmModelItem('${category}', ${idx})">맞아</button>
        <button class="model-item-action reject" onclick="rejectItemNow('${category}', ${idx})">아니야</button>
      `;
    }
  } else {
    actionsHtml = `
      <button class="model-item-action" onclick="editModelItem('${category}', ${idx})">✎ 수정</button>
      <button class="model-item-action reject" onclick="rejectItem('${category}', ${idx})">✕ 삭제</button>
    `;
  }

  // 사용자 요청 2026-04-28 V3 audit: values.sdt_need / patterns.trigger,sequence 노출 (이전엔 추출만 하고 안 보임)
  const sdtLabel = { autonomy: '자율', competence: '유능감', relatedness: '관계' };
  const subMeta = (() => {
    if (category === 'values' && item.sdt_need && sdtLabel[item.sdt_need]) {
      return `<div class="model-item-sub" style="font-size:11px; color:var(--accent2); margin-top:4px;">🎯 SDT: ${sdtLabel[item.sdt_need]}</div>`;
    }
    if (category === 'patterns' && (item.trigger || item.sequence)) {
      const parts = [];
      if (item.trigger) parts.push(`<b>trigger</b> ${escapeHtml(item.trigger)}`);
      if (item.sequence) parts.push(`<b>흐름</b> ${escapeHtml(item.sequence)}`);
      return `<div class="model-item-sub" style="font-size:11px; color:var(--text-soft); margin-top:4px; line-height:1.6;">${parts.join(' · ')}</div>`;
    }
    return '';
  })();
  return `<div class="model-item${newClass}" data-cat="${category}" data-idx="${idx}">
    <div class="model-item-name">${newBadge}${escapeHtml(item.name)}</div>
    <div class="model-item-desc">${escapeHtml(item.description || '')}</div>
    ${subMeta}
    <div class="model-item-meta">
      <span class="conf">${confLabel}${item.confidence != null ? ` ${Math.round((item.confidence || 0) * 100)}%` : ''}</span>
      ${item.evidence_count ? `<span>근거 ${item.evidence_count}개</span>` : ''}
    </div>
    <div class="model-item-actions">
      ${actionsHtml}
    </div>
  </div>`;
}

async function rejectItem(category, idx) {
  if (!await confirmDelete('이 항목')) return;
  state[category].splice(idx, 1);
  saveState(); renderModel(); renderModelPreview();
}

// V4-1l-mini: '아니야' = 즉시 삭제 + undo 토스트 (confirmDelete 모달 X — values/patterns 흐름용)
function rejectItemNow(category, idx) {
  if (!Array.isArray(state[category])) return;
  const removed = state[category][idx];
  if (!removed) return;
  const removedJson = JSON.stringify(removed);
  state[category].splice(idx, 1);
  saveState(); renderModel(); renderModelPreview();
  if (typeof showUndoToast === 'function') {
    showUndoToast(`"${removed.name}" 삭제됨`, () => {
      try {
        const restored = JSON.parse(removedJson);
        state[category].splice(idx, 0, restored);
        saveState(); renderModel(); renderModelPreview();
      } catch (e) {}
    });
  } else {
    showToast('삭제됨');
  }
}

// V3.13.x.후속2: values/patterns 항목 ✓ 맞아 컨펌
function confirmModelItem(category, idx) {
  if (!Array.isArray(state[category])) return;
  const item = state[category][idx];
  if (!item) return;
  item.user_verified = true;
  saveState(); renderModel(); renderModelPreview();
  showToast('확인됨 ✓');
}

// V4-1l-mini: 확인됨 → 다시 누르면 미컨펌(맞아/아니야)으로 토글
function toggleVerifyModelItem(category, idx) {
  if (!Array.isArray(state[category])) return;
  const item = state[category][idx];
  if (!item) return;
  item.user_verified = !item.user_verified;
  saveState(); renderModel(); renderModelPreview();
  showToast(item.user_verified ? '확인됨 ✓' : '다시 검토');
}

// V3.13.x: 통합 분석 미컨펌 메타 (텍스트 기준 lookup)
function _cfUnverifiedArr(field) {
  if (!state.caseFormulation) return [];
  if (!state.caseFormulation.unverified) state.caseFormulation.unverified = {};
  if (!state.caseFormulation.unverified[field]) state.caseFormulation.unverified[field] = [];
  return state.caseFormulation.unverified[field];
}
function isCFVerified(field, text) {
  return !_cfUnverifiedArr(field).includes(text);
}
function setCFVerified(field, text, verified) {
  const arr = _cfUnverifiedArr(field);
  const i = arr.indexOf(text);
  if (verified) {
    if (i >= 0) arr.splice(i, 1);
  } else {
    if (i < 0) arr.push(text);
  }
}

// V3.13.x: 통합 분석 (caseFormulation) 항목 수정/삭제/컨펌
async function editCFItem(field, idx) {
  if (!state.caseFormulation || !Array.isArray(state.caseFormulation[field])) return;
  const current = state.caseFormulation[field][idx];
  if (current == null) return;
  const newText = await showInputModal({
    title: '통합 분석 항목 수정',
    message: `현재: ${current}`,
    defaultValue: current,
    multiline: true,
    okLabel: '저장'
  });
  if (newText === null) return;
  const trimmed = newText.trim();
  if (!trimmed) return;
  state.caseFormulation[field][idx] = trimmed;
  saveState();
  renderModel();
  renderModelPreview();
  showToast('수정됨 ✦');
}
async function deleteCFItem(field, idx) {
  if (!state.caseFormulation || !Array.isArray(state.caseFormulation[field])) return;
  if (!await confirmDelete('이 항목')) return;
  state.caseFormulation[field].splice(idx, 1);
  saveState();
  renderModel();
  renderModelPreview();
  showToast('삭제됨');
}

// V3.13.x: 통합분석 항목 수정 (이름 + 설명) — AI 오해 잘못된 추론 직접 고치기
async function editModelItem(category, idx) {
  const item = state[category] && state[category][idx];
  if (!item) return;
  const newName = await showInputModal({
    title: '이름 수정',
    message: `현재: ${item.name}`,
    placeholder: '항목 이름',
    defaultValue: item.name || '',
    okLabel: '다음 →'
  });
  if (newName === null) return;
  const trimmedName = newName.trim();
  if (!trimmedName) { showToast('빈 이름은 안 돼'); return; }
  const newDesc = await showInputModal({
    title: '설명 수정',
    message: '비워둬도 돼',
    placeholder: '설명 (선택)',
    defaultValue: item.description || '',
    multiline: true,
    okLabel: '저장'
  });
  if (newDesc === null) return;
  item.name = trimmedName;
  item.description = (newDesc || '').trim();
  saveState();
  renderModel();
  renderModelPreview();
  showToast('수정됨 ✦');
}

