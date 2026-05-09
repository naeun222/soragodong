// 사용자 명시 2026-05-09 (회전 카드 spec final 6-5): 고동의 운세 source 5 — Horoscope API + Haiku 한국어 변환.
// 회전 빈도 = 매일 (04:00 KST 이후 첫 진입 시 자동 fetch — 사용자 명시 2026-05-09).
// API: horoscope-app-api.vercel.app — 무료, key X, 12 별자리.
// 의존: 03-rotating-card.js (state, helpers, _rcZodiacSkippedThisSession, _rcQuizCutoffKey, _rcSessionMarkConfirmed).

// =============================================================================
// 별자리 mapping (영문 key ↔ 심볼 ↔ 한국어 라벨)
// =============================================================================
const _RC_ZODIACS = [
  { key: 'aries',       symbol: '♈', label: '양자리' },
  { key: 'taurus',      symbol: '♉', label: '황소자리' },
  { key: 'gemini',      symbol: '♊', label: '쌍둥이' },
  { key: 'cancer',      symbol: '♋', label: '게자리' },
  { key: 'leo',         symbol: '♌', label: '사자자리' },
  { key: 'virgo',       symbol: '♍', label: '처녀자리' },
  { key: 'libra',       symbol: '♎', label: '천칭자리' },
  { key: 'scorpio',     symbol: '♏', label: '전갈자리' },
  { key: 'sagittarius', symbol: '♐', label: '사수자리' },
  { key: 'capricorn',   symbol: '♑', label: '염소자리' },
  { key: 'aquarius',    symbol: '♒', label: '물병자리' },
  { key: 'pisces',      symbol: '♓', label: '물고기자리' },
];

function _rcZodiacInfo(key) {
  return _RC_ZODIACS.find(z => z.key === key) || null;
}

// =============================================================================
// onboarding 카드 — 별자리 미설정 시 source 자리에 표시
// =============================================================================
function _rcShouldShowZodiacOnboarding() {
  // 회전 카드 자체 단독 카드 X — 운세 source 자리에 onboarding 카드 표시.
  // main file 의 renderRotatingCard 안에서 이 함수 호출 시 false 반환 (단독 카드 X).
  // 운세 source 자체가 onboarding 카드 카운트 → main file 에서 별도 호출 X.
  return false;
}

function _rcRenderZodiacOnboarding() {
  // (단독 카드 X — _rcSource5Horoscope 가 자체 처리)
  return '';
}

function _rcZodiacOnboardingCard() {
  const chips = _RC_ZODIACS.map(z => `
    <button class="rc-zodiac-chip" type="button" onclick="event.stopPropagation(); setUserZodiac('${z.key}')">${z.symbol} ${escapeHtml(z.label)}</button>
  `).join('');
  return {
    id: 'horoscope',
    available: true,
    contentHash: 'horoscope_zodiac_onboard',
    bodyHtml: `
      <div class="rc-body-zodiac-onboard">
        <div class="rc-body-headline">너의 별자리?</div>
        <div class="rc-zodiac-chips">${chips}</div>
        <button class="rc-zodiac-skip" type="button" onclick="event.stopPropagation(); skipZodiacOnboarding()">건너뛰기</button>
      </div>
    `,
    onTapClick: '',
  };
}

function setUserZodiac(zodiac) {
  if (!_rcZodiacInfo(zodiac)) return;
  if (!state.preferences) state.preferences = {};
  state.preferences.userZodiac = zodiac;
  // 사용자 보고 2026-05-09: 별자리 등록 후 다음 세션에서 운세 안 보임 → saveState(true) 강제 cloud sync.
  if (typeof saveState === 'function') saveState(true);
  if (typeof showToast === 'function') showToast('🌗 별자리 등록');
  // 별자리 onboarding 카드 → 운세 source 로 변경 + 즉시 fetch 시작
  _rcSessionOrder = null;
  if (typeof renderRotatingCard === 'function') renderRotatingCard();
}

// 사용자 명시 2026-05-09: 설정 화면에서 별자리 해제.
function resetUserZodiac() {
  if (state.preferences) state.preferences.userZodiac = null;
  // stashed content 도 reset (다른 별자리 운세 잔존 X)
  const r = _ensureRotatingCardState();
  r.lastHoroscopeFetchDay = null;
  r.lastHoroscopeContent = null;
  r.lastHoroscopeShownDate = null;
  if (typeof saveState === 'function') saveState();
  if (typeof showToast === 'function') showToast('🌗 별자리 해제');
  _rcSessionOrder = null;
  if (typeof renderRotatingCard === 'function') renderRotatingCard();
}

function skipZodiacOnboarding() {
  _rcZodiacSkippedThisSession = true;
  // 그 세션 동안 운세 source 비활성 — sessionOrder 재계산
  _rcSessionOrder = null;
  if (typeof renderRotatingCard === 'function') renderRotatingCard();
}

// =============================================================================
// API fetch — backend proxy (/api/horoscope)
// 사용자 보고 2026-05-09: client 가 horoscope-app-api.vercel.app 직접 호출 시 'Failed to fetch'
// (CORS 의심). cloudflare worker proxy 통해 동일 origin 우회 + KV 6h cache.
// =============================================================================
async function _rcFetchHoroscopeApi(zodiac, opts = {}) {
  const noCache = !!opts.noCache;
  const url = `/api/horoscope?sign=${encodeURIComponent(zodiac)}${noCache ? '&nocache=1' : ''}`;
  let resp;
  try {
    resp = await fetch(url, { method: 'GET' });
  } catch (fetchErr) {
    const errType = fetchErr?.name || 'TypeError';
    const errMsg = fetchErr?.message || 'Failed to fetch';
    throw new Error(`backend proxy fetch reject [${errType}]: ${errMsg}`);
  }
  if (!resp.ok) {
    // backend 가 upstream 실패 detail 동봉 — 사용자에게 노출
    let detail = '';
    try {
      const errJson = await resp.json();
      if (errJson?.error) detail = ` (${errJson.error}${errJson.hint ? ' — ' + errJson.hint : ''})`;
    } catch {}
    throw new Error('horoscope HTTP ' + resp.status + detail);
  }
  let json;
  try {
    json = await resp.json();
  } catch (e) {
    throw new Error('horoscope 응답 JSON 파싱 실패: ' + (e?.message || ''));
  }
  // 응답 형태: { data: { date, horoscope_data }, status, success }
  const text = (json && json.data && (json.data.horoscope_data || json.data.horoscopeData)) || '';
  if (!text) throw new Error('horoscope 빈 응답');
  return text.trim();
}

// =============================================================================
// Haiku 한국어 친구 톤 변환
// =============================================================================
async function _rcCallHoroscopeHaiku(rawEnglish, zodiac) {
  if (typeof callAnthropic !== 'function') throw new Error('callAnthropic 미정의');
  const z = _rcZodiacInfo(zodiac);
  const zLabel = z ? z.label : '';

  // 사용자 명시 2026-05-09 (재정정): 운세 말투로 + 길게 (3-4 문장) + 행운 아이템/색 같이 추출.
  const systemPrompt = `너는 별자리 운세를 한국어로 풀어주는 운세사. 영문 horoscope 와 별자리를 받아서 한국어 운세 톤으로 변환 + 행운의 아이템 / 행운의 색 같이 만들어.

규칙 (절대):
- 운세 말투 — '~할 운입니다', '~한 기운이 흐릅니다', '~을(를) 조심하세요', '~에 좋은 날입니다' 같은 전형 운세 톤.
- 친근하게, 그래도 신비로운 어휘 ('기운', '운세', '징조', '에너지', '흐름', '오라') OK.
- 분석명 / 진단명 X. 평가 X. "힘내", "화이팅" 같은 빈 응원 X.
- 길이 = 3-4 문장 (~150-250자). 옛 horoscope 톤 보존.
- 사용자에게 직접 말하듯 (너 / 네 / 당신 X — '너의', '네' 사용).
- "결" 단어 X (잔잔한 결, 가벼운 결 등 회피).
- 마크다운 / 인용부호 X.

행운의 아이템: 일상에서 가질 수 있는 구체 객체 1개 (예: 텀블러, 만년필, 노란 우산, 가죽 수첩, 라벤더 향초). 추상 X.
행운의 색: 1개 (예: 진청색, 연두색, 와인색, 살구색, 바닐라색).

출력 = JSON 만 (마크다운 X):
{
  "horoscope": "운세 본문 (3-4 문장)",
  "luckyItem": "행운의 아이템",
  "luckyColor": "행운의 색"
}`;

  const userPrompt = `별자리: ${zLabel}

영문 horoscope:
${rawEnglish}

→ 위 영문을 한국어 운세 톤으로 변환 + 행운 아이템 / 색 같이 JSON 으로 출력.`;

  const sycophancy = /힘내|화이팅|괜찮아질|잘하고 있어|대단해/;
  const diagnosis = /\bADHD\b|우울증|우울장애|불안장애|PTSD|강박장애/i;
  const banGyeol = /잔잔한 결|가벼운 결|단단한 결|부드러운 결|결 따라/;

  let attempt = 0;
  while (attempt < 2) {
    const resp = await callAnthropic({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });
    if (!resp.ok) throw new Error('Haiku API ' + resp.status);
    const data = await resp.json();
    let raw = (data.content?.[0]?.text || '').trim();
    if (!raw) throw new Error('빈 응답');
    raw = raw.replace(/^```\w*\s*/, '').replace(/\s*```\s*$/, '').trim();
    // JSON 추출
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      attempt++;
      if (attempt >= 2) throw new Error('JSON 추출 실패');
      continue;
    }
    let parsed;
    try { parsed = JSON.parse(jsonMatch[0]); } catch (e) {
      attempt++;
      if (attempt >= 2) throw new Error('JSON parse 실패: ' + e.message);
      continue;
    }
    const text = (parsed.horoscope || '').trim();
    const luckyItem = (parsed.luckyItem || '').trim();
    const luckyColor = (parsed.luckyColor || '').trim();
    if (!text || text.length < 30) {
      attempt++;
      if (attempt >= 2) throw new Error('운세 본문 너무 짧음');
      continue;
    }
    if (sycophancy.test(text) || diagnosis.test(text) || banGyeol.test(text)) {
      attempt++;
      if (attempt >= 2) throw new Error('tone verify 실패');
      continue;
    }
    return { text, luckyItem, luckyColor };
  }
  throw new Error('attempts exceeded');
}

// =============================================================================
// 사용자 보고 2026-05-09: fetch 실패 시 같은 날 재시도 차단 + 사용자 시각 실패 카드
// 사용자 요청 2026-05-09 (추가): 실패 카드 = 원인 표시 + 다시시도 버튼 (수동 재시도 OK)
// =============================================================================
let _rcHoroscopeFetchFailedDay = null; // 'YYYY-MM-DD' = 그 날 fetch 실패 (다음 4AM cutoff 까지 차단)
let _rcHoroscopeFetchFailedReason = null; // 마지막 실패 이유 (e.message)

async function _rcStartHoroscopeFetch(zodiac, opts = {}) {
  if (_rcHoroscopeFetchInflight) return;
  const todayK = (typeof _rcQuizCutoffKey === 'function') ? _rcQuizCutoffKey() : null;
  // 같은 날 이미 실패 = 재시도 X (다음 cutoff 까지). retryHoroscopeFetch 안에서 명시적 reset 됨.
  if (todayK && _rcHoroscopeFetchFailedDay === todayK) return;
  _rcHoroscopeFetchInflight = true;
  try {
    if (typeof _canAI !== 'function' || !_canAI()) {
      throw new Error('AI 호출 권한 없음 (로그인 필요)');
    }
    const raw = await _rcFetchHoroscopeApi(zodiac, { noCache: !!opts.noCache });
    if (!raw) throw new Error('horoscope API 빈 응답');
    const friendly = await _rcCallHoroscopeHaiku(raw, zodiac);
    if (!friendly || !friendly.text) throw new Error('Haiku 변환 빈 응답');
    const r = _ensureRotatingCardState();
    r.lastHoroscopeFetchDay = todayK;
    r.lastHoroscopeContent = friendly.text;
    // 사용자 명시 2026-05-09: 행운 아이템 / 색 같이 stash. 옛 = lucky null. 신 = { item, color }.
    r.lastHoroscopeLucky = (friendly.luckyItem || friendly.luckyColor)
      ? { item: friendly.luckyItem || '', color: friendly.luckyColor || '' }
      : null;
    if (typeof saveState === 'function') saveState(true);
    // sessionOrder 안 horoscope source 갱신 (로딩 카드 → 실제 운세 카드)
    _rcUpdateHoroscopeInSession();
  } catch (e) {
    const reason = (e && e.message) || '알 수 없는 오류';
    console.warn('[horoscope] fetch 실패:', reason);
    if (todayK) _rcHoroscopeFetchFailedDay = todayK;
    _rcHoroscopeFetchFailedReason = reason;
    // sessionOrder 안 horoscope source = 실패 카드로 교체
    _rcUpdateHoroscopeInSession();
  } finally {
    _rcHoroscopeFetchInflight = false;
  }
}

// 사용자 요청 2026-05-09: 실패 카드의 다시시도 버튼 핸들러.
// failedDay flag 리셋 → 로딩 카드로 교체 → fetch 재시작.
function retryHoroscopeFetch() {
  const z = state.preferences && state.preferences.userZodiac;
  if (!z) return;
  if (_rcHoroscopeFetchInflight) return;
  _rcHoroscopeFetchFailedDay = null;
  _rcHoroscopeFetchFailedReason = null;
  // 즉시 로딩 카드 표시 (sessionOrder 안 source 갱신)
  _rcUpdateHoroscopeInSession();
  _rcStartHoroscopeFetch(z);
}

// 사용자 명시 2026-05-09 (개발자 테스트, 추후 제거): 정상 운세 카드의 ↻ 버튼 — stash + KV cache 둘 다 무시 강제 재fetch.
function forceRefreshHoroscope() {
  const z = state.preferences && state.preferences.userZodiac;
  if (!z) return;
  if (_rcHoroscopeFetchInflight) return;
  _rcHoroscopeFetchFailedDay = null;
  _rcHoroscopeFetchFailedReason = null;
  // 클라 stash 무효화
  const r = _ensureRotatingCardState();
  r.lastHoroscopeFetchDay = null;
  r.lastHoroscopeContent = null;
  r.lastHoroscopeLucky = null;
  r.lastHoroscopeShownDate = null;
  if (typeof saveState === 'function') saveState();
  // 즉시 로딩 카드
  _rcUpdateHoroscopeInSession();
  // backend KV cache 도 우회
  _rcStartHoroscopeFetch(z, { noCache: true });
}

function _rcUpdateHoroscopeInSession() {
  if (!Array.isArray(_rcSessionOrder)) return;
  const idx = _rcSessionOrder.findIndex(s => s && s.id === 'horoscope');
  if (idx < 0) return;
  const newSrc = _rcSource5Horoscope();
  if (newSrc) _rcSessionOrder[idx] = newSrc;
  const container = document.getElementById('rotatingCardContainer');
  if (container && typeof _rcRenderShell === 'function') {
    container.innerHTML = _rcRenderShell(_rcSessionOrder, _rcSessionIndex);
  }
  if (typeof _rcEqualizeHeights === 'function') _rcEqualizeHeights();
}

function _rcRenderHoroscopeFailCard(zodiac) {
  const z = _rcZodiacInfo(zodiac);
  const zLabel = z ? `${z.symbol} ${escapeHtml(z.label)}` : '';
  const reason = _rcHoroscopeFetchFailedReason || '알 수 없는 오류';
  return {
    id: 'horoscope',
    available: true,
    contentHash: 'horoscope_fail_' + (typeof _rcQuizCutoffKey === 'function' ? _rcQuizCutoffKey() : ''),
    bodyHtml: `
      <div class="rc-body-horoscope">
        <div class="rc-body-headline">고동의 운세</div>
        ${zLabel ? `<div class="rc-horoscope-zodiac">${zLabel}</div>` : ''}
        <div class="rc-horoscope-text" style="opacity:0.65;">별자리 못 봤어 ✦</div>
        <div class="rc-horoscope-fail-reason">${escapeHtml(reason)}</div>
        <button class="rc-horoscope-retry" type="button" onclick="event.stopPropagation(); retryHoroscopeFetch()">다시 시도</button>
      </div>
    `,
    onTapClick: '',
    _isHoroscopeFail: true,
  };
}

// =============================================================================
// Source 5 — 고동의 운세 카드 (stash 견고화)
// =============================================================================
function _rcSource5Horoscope() {
  const r = _ensureRotatingCardState();
  const z = state.preferences && state.preferences.userZodiac;

  // 별자리 미설정
  if (!z) {
    if (_rcZodiacSkippedThisSession) return { id: 'horoscope', available: false };
    return _rcZodiacOnboardingCard();
  }

  const todayK = _rcQuizCutoffKey();

  // 오늘 stash 있으면 사용 (재진입 시 손실 X — saveState(true) 로 즉시 cloud sync 됨)
  if (r.lastHoroscopeFetchDay === todayK && r.lastHoroscopeContent) {
    return _rcRenderHoroscopeCard(z, r.lastHoroscopeContent, r.lastHoroscopeLucky);
  }

  // 사용자 보고 2026-05-09: 같은 날 이미 fetch 실패 = 실패 카드 (재시도 X 비용 절감)
  if (_rcHoroscopeFetchFailedDay === todayK) {
    return _rcRenderHoroscopeFailCard(z);
  }

  // 사용자 보고 2026-05-09: 별자리 선택 후 fetch 진행 중 source 사라짐 → 로딩 카드 표시.
  // fetch 끝나면 _rcUpdateHoroscopeInSession 안에서 sessionOrder 안 horoscope source 갱신 (실제 운세 또는 실패 카드로 교체).
  _rcStartHoroscopeFetch(z);
  return _rcRenderHoroscopeLoadingCard(z);
}

function _rcRenderHoroscopeLoadingCard(zodiac) {
  const z = _rcZodiacInfo(zodiac);
  const zLabel = z ? `${z.symbol} ${escapeHtml(z.label)}` : '';
  return {
    id: 'horoscope',
    available: true,
    contentHash: 'horoscope_loading',
    bodyHtml: `
      <div class="rc-body-horoscope">
        <div class="rc-body-headline">고동의 운세</div>
        ${zLabel ? `<div class="rc-horoscope-zodiac">${zLabel}</div>` : ''}
        <div class="rc-horoscope-text" style="opacity:0.65;">고동이 별자리 보러 가는 중... ✦</div>
      </div>
    `,
    onTapClick: '',
    _isHoroscopeLoading: true,
  };
}

function _rcRenderHoroscopeCard(zodiac, content, lucky) {
  const z = _rcZodiacInfo(zodiac);
  const zLabel = z ? `${z.symbol} ${z.label}` : '';
  // 사용자 명시 2026-05-09 (재정정): 카드 본문 truncate (큐레이션 size 일관) + 클릭 시 모달 (전체 운세 + 행운).
  // 미니 리뷰 패턴 동일.
  const trim = content.length > 80 ? content.slice(0, 80) + '…' : content;
  // 사용자 명시 2026-05-09: 행운 아이템 + 색 카드에 표시 (있을 때만). lucky 형식: { item, color }.
  let luckyLine = '';
  if (lucky && (lucky.item || lucky.color)) {
    const parts = [];
    if (lucky.item) parts.push(escapeHtml(lucky.item));
    if (lucky.color) parts.push(escapeHtml(lucky.color));
    luckyLine = `<div class="rc-horoscope-lucky">🍀 ${parts.join(' · ')}</div>`;
  }
  // 사용자 명시 2026-05-09 (개발자 테스트, 추후 제거): ↻ 강제 재fetch 버튼 (cache 무시).
  const refreshBtn = `<button class="rc-horoscope-refresh-btn" type="button" onclick="event.stopPropagation(); forceRefreshHoroscope()" title="강제 재시도 (개발자)" aria-label="다시">↻</button>`;
  const bodyHtml = `
    <div class="rc-body-horoscope">
      ${refreshBtn}
      <div class="rc-body-headline">고동의 운세</div>
      ${zLabel ? `<div class="rc-horoscope-zodiac">${escapeHtml(zLabel)}</div>` : ''}
      <div class="rc-horoscope-text">${escapeHtml(trim)}</div>
      ${luckyLine}
      ${content.length > 80 ? `<div class="rc-body-mini-cta">탭 → 전체 운세 ✦</div>` : ''}
    </div>
  `;
  // 카드 1번 봤음 mark — 컨펌 처리
  const r = _ensureRotatingCardState();
  const todayK = _rcQuizCutoffKey();
  if (r.lastHoroscopeShownDate !== todayK) {
    r.lastHoroscopeShownDate = todayK;
    if (typeof saveState === 'function') saveState();
  }
  return {
    id: 'horoscope',
    available: true,
    contentHash: 'horoscope_' + todayK,
    bodyHtml,
    onTapClick: `openHoroscopeModal()`,
  };
}

// 사용자 명시 2026-05-09: 운세 전체 보기 모달 — 미니 리뷰 모달 패턴 동일.
function openHoroscopeModal() {
  const r = _ensureRotatingCardState();
  const z = state.preferences && state.preferences.userZodiac;
  if (!z || !r.lastHoroscopeContent) return;
  const existing = document.getElementById('rcHoroscopeModal');
  if (existing) return;

  const zInfo = _rcZodiacInfo(z);
  const zLabel = zInfo ? `${zInfo.symbol} ${zInfo.label}` : '';
  const lucky = r.lastHoroscopeLucky;
  let luckyHtml = '';
  if (lucky && (lucky.item || lucky.color)) {
    const lines = [];
    if (lucky.item) lines.push(`<div class="rc-horoscope-modal-lucky-row"><span class="rc-horoscope-modal-lucky-label">행운의 아이템</span><span class="rc-horoscope-modal-lucky-value">${escapeHtml(lucky.item)}</span></div>`);
    if (lucky.color) lines.push(`<div class="rc-horoscope-modal-lucky-row"><span class="rc-horoscope-modal-lucky-label">행운의 색</span><span class="rc-horoscope-modal-lucky-value">${escapeHtml(lucky.color)}</span></div>`);
    luckyHtml = `<div class="rc-horoscope-modal-lucky">${lines.join('')}</div>`;
  }

  const overlay = document.createElement('div');
  overlay.id = 'rcHoroscopeModal';
  overlay.className = 'rc-mini-review-overlay';
  overlay.innerHTML = `
    <div class="rc-mini-review-card">
      <div class="rc-mini-review-header">
        <div class="rc-mini-review-label">${zLabel} · 오늘의 운세</div>
        <button class="rc-mini-review-close" type="button" onclick="closeHoroscopeModal()" aria-label="닫기">×</button>
      </div>
      <div class="rc-mini-review-body">
        <div class="rc-horoscope-modal-text">${escapeHtml(r.lastHoroscopeContent)}</div>
        ${luckyHtml}
      </div>
    </div>
  `;
  overlay.onclick = (e) => { if (e.target === overlay) closeHoroscopeModal(); };
  document.body.appendChild(overlay);
  setTimeout(() => overlay.classList.add('show'), 30);
}

function closeHoroscopeModal() {
  const overlay = document.getElementById('rcHoroscopeModal');
  if (!overlay) return;
  overlay.classList.remove('show');
  setTimeout(() => { try { overlay.remove(); } catch(_) {} }, 180);
}
