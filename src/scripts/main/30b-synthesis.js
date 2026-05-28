// 사용자 명시 2026-05-29 (연결·통합 §4/§5): synthesis 패스 — 흩어진 자기관찰 항목을 ≤8 핵심 노드로 통합.
//   write-time(PR2a) 이 *새* 원자화를 막는다면, synthesis 는 *기존* 80 원자를 ≤8 로 collapse (눈에 보이는 통합).
//   force_analyze(평면 항목 갱신)와 별개 layer — raw 항목 0 손실, state.coreNodes overlay 만 생성/갱신.
//   §16 재게이트: 기존 항목을 새 게이트(메타·앱·농담·일회·Barnum 제외)로 다시 거른 뒤 군집 (LLM 이 의미로).
//   trigger: 수동 (나 탭 버튼). 주기 auto(주1회+신규20)는 후속 PR.

const _SYNTH_MIN_ITEMS = 6;   // 이보다 적으면 통합 의미 X (8개 억지로 X — §8 cold start).
const _SYNTH_CORE_CAP = 8;    // CORE_NODE_CAP (사용자 확정 2026-05-29).
let _synthesisRunning = false;

// 통합 입력 — 활성 항목 (시뮬·삭제 제외). name + description + 카테고리 + confidence.
function _collectSynthesisItems() {
  const out = [];
  const push = (arr, category) => {
    (arr || []).forEach(it => {
      if (!it || (typeof it === 'object' && it._deleted)) return;
      if (typeof it === 'object' && it.extractedFrom === 'simulation') return;
      const name = (typeof it === 'string') ? it : (it.name || it.text);
      if (!name || !String(name).trim()) return;
      out.push({
        category,
        name: String(name).trim().slice(0, 80),
        description: (typeof it === 'object' && it.description) ? String(it.description).slice(0, 240) : '',
        confidence: (typeof it === 'object' && typeof it.confidence === 'number') ? Math.round(it.confidence * 100) / 100 : null
      });
    });
  };
  push(state.traits, 'trait');
  push(state.values, 'value');
  push(state.patterns, 'pattern');
  if (state.caseFormulation) {
    push(state.caseFormulation.problems, 'problem');
    push(state.caseFormulation.strengths, 'strength');
    push(state.caseFormulation.mechanisms, 'mechanism');
    push(state.caseFormulation.goals, 'goal');
    push(state.caseFormulation.growth, 'growth');
  }
  return out;
}

// 잘린 JSON 보강 (force-analyze 패턴 축약).
function _synthRepairJson(s) {
  let fixed = String(s || '').replace(/,(\s*[}\]])/g, '$1');
  let ob = 0, obr = 0, inS = false, esc = false;
  for (let i = 0; i < fixed.length; i++) {
    const c = fixed[i];
    if (esc) { esc = false; continue; }
    if (c === '\\') { esc = true; continue; }
    if (c === '"') { inS = !inS; continue; }
    if (inS) continue;
    if (c === '{') ob++; else if (c === '}') ob--;
    else if (c === '[') obr++; else if (c === ']') obr--;
  }
  while (obr > 0) { fixed += ']'; obr--; }
  while (ob > 0) { fixed += '}'; ob--; }
  return fixed;
}

// synthesis 실행. 반환 { ok, reason?, nodeCount?, sourceCount? }. 수동 버튼 + (후속) auto 에서 호출.
async function runSynthesis(opts) {
  opts = opts || {};
  if (_synthesisRunning) return { ok: false, reason: 'running' };
  if (typeof _canAI !== 'function' || !_canAI()) return { ok: false, reason: 'no-ai' };
  if (state.preferences && state.preferences.testerMode) return { ok: false, reason: 'tester' };
  const items = _collectSynthesisItems();
  if (items.length < _SYNTH_MIN_ITEMS) return { ok: false, reason: 'too-few', count: items.length };

  _synthesisRunning = true;
  try {
    const itemsJson = JSON.stringify(items).slice(0, 28000);
    const resp = await callAnthropic({
      _endpoint: 'synthesize',
      _userContentType: 'synthesize',
      _vars: { itemsJson },
      model: 'claude-opus-4-7',
      max_tokens: 3200,
      messages: [{ role: 'user', content: '' }]
    });
    if (!resp || !resp.ok) {
      const st = resp ? resp.status : 0;
      const errTxt = resp ? await resp.text().catch(() => '') : '';
      console.warn('[synthesis] resp not ok:', st, errTxt.slice(0, 200));
      return { ok: false, reason: 'http-fail', status: st };
    }
    const data = await resp.json();
    const raw = (data?.content?.[0]?.text || '').trim();
    const jm = raw.match(/\{[\s\S]*\}/);
    if (!jm) { console.warn('[synthesis] JSON 미매치'); return { ok: false, reason: 'parse-fail' }; }
    let parsed;
    try { parsed = JSON.parse(jm[0]); }
    catch {
      try { parsed = JSON.parse(_synthRepairJson(jm[0])); }
      catch (e2) { console.warn('[synthesis] parse fail:', e2); return { ok: false, reason: 'parse-fail' }; }
    }
    const nodesRaw = Array.isArray(parsed?.core_nodes) ? parsed.core_nodes : [];
    if (!nodesRaw.length) return { ok: false, reason: 'empty' };

    const _validValence = new Set(['strength', 'growth_area', 'neutral']);
    const _validType = new Set(['mechanism', 'trait', 'value', 'tension']);
    const _validConnType = new Set(['facet_of', 'feeds', 'tension']);
    const now = new Date().toISOString();
    const nodes = nodesRaw.slice(0, _SYNTH_CORE_CAP).map(n => ({
      id: 'cn_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      name: String(n?.name || '').trim().slice(0, 60),
      type: _validType.has(n?.type) ? n.type : 'mechanism',
      valence: _validValence.has(n?.valence) ? n.valence : 'neutral',
      mechanism: String(n?.mechanism || '').trim().slice(0, 400),
      linkage: String(n?.linkage || '').trim().slice(0, 400),
      leverage: String(n?.leverage || '').trim().slice(0, 400),
      uses: String(n?.uses || '').trim().slice(0, 120),
      clusters: Array.isArray(n?.clusters)
        ? n.clusters.filter(c => ['자기조절도구', '다루어야할곳', '가고싶은곳', '자라는곳'].includes(c)).slice(0, 4) : [],
      source_names: Array.isArray(n?.source_names)
        ? n.source_names.map(s => String(s).trim().slice(0, 80)).filter(Boolean).slice(0, 30) : [],
      connections: Array.isArray(n?.connections)
        ? n.connections.filter(c => c && c.to).map(c => ({
            to: String(c.to).trim().slice(0, 60),
            type: _validConnType.has(c.type) ? c.type : 'feeds',
            why: String(c.why || '').trim().slice(0, 160)
          })).slice(0, 10) : [],
      created_at: now
    })).filter(n => n.name);
    if (!nodes.length) return { ok: false, reason: 'empty' };

    state.coreNodes = nodes;
    state.coreNodesMeta = {
      version: ((state.coreNodesMeta && state.coreNodesMeta.version) || 0) + 1,
      generatedAt: now,
      sourceCount: items.length,
      centralThread: String(parsed?.central_thread || '').trim().slice(0, 400),
      regatedOut: Array.isArray(parsed?.regated_out)
        ? parsed.regated_out.map(s => String(s).trim().slice(0, 80)).filter(Boolean).slice(0, 60) : []
    };
    state.lastSynthesisAt = now;
    saveState();
    if (typeof renderModel === 'function') { try { renderModel(); } catch {} }
    return { ok: true, nodeCount: nodes.length, sourceCount: items.length };
  } catch (e) {
    console.warn('[synthesis] throw:', e);
    return { ok: false, reason: 'throw', error: String((e && e.message) || e) };
  } finally {
    _synthesisRunning = false;
  }
}

// 나 탭 버튼 핸들러 — 실행 + 토스트. 진행 중 재진입 차단.
async function runSynthesisFromButton(opts) {
  opts = opts || {};
  if (_synthesisRunning) { if (typeof showToast === 'function') showToast('통합 중이야 — 잠깐만'); return; }
  // 비용 가드 (Opus 비쌈): 방금 모았으면 30분 쿨다운 — 연타 방지.
  if (state.lastSynthesisAt && !opts.force) {
    const since = Date.now() - new Date(state.lastSynthesisAt).getTime();
    if (since >= 0 && since < 30 * 60 * 1000) {
      if (typeof showToast === 'function') showToast('방금 모았어 — 조금 이따 다시 (변화 쌓이면 더 정확)');
      return;
    }
  }
  const items = _collectSynthesisItems();
  if (items.length < _SYNTH_MIN_ITEMS) {
    if (typeof showToast === 'function') showToast(`항목이 더 쌓이면 통합할 수 있어 (지금 ${items.length}개)`);
    return;
  }
  if (typeof showToast === 'function') showToast('✦ 흩어진 걸 핵심으로 모으는 중... (10~20초)');
  // 버튼 비활성 시각 표시
  try {
    const btn = document.getElementById('synthRunBtn');
    if (btn) { btn.disabled = true; btn.textContent = '모으는 중...'; }
  } catch {}
  const r = await runSynthesis({ manual: true });
  try {
    const btn = document.getElementById('synthRunBtn');
    if (btn) { btn.disabled = false; }
  } catch {}
  if (typeof showToast === 'function') {
    if (r.ok) showToast(`✦ ${r.sourceCount}개 → 핵심 ${r.nodeCount}개로 모았어`);
    else if (r.reason === 'too-few') showToast('항목이 더 쌓이면 통합할 수 있어');
    else if (r.reason === 'no-ai') showToast('로그인하면 통합할 수 있어');
    else if (r.reason === 'empty') showToast('통합할 핵심을 못 찾았어 — 다시 해볼래?');
    else if (r.reason === 'http-fail') showToast(`서버 에러 (${r.status || '?'}) — 잠시 후 다시`);
    else showToast('통합 실패 — 다시 시도해줘');
  }
}

// 나 탭 렌더 — 핵심 노드 섹션 (synthesis 결과 overlay). renderModel 이 호출.
//   coreNodes 있으면 valence 별 그룹 렌더 + 근거(source_names) 추적 + 연결. 없으면 (항목 충분 시) 생성 prompt, 아니면 ''.
function _renderCoreNodesSection() {
  const nodes = Array.isArray(state.coreNodes) ? state.coreNodes : [];
  const meta = state.coreNodesMeta || null;
  let itemCount = 0;
  try { itemCount = (typeof _collectSynthesisItems === 'function') ? _collectSynthesisItems().length : 0; } catch {}
  const _esc = (typeof escapeHtml === 'function') ? escapeHtml : (s) => String(s == null ? '' : s);

  if (!nodes.length) {
    if (itemCount < _SYNTH_MIN_ITEMS) return '';
    return `<div class="model-section"><div class="model-section-title">핵심으로 모으기</div>
      <div style="font-size:11.5px; color:var(--text-soft); line-height:1.7; padding:10px 12px; background:rgba(126,200,227,0.05); border-radius:8px; border-left:2px solid rgba(126,200,227,0.3);">
        지금 ${itemCount}개로 흩어져 있어. 같은 뿌리끼리 묶어서 핵심 몇 개로 모아줄게 — 흩어진 게 어떻게 한 너로 모이는지.
        <button id="synthRunBtn" class="btn-primary" onclick="runSynthesisFromButton()" style="width:100%; margin-top:10px;">✦ 핵심으로 모아보기</button>
      </div></div>`;
  }

  const groups = [
    { label: '🔧 자기조절 도구', nodes: nodes.filter(n => n.valence === 'strength') },
    { label: '🌱 다루어야 할 것', nodes: nodes.filter(n => n.valence === 'growth_area') },
    { label: '🌀 핵심 기제', nodes: nodes.filter(n => n.valence !== 'strength' && n.valence !== 'growth_area') }
  ];
  const _typeBadge = { mechanism: '⚙️', trait: '🌿', value: '✨', tension: '⚡' };
  const nodeCard = (n) => {
    const srcHtml = (n.source_names && n.source_names.length)
      ? `<details class="cf-more"><summary>여기 모인 것 ${n.source_names.length}개</summary><div style="font-size:11px; color:var(--text-dim); line-height:1.7; padding:4px 0;">${n.source_names.map(s => '· ' + _esc(s)).join('<br>')}</div></details>`
      : '';
    // PR5 (2B): 연결 = 한 줄 문장, 노드당 ≤2. 한국어 조사 회피 위해 라벨형.
    const _connLine = (c) => {
      const to = _esc(c.to);
      if (c.type === 'tension') return `⚡ ${to} — 자주 부딪치는`;
      if (c.type === 'facet_of') return `⊃ ${to} — 같은 뿌리`;
      return `→ ${to} — 키우는 쪽`;
    };
    const connHtml = (n.connections && n.connections.length)
      ? `<div style="font-size:11px; color:var(--text-soft); margin-top:6px; line-height:1.6;">${n.connections.slice(0, 2).map(_connLine).join('<br>')}</div>`
      : '';
    return `<div class="model-item" style="margin-bottom:10px;">
      <div class="model-item-name">${_typeBadge[n.type] || '•'} ${_esc(n.name)}</div>
      ${n.mechanism ? `<div class="model-item-desc" style="line-height:1.7;">${_esc(n.mechanism)}</div>` : ''}
      ${n.linkage ? `<div style="font-size:11px; color:var(--text-soft); margin-top:5px; line-height:1.6;">↳ 나타나는 곳: ${_esc(n.linkage)}</div>` : ''}
      ${n.leverage ? `<div style="font-size:11px; color:var(--accent); margin-top:5px; line-height:1.6;">🔑 손잡이: ${_esc(n.leverage)}${n.uses ? ` <span style="color:var(--text-soft);">(${_esc(n.uses)} 활용)</span>` : ''}</div>` : ''}
      ${connHtml}
      ${srcHtml}
    </div>`;
  };

  let html = `<div class="model-section"><div class="model-section-title">핵심 — ${nodes.length}가지로 모은 너</div>`;
  const thread = (meta && meta.centralThread) ? meta.centralThread : '';
  if (thread) {
    html += `<div style="font-size:12.5px; color:var(--text); line-height:1.7; padding:11px 13px; margin-bottom:12px; background:rgba(126,200,227,0.06); border:1px solid rgba(126,200,227,0.22); border-radius:10px;">${_esc(thread)}</div>`;
  }
  groups.forEach(g => {
    if (!g.nodes.length) return;
    html += `<div style="font-size:11.5px; color:var(--text-soft); margin:10px 0 6px;">${g.label}</div>`;
    g.nodes.forEach(n => { html += nodeCard(n); });
  });
  const when = (meta && meta.generatedAt) ? new Date(meta.generatedAt).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' }) : '';
  const regated = (meta && Array.isArray(meta.regatedOut)) ? meta.regatedOut.length : 0;
  html += `<div style="display:flex; justify-content:space-between; align-items:center; margin-top:12px; font-size:10.5px; color:var(--text-dim); gap:8px;">
    <span>${when ? when + ' 종합' : ''}${meta && meta.sourceCount ? ' · ' + meta.sourceCount + '개에서' : ''}${regated ? ' · 노이즈 ' + regated + '개 제외' : ''}</span>
    <button id="synthRunBtn" class="btn-secondary" onclick="runSynthesisFromButton()" style="font-size:10.5px; padding:4px 10px; white-space:nowrap;">↻ 다시 모으기</button>
  </div></div>`;
  return html;
}

// 주기 자동 synthesis (§3 G2: 주1회 + 신규 20개 누적). silent (ADHD noise ↓).
//   ★ 첫 실행은 수동 버튼만 — lastSynthesisAt 없으면 auto X. 품질 검증(사용자가 1회 돌려봄) 전 Opus 낭비 방지.
//   maybeRunChapterCleanup step F 에서 fire-and-forget 호출.
async function maybeRunSynthesisAuto() {
  if (typeof _canAI !== 'function' || !_canAI()) return;
  if (state.preferences && state.preferences.testerMode) return;
  if (!state.lastSynthesisAt) return;  // 첫 실행은 수동만
  const items = _collectSynthesisItems();
  if (items.length < _SYNTH_MIN_ITEMS) return;
  const meta = state.coreNodesMeta || {};
  const weeklyDue = (typeof _shouldRunSchedule === 'function' && typeof _lastWeekly4amCutoff === 'function')
    ? _shouldRunSchedule(state.lastSynthesisAt, _lastWeekly4amCutoff()) : false;
  const newItems = items.length - (typeof meta.sourceCount === 'number' ? meta.sourceCount : 0);
  const accumDue = newItems >= 20;
  if (!weeklyDue && !accumDue) return;
  await runSynthesis({ auto: true });
}
