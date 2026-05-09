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
  if (typeof saveState === 'function') saveState();
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
// API fetch — horoscope-app-api.vercel.app
// =============================================================================
async function _rcFetchHoroscopeApi(zodiac) {
  // sign 파라미터 = 영문 zodiac key
  const url = `https://horoscope-app-api.vercel.app/api/v1/get-horoscope/daily?sign=${encodeURIComponent(zodiac)}&day=TODAY`;
  const resp = await fetch(url, { method: 'GET' });
  if (!resp.ok) throw new Error('horoscope API ' + resp.status);
  const json = await resp.json();
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

  const systemPrompt = `너는 사용자의 친구. 영문 horoscope 한 단락을 받아서 한국어 친구 카톡 톤으로 변환해줘.

규칙 (절대):
- 친구 카톡 톤. 분석 보고서 X.
- "힘내", "화이팅", "괜찮아질" 같은 빈 응원 절대 X.
- 평가성 칭찬 ("잘하고 있어", "대단해") X.
- 분석명 / 진단명 X.
- 살짝 신비로운 어휘 OK (운세 특성).
- 한 단락만 (3-4 문장).
- "결" 단어 X (잔잔한 결, 가벼운 결 등 회피).
- 사용자에게 직접 말하듯 (너 / 네).
- 마크다운 / 인용부호 X.`;

  const userPrompt = `별자리: ${zLabel}

영문 horoscope:
${rawEnglish}

→ 위 영문을 한국어 친구 카톡 톤으로 변환. 3-4 문장. 단락 본문만.`;

  const sycophancy = /힘내|화이팅|괜찮아질|잘하고 있어|대단해/;
  const diagnosis = /\bADHD\b|우울증|우울장애|불안장애|PTSD|강박장애/i;
  const banGyeol = /잔잔한 결|가벼운 결|단단한 결|부드러운 결|결 따라/;

  let attempt = 0;
  while (attempt < 2) {
    const resp = await callAnthropic({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 220,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });
    if (!resp.ok) throw new Error('Haiku API ' + resp.status);
    const data = await resp.json();
    const text = (data.content?.[0]?.text || '').trim();
    if (!text) throw new Error('빈 응답');
    if (sycophancy.test(text) || diagnosis.test(text) || banGyeol.test(text)) {
      attempt++;
      if (attempt >= 2) throw new Error('tone verify 실패');
      continue;
    }
    return text;
  }
  throw new Error('attempts exceeded');
}

// =============================================================================
// 백그라운드 fetch — stash 후 renderRotatingCard 재호출
// =============================================================================
async function _rcStartHoroscopeFetch(zodiac) {
  if (_rcHoroscopeFetchInflight) return;
  _rcHoroscopeFetchInflight = true;
  try {
    if (typeof _canAI !== 'function' || !_canAI()) return;
    const raw = await _rcFetchHoroscopeApi(zodiac);
    if (!raw) return;
    const friendly = await _rcCallHoroscopeHaiku(raw, zodiac);
    if (!friendly) return;
    const r = _ensureRotatingCardState();
    r.lastHoroscopeFetchDay = _rcQuizCutoffKey();
    r.lastHoroscopeContent = friendly;
    r.lastHoroscopeLucky = null; // API 가 행운 정보 안 주면 null
    if (typeof saveState === 'function') saveState(true);
    // 같은 세션 안 운세 카드 위치 update — sessionOrder 안 horoscope source 만 갱신
    if (Array.isArray(_rcSessionOrder)) {
      const idx = _rcSessionOrder.findIndex(s => s && s.id === 'horoscope');
      if (idx >= 0) {
        const newSrc = _rcSource5Horoscope();
        if (newSrc) _rcSessionOrder[idx] = newSrc;
        const container = document.getElementById('rotatingCardContainer');
        if (container && typeof _rcRenderShell === 'function') {
          container.innerHTML = _rcRenderShell(_rcSessionOrder, _rcSessionIndex);
        }
        return;
      }
    }
    if (typeof renderRotatingCard === 'function') renderRotatingCard();
  } catch (e) {
    console.warn('[horoscope]', e);
    // silent — source 비활성 (다음 진입 때 다시 시도)
  } finally {
    _rcHoroscopeFetchInflight = false;
  }
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

  // stash 없음 → 백그라운드 fetch + 이번 render 는 비활성
  _rcStartHoroscopeFetch(z);
  return { id: 'horoscope', available: false };
}

function _rcRenderHoroscopeCard(zodiac, content, lucky) {
  const z = _rcZodiacInfo(zodiac);
  const zLabel = z ? `${z.symbol} ${z.label}` : '';
  const luckyLine = lucky ? `<div class="rc-horoscope-lucky">행운: ${escapeHtml(lucky)}</div>` : '';
  const bodyHtml = `
    <div class="rc-body-horoscope">
      <div class="rc-body-headline">고동의 운세</div>
      ${zLabel ? `<div class="rc-horoscope-zodiac">${escapeHtml(zLabel)}</div>` : ''}
      <div class="rc-horoscope-text">${escapeHtml(content)}</div>
      ${luckyLine}
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
    onTapClick: '',
  };
}
