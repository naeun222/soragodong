// 사용자 명시 2026-05-09 ultrathink: Quiz 카드 의문문 polish — Haiku 로 lazy 다듬기.
// extract-insight 프롬프트에서 quiz_question 필드 요구 제거 (이전 옛 형식으로 되돌림).
// 대신 Quiz 카드 5개 pick 직후 background 로 quiz_question 없는 항목들 batch Haiku 호출.
// 진행 중엔 polishing 로딩 카드, 완료되면 stash + sessionOrder 갱신.
//
// 의존: 03a-rotating-quiz.js (_rcSessionOrder, _rcRenderShell, _rcEqualizeHeights, _rcSource4Quiz).

let _rcQuizPolishInflight = false;

// =============================================================================
// Haiku batch polish — 항목 N개 → 의문문 N줄
// =============================================================================
async function polishQuizQuestions(items) {
  if (!_canAI()) return [];
  if (!Array.isArray(items) || items.length === 0) return [];
  const list = items.map((it, i) => {
    const name = (it && (it.name || it.text)) || '';
    const desc = (it && it.description) || '';
    return `${i + 1}. ${name}${desc ? ' (' + desc.slice(0, 60) + ')' : ''}`;
  }).join('\n');
  try {
    const resp = await callAnthropic({
      _endpoint: 'archive_summary',
      model: 'claude-haiku-4-5',
      max_tokens: 600,
      messages: [{ role: 'user', content: `아래 항목 N개를 사용자에게 묻는 한 줄 의문문으로 변환.

[규칙]
- 각 줄 = "N. 의문문" 형식 (번호 + 점 + 의문문)
- 한 문장, ~30자 이내
- 친구 카톡 톤. 분석 보고서 X.
- 명사형 → 의문문. "저녁 무력감으로 작업 X" → "저녁에 무력감 느끼면 작업 안 되지?"
- "잠 부족 시 큰 결정 후회" → "잠 부족하면 큰 결정 후회하지?"
- 마크다운 / 따옴표 / 이모지 X.
- 항목 수 그대로. 빈 출력 X.

[좋은 예]
입력 1. 야행성
출력 1. 너 야행성이지?

입력 2. 거절 후 부채감 (거절 후 며칠 미안함)
출력 2. 거절하면 미안함 며칠 가지?

입력 3. 마감 직전 폭발력 신뢰 가능
출력 3. 마감 직전엔 폭발력 나오지?

[항목]
${list}

번호 + 점 + 의문문 형식으로만 N줄 출력.` }]
    });
    if (!resp.ok) return [];
    const data = await resp.json();
    let raw = (data?.content?.[0]?.text || '').trim();
    raw = raw.replace(/^```\w*\s*/, '').replace(/\s*```\s*$/, '').trim();
    raw = raw.replace(/\*\*/g, '');
    const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
    const result = [];
    for (let i = 0; i < items.length; i++) {
      // "1." / "1)" / "1 " 패턴 매칭
      const re = new RegExp('^' + (i + 1) + '[\\.\\)\\s]\\s*');
      const m = lines.find(l => re.test(l));
      if (m) {
        const text = m.replace(re, '').replace(/^["']|["']$/g, '').trim();
        result.push(text ? text.slice(0, 80) : null);
      } else {
        result.push(null);
      }
    }
    return result;
  } catch (e) {
    console.warn('[polishQuizQuestions] fail:', e && e.message);
    return [];
  }
}

// =============================================================================
// 항목 lookup → quiz_question stash (객체 array 갱신, string 옛 호환)
// =============================================================================
function _rcStashQuizQuestion(itemId, quizQuestion) {
  if (!itemId || !quizQuestion) return;
  const sep = itemId.indexOf('::');
  if (sep <= 0) return;
  const kind = itemId.slice(0, sep);
  const name = itemId.slice(sep + 2);
  const cf = state.caseFormulation || {};
  const arrays = [
    Array.isArray(cf[kind]) ? cf[kind] : null,
    cf.unverified && Array.isArray(cf.unverified[kind]) ? cf.unverified[kind] : null,
    Array.isArray(state.traits) ? state.traits : null,
    Array.isArray(state.values) ? state.values : null,
    Array.isArray(state.patterns) ? state.patterns : null,
  ].filter(Boolean);
  for (const arr of arrays) {
    for (let i = 0; i < arr.length; i++) {
      const it = arr[i];
      // 옛 string 항목 — 객체로 transmute (lazy migration)
      if (typeof it === 'string') {
        if (it === name) {
          arr[i] = { text: it, quiz_question: quizQuestion };
          return;
        }
        continue;
      }
      // 객체 항목
      if (it && typeof it === 'object' && (it.name === name || it.text === name)) {
        it.quiz_question = quizQuestion;
        return;
      }
    }
  }
}

// =============================================================================
// pick 직후 호출 — quiz_question null 인 항목 batch polish 시작 (background)
// =============================================================================
async function _rcStartQuizPolish(pickedItemIds) {
  if (_rcQuizPolishInflight) return;
  if (!Array.isArray(pickedItemIds) || pickedItemIds.length === 0) return;
  // 각 itemId 의 lookup 결과 중 quiz_question 없는 것만 polish 대상
  const targets = [];
  for (const id of pickedItemIds) {
    const found = _rcQuizFindItem(id);
    if (!found) continue;
    if (found.quiz_question) continue;
    targets.push({ id, name: found.name, description: found.description || '' });
  }
  if (targets.length === 0) return;
  _rcQuizPolishInflight = true;
  try {
    const polished = await polishQuizQuestions(targets);
    let touched = false;
    polished.forEach((q, i) => {
      if (!q) return;
      _rcStashQuizQuestion(targets[i].id, q);
      touched = true;
    });
    if (touched && typeof saveState === 'function') saveState();
    // sessionOrder 안 quiz source 갱신 (polish loading → 정상 카드)
    _rcUpdateQuizInSession();
  } catch (e) {
    console.warn('[quiz polish]', e && e.message);
    // 실패 = 명사형 그대로 노출 (graceful fallback)
    _rcUpdateQuizInSession();
  } finally {
    _rcQuizPolishInflight = false;
  }
}

function _rcUpdateQuizInSession() {
  if (!Array.isArray(_rcSessionOrder)) return;
  const idx = _rcSessionOrder.findIndex(s => s && s.id === 'quiz');
  if (idx < 0) return;
  const newSrc = (typeof _rcSource4Quiz === 'function') ? _rcSource4Quiz() : null;
  if (newSrc) _rcSessionOrder[idx] = newSrc;
  const container = document.getElementById('rotatingCardContainer');
  if (container && typeof _rcRenderShell === 'function') {
    container.innerHTML = _rcRenderShell(_rcSessionOrder, _rcSessionIndex);
  }
  if (typeof _rcEqualizeHeights === 'function') _rcEqualizeHeights();
}

function _rcRenderQuizPolishingCard() {
  return {
    id: 'quiz',
    available: true,
    contentHash: 'quiz_polishing',
    bodyHtml: `
      <div class="rc-body-quiz">
        <div class="rc-body-headline">고동이가 너 얼마나 맞히고 있을까?</div>
        <div class="rc-quiz-polishing">고동이가 질문 다듬는 중... ✦</div>
      </div>
    `,
    onTapClick: '',
    _isQuizPolishing: true,
  };
}
