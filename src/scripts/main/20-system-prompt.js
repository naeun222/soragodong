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
  // V4 사용자 명시 2026-05-26 ultrathink — 대화탭 표정 출력 규칙.
  //   응답 첫 줄에 [expr: XXX] prefix → 클라가 strip + 아바타 표정 갱신. 12 표정 풀 = CHAT_MODE_EXPRESSIONS (19-chat/15-chat-mode.js).
  //   stable 영역에 넣어 cache hit (변동 X). 모델 vent + laugh 무시 가드는 클라 sanitize 도 추가 (15-chat-mode.js _sanitizeChatExpression).
  stable.push('[대화탭 표정 출력 규칙 — 매 응답 첫 줄]');
  stable.push('  · 응답 맨 첫 줄에 [expr: XXX] 형식으로 표정 ID 하나를 쓰고 줄을 바꾼다. 본문은 그 다음 줄부터 쓴다.');
  stable.push('  · XXX 는 아래 열두 개 중 하나다:');
  stable.push('    serious, soft-smile, bright-smile, laugh, surprised, curious, thinking, tilt, empathic, warm, nod, focused');
  stable.push('  · 대화 내용과 사용자 감정에 맞춰 고른다. 같은 표정을 연달아 반복하지 않는다.');
  stable.push('  · chatMode 가 vent (마음 털어놓기) 일 때는 laugh 를 쓰지 않는다. warm, empathic, soft-smile 중에서 고른다.');
  stable.push('  · 본문 안에는 [expr:...] 를 넣지 않는다. 첫 줄에 한 번만 쓴다.');
  stable.push('');
  stable.push('\n━━━━━━━━━━━━━━━━━━━━━\n사용자에 대한 현재 모델\n━━━━━━━━━━━━━━━━━━━━━\n');
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
    // V4 feat (사용자 명시 2026-05-26 ultrathink): 4 클러스터 양식 통일 — chat AI 도 cluster wording 인식하도록.
    //   강점 + 메커니즘 → 자기조절 도구 클러스터 합본. problems → 다루어야 할 곳. goals/growth 있을 때만 추가 (있는 cf 만 push).
    const _selfReg = [...(cf.strengths || []), ...(cf.mechanisms || [])];
    if (_selfReg.length) stable.push('자기조절 도구: ' + _cfTrunc(_selfReg));
    if (cf.problems && cf.problems.length) stable.push('다루어야 할 곳: ' + _cfTrunc(cf.problems));
    if (cf.goals && cf.goals.length) stable.push('가고 싶은 곳: ' + _cfTrunc(cf.goals));
    if (cf.growth && cf.growth.length) stable.push('자라는 곳: ' + _cfTrunc(cf.growth));
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
      stable.push('— 자기 이야기·핵심 신념 —');
      snLines.forEach(l => stable.push(l));
    }
    stable.push('  · 위 정보는 사용자가 직접 입력한 자기 정보다. 관련이 있을 때 자연스럽게 인용할 수 있다. 단정하지 않는다.');
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
    perCall.push(`[entry 기준 날짜] ${_dayKeyVal} (${_dowEntry}요일) — 새벽 4시까지는 전날 entry 로 묶인다`);
  }
  perCall.push('');

  const activeModes = Object.keys(state.modes || {}).filter(k => state.modes[k]);
  if (activeModes.length > 0) {
    const modeMap = { exam: '마감/시험', travel: '여행 중', sick: '아픔', rest: '휴식', period: '월경' };
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
    sessionStable.push('[시나리오 토론 컨텍스트 — 매 응답에서 유지한다]');
    sessionStable.push('- 사용자가 가상 시나리오를 제안했다. 답도 그 시나리오 안에서 한다. 실제로 있었던 일이 아니다.');
    sessionStable.push('- 시나리오가 시작된 뒤 다섯 턴, 열 턴이 지나도 같다. 사용자가 짧게 "응", "맞네"라고만 답해도 시나리오 안의 답으로 받아들인다.');
    sessionStable.push('- 실제 일인 것처럼 묻지 않는다. 다음과 같은 질문은 하지 않는다:');
    sessionStable.push('  · "그 다큐 뭐였어?", "어떤 장르?", "어떤 영상?"');
    sessionStable.push('  · "실제로 본 거였어?", "정말 그랬어?"');
    sessionStable.push('  · "그날 어땠어?", "결국 어떻게 됐어?"');
    sessionStable.push('  · "더 자세히 알려줘" 같이 실제 사실을 캐묻는 말');
    sessionStable.push('- 되는 것은 시나리오 안에서 이어가는 말이다:');
    sessionStable.push('  · "그 답을 보면 이런 쪽으로 가는 것 같아"');
    sessionStable.push('  · "다른 식으로 가면 어떨까"');
    sessionStable.push('  · "그 상황에선 어떻게 반응할 것 같아?"');
    sessionStable.push('  · "시나리오 안에서 이랬다면?" 같은 가정');
    sessionStable.push('- 여기서 나온 내용은 따로 격리되어 자기 모델에 약하게만 반영된다. 모델은 토론을 자연스럽게 이어가면 된다.');
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
      perCall.push(`[관찰된 패턴 — 테스트 모드. 응답 안에 반드시 한 줄 넣는다]`);
      perCall.push(`- ${lbl.name}: ${activeDiag.evidence}`);
      perCall.push(`  · 응답 마지막에 한 줄로 자연스럽게 한 번 인용한다. "${lbl.name}" 이라는 말을 직접 써도 된다.`);
      perCall.push(`  · 사람이 아니라 패턴을 주어로 말한다 ("이 패턴이 돌고 있는 것 같아"). 단정하지 않는다.`);
      perCall.push('');
    } else {
      perCall.push(`[관찰된 패턴 — "더 알아보기" 요청. 4단 응답의 [내가 본 것] 또는 [이게 뭐냐면]에 자연스럽게 한 번 인용한다]`);
      perCall.push(`- ${lbl.name}: ${activeDiag.evidence}`);
      perCall.push(`  · 인용 위치: [내가 본 것] 첫 줄 또는 [이게 뭐냐면] 안. "이 패턴이 돌고 있는 것 같아" 정도로.`);
      perCall.push(`  · 사람이 아니라 패턴을 주어로 말한다. "너는 이런 사람이야"처럼 사람에게 이름표를 붙이지 않는다. 결론을 단정하지 않는다.`);
      perCall.push(`  · 한 번만 인용한다. 사용자가 아니라고 하면 다시 꺼내지 않는다.`);
      perCall.push('');
      if (typeof markDiagnosisShown === 'function' && activeDiag.status === 'active') {
        try { markDiagnosisShown(activeDiag.id); } catch (e) { console.warn('markDiagnosisShown:', e); }
      }
    }
  } else if (_isDeeperContext) {
    // 사용자 요청 2026-04-29: 활성 진단이 없을 때도 4단 응답 — 사용자 본인 데이터(traits/patterns/case formulation) 우선 인용 강제
    perCall.push(`[4단 응답 — 관찰된 패턴이 없어도 사용자 본인 데이터를 먼저 쓴다]`);
    perCall.push(`  · [내가 본 것]은 위의 특성, 관찰된 패턴, 자기 모델에서 직접 가져온다. 교과서에 나오는 일반론만으로 채우지 않는다.`);
    perCall.push(`  · [이게 뭐냐면]은 일상어로 풀어 쓴다. 심리학 용어나 연구자 이름은 쓰지 않는다. [내가 본 것]에서 말한 이 사람의 패턴과 이어져야 한다.`);
    perCall.push(`  · 사용자가 "현실적으로 별로야" 같은 반응을 보이면 분석이 두루뭉술했다는 뜻이다. 다음엔 이 사람의 기록에 더 붙여서 쓴다.`);
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
  //
  // V4 (사용자 명시 2026-05-23 ultrathink): 직전 챕터 자동 inject (B안) 추가.
  //   anaphoric query ("끝났어", "그거") 의 referent 보장. RAG retrieve 와 무관, 항상 직전 1개.
  //   B 먼저 호출 → archive id 받음 → RAG 쪽에서 dedup (같은 archive 두 번 inject 방지).
  let recentArchiveId = null;
  if (typeof _recentChapterInject === 'function') {
    try { recentArchiveId = _recentChapterInject(perCall); }
    catch (e) { console.warn('[recentChapter] inject fail:', e?.message || e); }
  }
  if (window._ragLastRetrieved && Array.isArray(window._ragLastRetrieved) && window._ragLastRetrieved.length > 0
      && typeof _ragFormatInject === 'function') {
    try {
      const filtered = recentArchiveId
        ? window._ragLastRetrieved.filter(r => r.archiveId !== recentArchiveId)
        : window._ragLastRetrieved;
      const ragText = _ragFormatInject(filtered);
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
    sessionStable.push('[사용자가 약속한 후속 — 관련 주제가 나오면 물어볼 수 있다]');
    pendingFollowups.forEach(m => {
      sessionStable.push(`- "${m.title}" (${m.completedAt && m.completedAt.slice(0, 10) || ''} 완료, 결과는 아직 확인 안 됨)`);
    });
    sessionStable.push('  · 사용자가 관련 주제를 꺼내면 "지난번 그거 어떻게 됐어?" 정도로 한 번만 묻는다. 매 대화마다 묻지 않는다. 사용자가 넘기면 다시 묻지 않는다.');
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
    perCall.push('(참고용이다. 사용자가 묻지 않았으면 분석하거나 되짚지 않는다.)');
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
    sessionStable.push('\n[현재 상태] 오늘의 미션이 이미 있다. 새 미션을 제안하지 않는다. 이미 있는 미션을 언급하거나, 사용자가 묻고 그것과 정말 다른 것일 때만 제안한다.');
  }

  return {
    stable: stable.join('\n'),
    sessionStable: sessionStable.join('\n'),
    perCall: perCall.join('\n'),
    // 하위호환: 옛 호출처 (buildSystemPrompt() 등) 위해 volatile = sessionStable + perCall 결합 유지.
    volatile: [sessionStable.join('\n'), perCall.join('\n')].filter(Boolean).join('\n')
  };
}

