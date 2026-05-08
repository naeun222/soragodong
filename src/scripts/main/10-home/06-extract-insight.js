  try {
    if (!_canAI()) return;
    if (!insightText || typeof insightText !== 'string') return;
    const cleanInsight = insightText.trim();
    if (cleanInsight.length < 20) return;  // 너무 짧으면 추출 가치 X

    const prompt = `다음은 사용자가 "✦ 깨달음으로" 보관한 메시지야 (출처: ${source}).
사용자가 의도적으로 가치 있다고 판단한 텍스트라서 자기 인식 / 패턴 / 가치관 신호가 있을 수 있어.

[사용자 직전 발화]
${(userMsg || '').slice(0, 600) || '(없음)'}

[깨달음 메시지 — AI(소라고동) 응답]
${cleanInsight.slice(0, 1200)}

이 깨달음에서 사용자(주체) 자신이 새로 발견 / 명확히 한 것 만 JSON으로 뽑아.
- ⚠️ AI(소라고동)의 가설·해석·"너 X해" 발화는 사용자 trait 후보 X. AI는 외부 관찰자.
- [사용자 직전 발화] 에 사용자 본인이 직접 표현한 자기 인식만 trait/value/pattern 후보.
- 깨달음 메시지(AI 응답)는 그 발화를 명명/연결한 lens일 뿐 — AI 가 단정한 명제 ≠ 사용자 자신의 인식.
- 사용자 직전 발화가 비어있거나 짧으면 → 모두 빈 배열.
- 추측·일반론 X. 근거 약하면 빈 배열.

{
  "new_traits": [{"name": "...", "description": "...", "confidence": 0.0~1.0}],
  "new_values": [{"name": "...", "description": "...", "sdt_need": "autonomy|competence|relatedness|null", "confidence": 0.0~1.0}],
  "new_patterns": [{"name": "...", "trigger": "...", "sequence": "...", "confidence": 0.0~1.0}],
  "case_formulation_update": {"new_problem": "...", "new_mechanism": "...", "new_strength": "...", "new_goal": "...", "new_growth": "..."}
}

JSON만, 다른 글 X.`;

    const resp = await callAnthropic({
      _endpoint: 'extract_chapter',
      // 사용자 요청 2026-04-30 (재조정): 깨달음 버튼 ~10/일 자주 호출 → "자주 안 하는 거 = Opus" 원칙 따라 sonnet 복원.
      // 정확도는 confidence 0.5 threshold + user_verified ✓ 컨펌 흐름으로 보호.
      model: 'claude-sonnet-4-6',
      max_tokens: 700,
      messages: [{ role: 'user', content: prompt }]
    });
    if (!resp.ok) return;
    const data = await resp.json();
    const raw = data?.content?.[0]?.text || '';
    const jm = raw.match(/\{[\s\S]*\}/);
    if (!jm) return;
    let analysis;
    try { analysis = JSON.parse(jm[0]); } catch { return; }
    if (!analysis || typeof analysis !== 'object') return;

    // 사용자 요청 2026-04-29: "임시" 대화도 깊이 있는 내용 → 메인 chat과 동일 0.5 threshold.
    // unverified 마킹은 유지 → 사용자 ✓ 컨펌 흐름.
    const THRESHOLD = 0.5;
    let touched = false;

    if (Array.isArray(analysis.new_traits)) {
      analysis.new_traits.forEach(t => {
        if (!t || !t.name || typeof t.name !== 'string') return;
        const conf = typeof t.confidence === 'number' ? t.confidence : 0;
        const exists = (state.traits || []).find(e => similarText(e.name, t.name));
        if (!exists) {
          if (conf < THRESHOLD) return;
          state.traits = state.traits || [];
          state.traits.push({
            id: 'trait_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
            name: t.name.trim(), description: (t.description || '').trim(),
            confidence: conf, user_verified: false, evidence_count: 1,
            extractedFrom: source,
            created_at: new Date().toISOString()
          });
          touched = true;
        } else {
          exists.evidence_count = (exists.evidence_count || 1) + 1;
          exists.confidence = Math.min(1.0, (exists.confidence || 0.5) + 0.1);
          touched = true;
        }
      });
    }

    if (Array.isArray(analysis.new_values)) {
      analysis.new_values.forEach(v => {
        if (!v || !v.name || typeof v.name !== 'string') return;
        const conf = typeof v.confidence === 'number' ? v.confidence : 0;
        const exists = (state.values || []).find(e => similarText(e.name, v.name));
        if (!exists) {
          if (conf < THRESHOLD) return;
          state.values = state.values || [];
          state.values.push({
            id: 'val_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
            name: v.name.trim(), description: (v.description || '').trim(),
            confidence: conf, user_verified: false, evidence_count: 1,
            sdt_need: v.sdt_need || null,
            extractedFrom: source,
            created_at: new Date().toISOString()
          });
          touched = true;
        } else {
          exists.evidence_count = (exists.evidence_count || 1) + 1;
          exists.confidence = Math.min(1.0, (exists.confidence || 0.5) + 0.1);
          touched = true;
        }
      });
    }

    if (Array.isArray(analysis.new_patterns)) {
      analysis.new_patterns.forEach(p => {
        if (!p || !p.name || typeof p.name !== 'string') return;
        const conf = typeof p.confidence === 'number' ? p.confidence : 0;
        const exists = (state.patterns || []).find(e => similarText(e.name, p.name));
        if (!exists) {
          if (conf < THRESHOLD) return;
          state.patterns = state.patterns || [];
          state.patterns.push({
            id: 'pat_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
            name: p.name.trim(), description: (p.description || '').trim(),
            trigger: (p.trigger || '').trim(), sequence: (p.sequence || '').trim(),
            confidence: conf, user_verified: false, evidence_count: 1,
            extractedFrom: source,
            created_at: new Date().toISOString()
          });
          touched = true;
        } else {
          exists.evidence_count = (exists.evidence_count || 1) + 1;
          exists.confidence = Math.min(1.0, (exists.confidence || 0.5) + 0.1);
          touched = true;
        }
      });
    }

    // case formulation → 메인 풀에 push + unverified 마킹 (사용자 ✓로 컨펌)
    const u = analysis.case_formulation_update;
    if (u && typeof u === 'object') {
      const cf = state.caseFormulation = state.caseFormulation || { version: 0, lastUpdated: null, problems: [], mechanisms: [], strengths: [], goals: [], growth: [], unverified: {} };
      if (!cf.unverified) cf.unverified = {};
      const fields = [
        ['new_problem', 'problems'],
        ['new_mechanism', 'mechanisms'],
        ['new_strength', 'strengths'],
        ['new_goal', 'goals'],
        ['new_growth', 'growth']
      ];
      fields.forEach(([key, bucket]) => {
        const txt = u[key];
        if (!txt || typeof txt !== 'string') return;
        const trimmed = txt.trim();
        if (!trimmed) return;
        if (!Array.isArray(cf[bucket])) cf[bucket] = [];
        if (cf[bucket].some(x => similarText(x, trimmed))) return;
        cf[bucket].push(trimmed);
        if (!Array.isArray(cf.unverified[bucket])) cf.unverified[bucket] = [];
        cf.unverified[bucket].push(trimmed);
        touched = true;
      });
      if (touched) {
        cf.version = (cf.version || 0) + 1;
        cf.lastUpdated = new Date().toISOString();
      }
    }

    if (touched) {
      saveState();
      // 모델 화면 열려 있으면 새로고침 (선택)
      if (typeof renderModel === 'function') {
        try { renderModel(); } catch {}
      }
    }
  } catch (e) {
    // silent — 사용자 흐름 방해 X
    console.warn('[insight extract] fail:', e);
  }
}

// 사용자 요청 2026-04-30: 매 메시지 자동 추출 → 챕터 마무리 시점만.
// 사용자 명시 2026-05-02 ultrathink: prompt builder + analysis processor 분리 — Batch API path 가 재사용.
function _buildExtractChapterPrompt(messages) {
  const chatLog = messages.map(m => {
    const role = m.role === 'user' ? '나' : '소라';
    let content = (m.content || '').replace(/```json[\s\S]*?```/g, '').trim();
    content = content.replace(/\{[\s\S]*"(?:new_traits|insight|extracted_tasks)[\s\S]*\}\s*$/g, '').trim();
    return `${role}: ${content}`;
  }).join('\n\n');

  return `사용자가 AI 친구 "소라고동"과 한 챕터(연속 대화 묶음)에서 나눈 대화 전체.
챕터 전반에 걸쳐 발견된 사용자 자기 인식 / 패턴 / 가치관 / 문제·강점·목표를 JSON으로 추출.
강한 신호 (명시적 자기 인식, 행동·감정 증거 동반)만. 추측·일반론 X. 근거 약하면 빈 배열.

[필터 — 자동 거름]
- trivial 일상 (음식·날씨·일정·단순 사건·짧은 잡담) X. 일회성 진술 / 농담 / 일반론 X.
- 사용자 명시 발화 ("나는 ..." / "내가 ... 하더라" / "그때 ... 느꼈어") + 행동·감정 증거 1+ 함께일 때만 추출.
- confidence < 0.6 항목 빈 배열로 (강한 신호 아니면 등록 X).
- 각 description 끝에 사용자 실제 발화 1줄 인용 (예: 'description: 거절 후 부채감 — "거절했더니 미안한 마음이 며칠 가더라"').

[대화 원문]
${chatLog.slice(0, 8000)}

[출력 — JSON만]
{
  "new_traits": [{"name": "...", "description": "...", "confidence": 0.0~1.0}],
  "new_values": [{"name": "...", "description": "...", "sdt_need": "autonomy|competence|relatedness|null", "confidence": 0.0~1.0}],
  "new_patterns": [{"name": "...", "trigger": "...", "sequence": "...", "confidence": 0.0~1.0}],
  "case_formulation_update": {"new_problem": "...", "new_mechanism": "...", "new_strength": "...", "new_goal": "...", "new_growth": "..."},
  "deep_profile_update": {
    "development": {
      "childhood_addition": "어린 시절·가족·양육에 대한 새 정보 한 줄 (있을 때만, 사용자가 명시 언급)",
      "school_addition": "학창 시절 새 정보 한 줄",
      "adhd_addition": "자기 인식·발견 새 정보 한 줄 (진단명 발견 / 큰 깨달음 / 정체성 명명 등 — 사용자가 명시 언급한 것만)",
      "turning_point": {"when": "YYYY-MM 또는 시기", "title": "전환점 제목", "impact": "영향 한 줄"}
    },
    "relationships": [{"name": "이름 (있을 때)", "relation": "가족|친구|연인|동료|전문가|기타", "tone": "안전|자극|혼합", "influence": "positive|negative|mixed", "notes": "한 줄"}],
    "self_narrative": {
      "self_belief": "자신에 대한 신념 한 줄 (\"나는 ...\")",
      "world_belief": "세상에 대한 신념 한 줄 (\"세상은 ...\")",
      "future_belief": "미래에 대한 신념 한 줄 (\"미래는 ...\")",
      "identity_keyword": "정체성 keyword 1개"
    }
  }
}

deep_profile_update는 사용자가 챕터에서 명시적으로 언급한 정보만 (예: "엄마가 늘 비교해" / "그때 진단 받은 후 시야가 달라졌어" / "나는 패턴 인식이 강해"). 추측 X. 빈 부분은 빈 string 또는 null.

JSON만, 마크다운 X.`;
}

// analysis JSON 객체 받아 state 갱신. true 반환 시 saveState 권장.
function _processExtractChapterAnalysis(analysis) {
  if (!analysis || typeof analysis !== 'object') return false;
  let touched = false;
  // 사용자 명시 2026-05-03 ultrathink: trivial 노이즈 cut — 0.5 → 0.6 (강한 신호만 등록).
  const THRESHOLD = 0.6;

    if (Array.isArray(analysis.new_traits)) {
      analysis.new_traits.forEach(t => {
        if (!t || !t.name) return;
        const conf = typeof t.confidence === 'number' ? t.confidence : 0.5;
        const exists = (state.traits || []).find(e => similarText(e.name, t.name));
        if (!exists) {
          if (conf < THRESHOLD) return;
          state.traits = state.traits || [];
          state.traits.push({
            id: 'trait_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
            name: t.name.trim(), description: (t.description || '').trim(),
            confidence: conf, user_verified: false, evidence_count: 1,
            extractedFrom: 'chapter',
            created_at: new Date().toISOString()
          });
          touched = true;
        } else {
          exists.evidence_count = (exists.evidence_count || 1) + 1;
          exists.confidence = Math.min(1.0, (exists.confidence || 0.5) + 0.1);
          touched = true;
        }
      });
    }
    if (Array.isArray(analysis.new_values)) {
      analysis.new_values.forEach(v => {
        if (!v || !v.name) return;
        const conf = typeof v.confidence === 'number' ? v.confidence : 0.5;
        const exists = (state.values || []).find(e => similarText(e.name, v.name));
        if (!exists) {
          if (conf < THRESHOLD) return;
          state.values = state.values || [];
          state.values.push({
            id: 'val_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
            name: v.name.trim(), description: (v.description || '').trim(),
            confidence: conf, user_verified: false, evidence_count: 1,
            sdt_need: v.sdt_need || null,
            extractedFrom: 'chapter',
            created_at: new Date().toISOString()
          });
          touched = true;
        } else {
          exists.evidence_count = (exists.evidence_count || 1) + 1;
          exists.confidence = Math.min(1.0, (exists.confidence || 0.5) + 0.1);
          touched = true;
        }
      });
    }
    if (Array.isArray(analysis.new_patterns)) {
      analysis.new_patterns.forEach(p => {
        if (!p || !p.name) return;
        const conf = typeof p.confidence === 'number' ? p.confidence : 0.5;
        const exists = (state.patterns || []).find(e => similarText(e.name, p.name));
        if (!exists) {
          if (conf < THRESHOLD) return;
          state.patterns = state.patterns || [];
          state.patterns.push({
            id: 'pat_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
            name: p.name.trim(), description: (p.description || '').trim(),
            trigger: (p.trigger || '').trim(), sequence: (p.sequence || '').trim(),
            confidence: conf, user_verified: false, evidence_count: 1,
            extractedFrom: 'chapter',
            created_at: new Date().toISOString()
          });
          touched = true;
        } else {
          exists.evidence_count = (exists.evidence_count || 1) + 1;
          exists.confidence = Math.min(1.0, (exists.confidence || 0.5) + 0.1);
          touched = true;
        }
      });
    }
    const u = analysis.case_formulation_update;
    if (u && typeof u === 'object') {
      const cf = state.caseFormulation = state.caseFormulation || { version: 0, lastUpdated: null, problems: [], mechanisms: [], strengths: [], goals: [], growth: [], unverified: {} };
      if (!cf.unverified) cf.unverified = {};
      const fields = [
        ['new_problem', 'problems'],
        ['new_mechanism', 'mechanisms'],
        ['new_strength', 'strengths'],
        ['new_goal', 'goals'],
        ['new_growth', 'growth']
      ];
      fields.forEach(([key, bucket]) => {
        const txt = u[key];
        if (!txt || typeof txt !== 'string') return;
        const trimmed = txt.trim();
        if (!trimmed) return;
        if (!Array.isArray(cf[bucket])) cf[bucket] = [];
        if (cf[bucket].some(x => similarText(x, trimmed))) return;
        cf[bucket].push(trimmed);
        // 챕터 자동 추출 = unverified 마킹
        if (!Array.isArray(cf.unverified[bucket])) cf.unverified[bucket] = [];
        cf.unverified[bucket].push(trimmed);
        touched = true;
      });
      if (touched) {
        cf.version = (cf.version || 0) + 1;
        cf.lastUpdated = new Date().toISOString();
      }
    }

    // 사용자 요청 2026-04-30: deep_profile_update 자동 추출 (Q2 더 깊은 나).
    // 사용자가 챕터에서 명시 언급한 발달·관계·자기서사 정보만. user_verified=false → 사용자 ✓ 컨펌.
    const dpu = analysis.deep_profile_update;
    if (dpu && typeof dpu === 'object') {
      if (!state.userDeepProfile) state.userDeepProfile = JSON.parse(JSON.stringify(DEFAULT_STATE.userDeepProfile));
      const udp = state.userDeepProfile;
      let dpuTouched = false;
      // development 추가 — append (기존 텍스트에 누적)
      if (dpu.development && typeof dpu.development === 'object') {
        if (!udp.development) udp.development = { childhood: '', schoolYears: '', adhdDiscovery: '', turningPoints: [] };
        const appendIfNew = (current, addition) => {
          if (!addition || typeof addition !== 'string') return current;
          const t = addition.trim();
          if (!t) return current;
          if ((current || '').includes(t)) return current;
          return (current ? current + '\n' : '') + t;
        };
        const newCh = appendIfNew(udp.development.childhood, dpu.development.childhood_addition);
        if (newCh !== udp.development.childhood) { udp.development.childhood = newCh; dpuTouched = true; }
        const newSc = appendIfNew(udp.development.schoolYears, dpu.development.school_addition);
        if (newSc !== udp.development.schoolYears) { udp.development.schoolYears = newSc; dpuTouched = true; }
        const newAd = appendIfNew(udp.development.adhdDiscovery, dpu.development.adhd_addition);
        if (newAd !== udp.development.adhdDiscovery) { udp.development.adhdDiscovery = newAd; dpuTouched = true; }
        // turning_point — 단일 객체
        const tp = dpu.development.turning_point;
        if (tp && tp.title && typeof tp.title === 'string') {
          if (!Array.isArray(udp.development.turningPoints)) udp.development.turningPoints = [];
          const exists = udp.development.turningPoints.find(t => similarText(t.title, tp.title));
          if (!exists) {
            udp.development.turningPoints.push({
              id: 'tp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5),
              when: (tp.when || '?').toString().slice(0, 30),
              title: tp.title.slice(0, 60),
              description: '',
              impact: (tp.impact || '').slice(0, 100),
              extractedFrom: 'chapter',
              user_verified: false
            });
            dpuTouched = true;
          }
        }
      }
      // relationships
      if (Array.isArray(dpu.relationships)) {
        if (!Array.isArray(udp.relationships)) udp.relationships = [];
        dpu.relationships.forEach(r => {
          if (!r || !r.name || typeof r.name !== 'string') return;
          const exists = udp.relationships.find(e => similarText(e.name, r.name));
          if (!exists) {
            udp.relationships.push({
              id: 'rel_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5),
              name: r.name.trim().slice(0, 30),
              relation: (r.relation || '').slice(0, 20),
              tone: (r.tone || '').slice(0, 20),
              influence: (r.influence || '').slice(0, 20),
              notes: (r.notes || '').slice(0, 100),
              extractedFrom: 'chapter',
              user_verified: false
            });
            dpuTouched = true;
          }
        });
      }
      // self_narrative — beliefs + identity keyword
      if (dpu.self_narrative && typeof dpu.self_narrative === 'object') {
        if (!udp.selfNarrative) udp.selfNarrative = { selfStory: '', coreBeliefs: { aboutSelf: [], aboutWorld: [], aboutFuture: [] }, howWantToBeSeen: '', identityKeywords: [] };
        if (!udp.selfNarrative.coreBeliefs) udp.selfNarrative.coreBeliefs = { aboutSelf: [], aboutWorld: [], aboutFuture: [] };
        const cb = udp.selfNarrative.coreBeliefs;
        const sn = dpu.self_narrative;
        const pushBelief = (arrKey, txt) => {
          if (!txt || typeof txt !== 'string') return;
          const t = txt.trim();
          if (!t) return;
          if (!Array.isArray(cb[arrKey])) cb[arrKey] = [];
          if (!cb[arrKey].some(s => similarText(s, t))) {
            cb[arrKey].push(t.slice(0, 100));
            dpuTouched = true;
          }
        };
        pushBelief('aboutSelf', sn.self_belief);
        pushBelief('aboutWorld', sn.world_belief);
        pushBelief('aboutFuture', sn.future_belief);
        if (sn.identity_keyword && typeof sn.identity_keyword === 'string') {
          if (!Array.isArray(udp.selfNarrative.identityKeywords)) udp.selfNarrative.identityKeywords = [];
          const kw = sn.identity_keyword.trim().slice(0, 30);
          if (kw && !udp.selfNarrative.identityKeywords.some(k => similarText(k, kw))) {
            udp.selfNarrative.identityKeywords.push(kw);
            dpuTouched = true;
          }
        }
      }
      if (dpuTouched) {
        udp.version = (udp.version || 0) + 1;
        udp.lastUpdated = new Date().toISOString();
        touched = true;
      }
    }

  // 사용자 명시 2026-05-08 ultrathink: case_analysis 결과 → 나 탭 dot 마킹 (모든 path 자동).
  if (touched && typeof _markNavBatchUpdated === 'function') {
    _markNavBatchUpdated(['model']);
  }
  return touched;
}

// 일반 path — 5h+ 갭 즉시 (신규유저 첫 3 챕터). 또는 batch fallback timeout 시.
