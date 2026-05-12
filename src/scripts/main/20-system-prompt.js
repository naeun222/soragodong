// ═══════════════════════════════════════════════════════════════
// SYSTEM PROMPT
// ═══════════════════════════════════════════════════════════════
// 사용자 명시 2026-05-11 ultrathink: SYSTEM_PERSONA 526줄 backend 이전 (functions/api/_lib/prompts/system-persona.ts).
// 옛: 클라이언트에 평문 → 빌드 산출물 그대로 → devtools/view-source 추출 가능 → 핵심 자산 노출.
// 신: backend /api/chat 의 chat_main / analyze_4stage / intake endpoint 시 first system block 앞에 prepend.
//     prefix 동일 → Anthropic prompt cache 90% 할인 그대로. 클라이언트엔 사용자 모델 데이터만 잔존.

function buildSystemPrompt() {
  // V3.8: 하위호환 — 단일 문자열 반환 (이전 호출처용)
  // 사용자 명시 2026-05-10: 3-tier 도입 후에도 단일 문자열 wrapper 유지 — stable + sessionStable + perCall 합침.
  const parts = buildSystemPromptParts();
  return [parts.stable, parts.sessionStable, parts.perCall].filter(Boolean).join('\n');
}

// V3.8 + 사용자 명시 2026-05-10: 프롬프트 캐싱용 3-tier 분리.
// stable: 페르소나/프로필/특성/패턴/CF/userDeepProfile 등 거의 안 변함 → cache_control 적용 → 90% 비용 ↓
// sessionStable: 세션 내 변경 빈도 낮음 (활성 모드/결정/미션/시뮬/followup/최근 1주 체크인/과거 깨달음/미션 상태) → cache_control 적용 (NEW)
// perCall: 매 호출 변동 (현재 시각/entry 날짜/진단 인용/오늘 체크인) → 매번 새로 보냄 (캐시 X)
//   sessionStable 변경 시 단발성 cache miss 만 (예: 미션 완료 → 다음 호출만 miss, 그 다음 호출부터 다시 hit).
//   평균 2번 read 이상 시 break-even, ADHD 사용자 burst 패턴에서 input cost 15~25% 추가 절감 추정.
function buildSystemPromptParts() {
  // === STABLE (캐시 가능) ===
  // 사용자 명시 2026-05-11 ultrathink: SYSTEM_PERSONA 자체는 backend (/api/chat) 가 첫 블록 앞에 prepend.
  //   클라이언트는 사용자 모델 데이터 (profile/values/traits/patterns/CF/userDeepProfile) 만 stable 에 채움.
  //   결과적으로 Anthropic 이 받는 system prefix = SYSTEM_PERSONA + 사용자 모델 → cache prefix-match 그대로.
  let stable = [];
  stable.push('\n━━━━━━━━━━━━━━━━━━━━━\n📂 사용자에 대한 현재 모델\n━━━━━━━━━━━━━━━━━━━━━\n');
  if (state.profile) stable.push(`[사용자 프로필]\n${state.profile}\n`);

  // 사용자 요청 2026-04-29 (perf #5): 시스템 프롬프트 cap — 매우 많을 때 verified 우선 + 최대 30개 (확신도 높은 순)
  // V4 사용자 명시 2026-05-04 ultrathink: _deleted (히스토리 삭제 cascade) 항목 제외.
  // 사용자 보고 2026-05-10 (audit-billing 빨강): 시뮬 추출 항목 (extractedFrom='simulation') 도 제외.
  //   옛: _filterNonSim (모델 탭) 만 hide → buildSystemPromptParts 는 시뮬 항목도 시스템 프롬프트 주입 → AI 가 가상 시나리오 신호를 사용자 자기 모델로 인식.
  //   신: 시뮬 격리 = 시스템 프롬프트 주입에서도 제외 (큐 11 의 cf 5차원 X 와 일관).
  const _topByConfVerified = (arr, max) => {
    if (!Array.isArray(arr)) return [];
    return arr.filter(x => !x._deleted && x.extractedFrom !== 'simulation').slice().sort((a, b) => {
      const av = a.user_verified ? 1 : 0;
      const bv = b.user_verified ? 1 : 0;
      if (av !== bv) return bv - av;
      return (b.confidence || 0) - (a.confidence || 0);
    }).slice(0, max);
  };
  const _vals = _topByConfVerified(state.values, 30);
  if (_vals.length > 0) {
    stable.push('[중시하는 가치]');
    _vals.forEach(v => stable.push(`- ${v.user_verified ? '✓' : '?'} ${v.name}${v.description ? ': ' + v.description : ''}`));
    stable.push('');
  }
  const _trts = _topByConfVerified(state.traits, 30);
  if (_trts.length > 0) {
    stable.push('[특성]');
    _trts.forEach(t => stable.push(`- ${t.user_verified ? '✓' : '?'} ${t.name}${t.description ? ': ' + t.description : ''}`));
    stable.push('');
  }
  const _ptns = _topByConfVerified(state.patterns, 30);
  if (_ptns.length > 0) {
    stable.push('[관찰된 패턴]');
    _ptns.forEach(p => stable.push(`- ${p.user_verified ? '✓' : '?'} ${p.name}${p.trigger ? ' (트리거: ' + p.trigger + ')' : ''}`));
    stable.push('');
  }
  if (state.caseFormulation.version > 0) {
    const cf = state.caseFormulation;
    stable.push(`[Case Formulation v.${cf.version}]`);
    // 사용자 요청 2026-04-29 (perf #5): cf 문자열 array는 너무 길면 슬라이스
    const _cfTrunc = (arr) => arr.map(s => typeof s === 'string' ? s.slice(0, 120) : (s && s.text ? s.text.slice(0, 120) : '')).filter(Boolean).join('; ');
    if (cf.problems.length) stable.push('문제: ' + _cfTrunc(cf.problems));
    if (cf.mechanisms.length) stable.push('메커니즘: ' + _cfTrunc(cf.mechanisms));
    if (cf.strengths.length) stable.push('강점: ' + _cfTrunc(cf.strengths));
    stable.push('');
  }

  // 사용자 요청 2026-04-29 (Q2): 더 깊은 사용자 모델 — 발달 맥락 / 관계 맵 / 자기서사·핵심 신념.
  // stable 부분이라 cache_control 90% 할인 적용 — 추가 비용 사실상 무료.
  const udp = state.userDeepProfile;
  if (udp && udp.version > 0) {
    stable.push(`[더 깊은 사용자 모델 v.${udp.version}]`);
    // 발달 맥락
    const dev = udp.development || {};
    const devLines = [];
    if (dev.childhood) devLines.push('어린 시절: ' + dev.childhood.slice(0, 300));
    if (dev.schoolYears) devLines.push('학창 시절: ' + dev.schoolYears.slice(0, 300));
    if (dev.adhdDiscovery) devLines.push('자기 인식·발견: ' + dev.adhdDiscovery.slice(0, 300));
    const _activeTPs = Array.isArray(dev.turningPoints) ? dev.turningPoints.filter(tp => !tp._deleted) : [];
    if (_activeTPs.length) {
      const tps = _activeTPs.slice(0, 8).map(tp => `${tp.when || '?'}: ${(tp.title || '').slice(0, 40)}${tp.impact ? ' (' + tp.impact.slice(0, 60) + ')' : ''}`).join(' | ');
      devLines.push('전환점: ' + tps);
    }
    if (devLines.length) {
      stable.push('— 발달·역사 맥락 —');
      devLines.forEach(l => stable.push(l));
    }
    // 관계 맵
    const rels = Array.isArray(udp.relationships) ? udp.relationships.filter(r => !r._deleted).slice(0, 10) : [];
    if (rels.length) {
      stable.push('— 관계 맵 —');
      rels.forEach(r => {
        const tone = r.tone ? `[${r.tone}]` : '';
        const inf = r.influence ? `(${r.influence})` : '';
        const notes = r.notes ? ' — ' + r.notes.slice(0, 80) : '';
        stable.push(`- ${r.name || '?'} (${r.relation || '관계'}) ${tone}${inf}${notes}`);
      });
    }
    // 자기서사·핵심 신념
    const sn = udp.selfNarrative || {};
    const snLines = [];
    if (sn.selfStory) snLines.push('자기 이야기: ' + sn.selfStory.slice(0, 400));
    if (sn.howWantToBeSeen) snLines.push('보이고 싶은 모습: ' + sn.howWantToBeSeen.slice(0, 200));
    const beliefs = sn.coreBeliefs || {};
    const _beliefSlice = (arr) => Array.isArray(arr) ? arr.slice(0, 5).map(s => typeof s === 'string' ? s.slice(0, 100) : '').filter(Boolean).join(' / ') : '';
    const bs = _beliefSlice(beliefs.aboutSelf);
    const bw = _beliefSlice(beliefs.aboutWorld);
    const bf = _beliefSlice(beliefs.aboutFuture);
    if (bs) snLines.push('자신에 대해: ' + bs);
    if (bw) snLines.push('세상에 대해: ' + bw);
    if (bf) snLines.push('미래에 대해: ' + bf);
    if (Array.isArray(sn.identityKeywords) && sn.identityKeywords.length) {
      snLines.push('정체성: ' + sn.identityKeywords.slice(0, 12).join(', '));
    }
    if (snLines.length) {
      stable.push('— 자기서사·핵심 신념 —');
      snLines.forEach(l => stable.push(l));
    }
    stable.push('  · 위 정보는 사용자가 직접 입력한 깊은 자기 정보. 자연스럽게 짚어 인용 가능 (단정 X, 외재화 톤).');
    stable.push('');
  }

  // === SESSION-STABLE (캐시 가능 — 세션 내 변경 빈도 낮음) ===
  // 사용자 명시 2026-05-10: 옛 volatile 9KB 의 약 70% 는 세션 내 거의 안 변함 (활성 모드/결정/미션/체크인 history 등).
  // 별도 cache_control 블록으로 분리 → 추가 90% 할인 진입.
  let sessionStable = [];

  // === PER-CALL (캐시 X — 매 호출 변동) ===
  // 현재 시각/entry 날짜 (분 단위), 진단 인용 (deeper context 마다 다름), 오늘 체크인 (한 세션 내 입력 시 변함).
  let perCall = [];

  // V3.13.x: 현재 시각 + entry 기준 날짜 모두 주입 (AI 날짜 착각 방지)
  // 04:00 cutoff 도입으로 calendar date와 entry key가 다를 수 있음 (새벽 시간대)
  // 사용자 요청 2026-04-28: 서버 시간 기반 (디바이스 시계 잘못돼도 정확)
  // 사용자 명시 2026-05-10: perCall (캐시 X) — 분 단위 변경.
  const _now = (typeof getServerNow === 'function') ? getServerNow() : new Date();
  const _dowReal = ['일', '월', '화', '수', '목', '금', '토'][_now.getDay()];
  const _realDate = `${_now.getFullYear()}-${String(_now.getMonth()+1).padStart(2,'0')}-${String(_now.getDate()).padStart(2,'0')}`;
  const _realTime = `${String(_now.getHours()).padStart(2,'0')}:${String(_now.getMinutes()).padStart(2,'0')}`;
  perCall.push(`[현재 시각] ${_realDate} ${_realTime} (${_dowReal}요일)`);
  const _dayKeyVal = todayKey();
  if (_dayKeyVal !== _realDate) {
    const _dayDate = new Date(_dayKeyVal);
    const _dowEntry = ['일', '월', '화', '수', '목', '금', '토'][_dayDate.getDay()];
    perCall.push(`[entry 기준 날짜] ${_dayKeyVal} (${_dowEntry}요일) — 새벽 4시까지는 전날 entry로 묶임`);
  }
  perCall.push('');

  const activeModes = Object.keys(state.modes || {}).filter(k => state.modes[k]);
  if (activeModes.length > 0) {
    const modeMap = { exam: '📚 마감/시험', travel: '✈️ 여행 중', sick: '🤒 아픔', rest: '🏖 휴식', period: '🩸 월경' };
    sessionStable.push('[현재 활성 모드]');
    activeModes.forEach(m => sessionStable.push('- ' + (modeMap[m] || m)));
    const phase = getCyclePhase();
    if (phase) sessionStable.push(`- 월경 주기: ${phase}`);
    sessionStable.push('');
  }

  // Active decisions
  const activeDecisions = (state.decisions || []).filter(d => d.status === 'in_progress');
  if (activeDecisions.length > 0) {
    sessionStable.push('[현재 진행 중인 큰 결정]');
    activeDecisions.forEach(d => {
      const days = Math.floor((new Date() - new Date(d.startedAt)) / 86400000);
      const completed = d.steps.filter(s => s.completed).length;
      sessionStable.push(`- "${d.title}" (${days}일째, ${completed}/10 단계)`);
    });
    sessionStable.push('');
  }

  // 사용자 명시 2026-05-10 (큐 11 재정정): 시뮬 → 대화 이어가기 = '토론 프레임' (가상 시나리오 토론) 톤. 격리 (cf 5차원 X) 는 유지.
  // 사용자 보고 2026-05-10 (검증 결과 fix): 옛 가드 모호 → 8턴쯤 AI 시뮬 망각. 구체 X-list + ✓-list 강화 + N턴 후 동일.
  const _simContextMsg = (state.chatMessages || []).find(m => m && m.isSimulationContext === true);
  if (_simContextMsg) {
    sessionStable.push('[시나리오 토론 컨텍스트 — 매 응답 유지, 매우 중요]');
    sessionStable.push('- 사용자가 가상 시나리오 제안 — 답도 그 시뮬 안 가정. 실제 일 X.');
    sessionStable.push('- 시뮬 시작 후 5턴, 10턴 지나도 동일. 사용자가 짧게 "응" / "맞네" 답해도 시뮬 안 답으로 인식.');
    sessionStable.push('- 절대 X (실제 일 인 양 묻기 금지) — 시뮬 컨텍스트 망각 방지:');
    sessionStable.push('  · "그 다큐 뭐였어?" / "어떤 장르?" / "어떤 영상?"');
    sessionStable.push('  · "실제로 본 거였어?" / "정말 그랬어?"');
    sessionStable.push('  · "그날 어땠어?" / "결국 어떻게 됐어?"');
    sessionStable.push('  · "더 자세히 알려줘" 식 실제 사실 캐묻기');
    sessionStable.push('- ✓ OK (토론 톤만):');
    sessionStable.push('  · "그 답을 보면 X 성향이 보여"');
    sessionStable.push('  · "다른 식으로 가면 어떨까"');
    sessionStable.push('  · "그 상황에선 어떻게 반응할 거 같아?"');
    sessionStable.push('  · "시뮬 안에서 X 라면?" 가정 분기');
    sessionStable.push('- 추출은 자동 격리 (extractedFrom=simulation, 약한 신호) — 모델은 토론 자연스럽게 이어가면 됨.');
    const _scenarioLine = (_simContextMsg.content || '').split('\n').find(l => l.startsWith('[시뮬레이션]')) || '';
    if (_scenarioLine) sessionStable.push(`- 시뮬 시나리오: ${_scenarioLine.replace(/^\[시뮬레이션\]\s*/, '')}`);
    sessionStable.push('');
  }

  // V4-1o + 사용자 fix: 관찰 5종 — "더 알아보기" 눌렀을 때 / 테스트 모드 시 자연 인용
  // 사용자 보고 2026-04-29: 4단 응답에 진단 인용 누락 — active 외 'shown' 도 deeper context엔 인용 가능
  const _lastUserMsgForDiag = (state.chatMessages || []).slice().reverse().find(m => m.role === 'user');
  const _isDeeperContext = !!(_lastUserMsgForDiag && _lastUserMsgForDiag.isDeeperRequest);
  const _isTesterMode = !!(state.preferences && state.preferences.testerMode);
  // active 우선, 없으면 shown 중 가장 최근 (deeper context) — confidence 높은 순
  let activeDiag = null;
  if (_isDeeperContext || _isTesterMode) {
    const allDiags = (state.diagnoses || []);
    activeDiag = allDiags.find(d => d.status === 'active');
    if (!activeDiag && _isDeeperContext) {
      // deeper context에선 shown 도 인용 (한 번 본 거 다시 짚는 OK)
      const shown = allDiags.filter(d => d.status === 'shown')
        .sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
      activeDiag = shown[0] || null;
    }
  }
  // 사용자 명시 2026-05-10: 진단 인용은 deeper context 마다 다름 → perCall (캐시 X).
  if (activeDiag && _DIAG_LABELS && _DIAG_LABELS[activeDiag.type]) {
    const lbl = _DIAG_LABELS[activeDiag.type];
    if (_isTesterMode) {
      perCall.push(`[관찰된 패턴 — 테스트 모드 강제 인용. 응답 안에 반드시 한 줄 끼워야]`);
      perCall.push(`- ${lbl.emoji} ${lbl.name}: ${activeDiag.evidence}`);
      perCall.push(`  · 응답 마지막에 한 줄로 자연스럽게 한 번 인용. "${lbl.name}" 단어 직접 써도 OK.`);
      perCall.push(`  · 톤: 외재화 (X 패턴이 작동 중 / 이 도구 안 맞을 수도). 단정 X.`);
      perCall.push('');
    } else {
      perCall.push(`[관찰된 패턴 — "더 알아보기" 트리거됨, 4단 응답 [내가 본 것] 또는 [이게 뭐냐면]에 자연스럽게 한 번 인용]`);
      perCall.push(`- ${lbl.emoji} ${lbl.name}: ${activeDiag.evidence}`);
      perCall.push(`  · 인용 위치: 4단 응답 [내가 본 것] 첫 줄 또는 [이게 뭐냐면]에 살짝 끼워. "X 패턴이 작동 중" 형식.`);
      perCall.push(`  · 톤: 외재화("X 패턴이 작동 중" / "너 X적이야" X), 사용자 자기 발견 유도(결론 단정 X)`);
      perCall.push(`  · 한 번만. 사용자 거부하면 다시 X.`);
      perCall.push('');
      if (typeof markDiagnosisShown === 'function' && activeDiag.status === 'active') {
        try { markDiagnosisShown(activeDiag.id); } catch (e) { console.warn('markDiagnosisShown:', e); }
      }
    }
  } else if (_isDeeperContext) {
    // 사용자 요청 2026-04-29: 활성 진단이 없을 때도 4단 응답 — 사용자 본인 데이터(traits/patterns/case formulation) 우선 인용 강제
    perCall.push(`[4단 응답 깊이 강화 — 관찰 X여도 사용자 본인 데이터 우선]`);
    perCall.push(`  · [내가 본 것]은 사용자 traits/patterns/case formulation에서 직접 인용. generic textbook 개념 (Gollwitzer / Neff 등) 단독 사용 X.`);
    perCall.push(`  · [이게 뭐냐면]에 심리학 개념 들어가도 OK, 단 위 [내가 본 것]에서 짚은 사용자 본인 패턴이랑 연결.`);
    perCall.push(`  · 사용자가 "현실적으로 별로야" 류 반응 보이면 = generic 분석. 다음엔 더 사용자 specific하게.`);
    perCall.push('');
  }

  // V4 (사용자 명시 2026-05-04 V191): 히스토리 API 줄거리 요약 기능 제거.
  // 옛: 최근 14일 chatArchive 5개의 AI 생성 summary 를 system prompt 에 주입 → AI 가 과거 챕터 인용.
  // 제거 이유: AI 가 자기가 생성한 줄거리 요약을 다시 먹는 피드백 루프 — 정확도 ↓ + 토큰 낭비.
  // chatArchive 자체는 보존 (이전 대화 모달 + resume + topicCards 흐름 정상 작동).
  //
  // V4 (사용자 명시 2026-05-13 ultrathink): RAG 도입 — 옛 전역 inject 방식과 다름.
  //   query (사용자 마지막 message) 와 의미적으로 가까운 옛 챕터 N개 (Plus=1 / Premium=3) 를 MMR retrieve → perCall 영역에 inject.
  //   매번 다른 챕터 → 피드백 루프 risk ↓ (옛 정책 보호).
  //   useRag OFF / Light / 게스트 = retrieve X, inject X (자연 noop).
  if (window._ragLastRetrieved && Array.isArray(window._ragLastRetrieved) && window._ragLastRetrieved.length > 0
      && typeof _ragFormatInject === 'function') {
    try {
      const ragText = _ragFormatInject(window._ragLastRetrieved);
      if (ragText && ragText.length > 0) perCall.push(ragText);
    } catch (e) { console.warn('[rag] inject fail:', e?.message || e); }
  }

  // 사용자 요청 2026-04-29: 사용자가 약속한 followup (예: "나중에 체크해줘") — 시간 지났으면 자발적으로 물어보기
  // mission 중 _followupAsked=false + 지난 결과 미체크인 거 추출
  const pendingFollowups = (state.missions || [])
    .filter(m => m.status === 'completed' && !m.attemptStatus && !m._followupAsked)
    .filter(m => {
      if (!m.completedAt) return false;
      const ageDays = (Date.now() - new Date(m.completedAt).getTime()) / 86400000;
      return ageDays >= 1 && ageDays < 14;  // 1일~2주 사이
    })
    .slice(0, 3);
  if (pendingFollowups.length > 0) {
    sessionStable.push('[사용자가 약속한 후속 — 자연스럽게 물어볼 수 있음]');
    pendingFollowups.forEach(m => {
      sessionStable.push(`- "${m.title}" (${m.completedAt && m.completedAt.slice(0, 10) || ''} 완료, 결과 체크 X)`);
    });
    sessionStable.push('  · 사용자가 관련 주제 꺼내면 "지난번 X 어떻게 됐어?" 자연스럽게 한 번. 매 대화마다 X. 사용자가 거절하면 다시 X.');
    sessionStable.push('');
  }

  // 사용자 명시 2026-05-02 ultrathink: missions 10 → 5 (volatile slim).
  // 사용자 명시 2026-05-11: dismissed 미션은 system prompt 에서 제외.
  const recentMissions = state.missions.filter(m => m && m.status !== 'dismissed').slice(-5);
  if (recentMissions.length > 0) {
    sessionStable.push('[최근 미션 기록]');
    recentMissions.forEach(m => {
      const icon = m.status === 'completed' ? '✓' : m.status === 'skipped' ? '⊘' : '○';
      sessionStable.push(`${icon} "${m.title}" (${m.status})`);
    });
    sessionStable.push('');
  }

  // V3.13.x: 오늘 entry는 별도 섹션으로 더 자세히 (체크인 자동 chat push 제거 보강)
  // 사용자 명시 2026-05-10: 한 세션 내 사용자가 체크인 입력 시 변경 가능 → perCall (캐시 X).
  const _todayEntry = (state.entries || []).find(e => e.date === _dayKeyVal);
  if (_todayEntry) {
    perCall.push('[오늘 체크인]');
    if (_todayEntry.sleepStart && _todayEntry.sleepEnd) perCall.push(`- 수면: ${_todayEntry.sleepStart}~${_todayEntry.sleepEnd}`);
    if (_todayEntry.vitality != null) perCall.push(`- 활력: ${_todayEntry.vitality}/5`);
    if (_todayEntry.mood != null) perCall.push(`- 기분: ${_todayEntry.mood}/5`);
    const _activeModes = Object.keys(_todayEntry.modes || {}).filter(k => _todayEntry.modes[k]);
    if (_activeModes.length) perCall.push(`- 모드: ${_activeModes.join(', ')}`);
    if (_todayEntry.dailyQuestion && _todayEntry.dailyQuestion.text) perCall.push(`- 오늘의 질문: "${_todayEntry.dailyQuestion.text}"`);
    if (_todayEntry.note) perCall.push(`- 메모/답변: ${_todayEntry.note}`);
    if (_todayEntry.diary) perCall.push(`- 일기: ${_todayEntry.diary}`);
    perCall.push('(참고용 컨텍스트. 사용자가 명시적으로 묻지 않은 한 굳이 분석/되짚지 말 것.)');
    perCall.push('');
  }

  // 사용자 명시 2026-05-02 ultrathink: entries 14일 → 7일 (volatile slim, cache X 영역 직접 절감).
  const recent = state.entries.slice(-7);
  if (recent.length > 0) {
    sessionStable.push('[최근 1주 체크인]');
    recent.forEach(e => {
      const parts = [];
      if (e.sleepStart && e.sleepEnd) parts.push(`수면 ${e.sleepStart}-${e.sleepEnd}`);
      if (e.vitality) parts.push(`활력${e.vitality}/5`);
      if (e.valence !== undefined) parts.push(`V${e.valence}/A${e.arousal}`);
      if (e.mood) parts.push(`기분${e.mood}/5`);
      if (e.overwhelm) parts.push(`스트레스:${e.overwhelm}`);
      if (e.meals) parts.push(`식사:${e.meals}`);
      if (e.movement) parts.push(`움직임:${e.movement}`);
      if (e.focus) parts.push(`집중:${e.focus}`);
      if (e.social) parts.push(`연결:${e.social}`);
      if (e.cyclePhase) parts.push(`주기:${e.cyclePhase}`);
      if (e.weather) parts.push(`날씨:${e.weather.emoji}${e.weather.label}`);
      if (e.dailyQuestion?.text && e.note) parts.push(`Q:"${e.dailyQuestion.text.slice(0,40)}" A:${e.note.slice(0, 60)}`);
      else if (e.note) parts.push(`메모:${e.note.slice(0, 60)}`);
      if (parts.length) sessionStable.push(`${e.date}: ${parts.join(' | ')}`);
    });
    sessionStable.push('');
  }

  // 사용자 명시 2026-05-06: 메모 type 은 분석/추출/AI prompt 에서 제외 (순수 메모)
  const _activeArchive = (state.archive || []).filter(a => !a._deleted && a.type !== 'memo' && !a._excludeFromAI);
  if (_activeArchive.length > 0) {
    sessionStable.push('[과거 깨달음 (최근 5개)]');
    // 사용자 요청 2026-04-29 (perf #5): insight 길면 자름 (180자)
    _activeArchive.slice(0, 5).forEach(a => sessionStable.push(`- ${a.date}: ${(a.insight || '').slice(0, 180)}`));
  }

  // Mission state
  if (hasActivePendingMission()) {
    sessionStable.push('\n[현재 상태] 오늘의 미션이 이미 있음. 새 제안은 신중하게 - 이미 있는 미션을 언급하거나, 진짜 다른 것일 때만 제안.');
  }

  return {
    stable: stable.join('\n'),
    sessionStable: sessionStable.join('\n'),
    perCall: perCall.join('\n'),
    // 하위호환: 옛 호출처 (buildSystemPrompt() 등) 위해 volatile = sessionStable + perCall 결합 유지.
    volatile: [sessionStable.join('\n'), perCall.join('\n')].filter(Boolean).join('\n')
  };
}

