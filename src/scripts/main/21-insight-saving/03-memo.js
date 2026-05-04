// V4-1h: ✎ 메모 — 자유 텍스트 + AI 해시태그 자동 생성. 컨텍스트 X (대화 인용 X).
// V4 비전 7.6: archive 객체 { type:'memo', userMemo, tags[], date, savedAt, source:'메모' }
async function addMemoArchive() {
  // V4-fix v3 (사용자 요청): 테스터 모드 → 예시 메모 자동 채움
  const isTester = !!(state.preferences && state.preferences.testerMode);
  const memoExamples = [
    '새벽 작업이 가장 잘 돼. 이 시간이 네 골든.',
    '거절 = 약함 X 강함. 부채감은 일시.',
    '환경이 의지보다 강함. 도구 셋업 한 번이 의지 매일보다 효과 큼.',
    '한강 → 글쓰기 흐름 작동. 몸 풀림 + 인지 시작 패턴.',
    '잠 6시간 미만이면 큰 결정 다음날로 미루기.'
  ];
  const seed = (Date.now() % memoExamples.length);
  const userMemo = await showInputModal({
    title: '✎ 메모',
    message: '깨달음 한 줄. 자유롭게 — 짧아도 OK.',
    placeholder: '예: 새벽엔 결정 미루기 / 카페가 답이다',
    defaultValue: isTester ? memoExamples[seed] : '',
    multiline: true,
    maxLength: 400,
    okLabel: '저장 ✦'
  });
  if (!userMemo || !userMemo.trim()) return;
  const trimmed = userMemo.trim();

  // AI 해시태그 자동 생성 (3-5개, 짧은 키워드)
  let tags = [];
  if (_canAI()) {
    try {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: _anthropicHeaders(),
        body: JSON.stringify({
          _endpoint: 'memo',
          model: 'claude-haiku-4-5',
          max_tokens: 100,
          messages: [{
            role: 'user',
            content: `메모: "${trimmed}"

이 메모의 핵심을 짧은 해시태그 3-5개로 뽑아.
각 태그 2-6자 한국어 명사형. 예: 결정, 환경, ADHD, 새벽, 회피, 자기효능감.

[출력 — JSON만]
{ "tags": ["태그1", "태그2", "태그3"] }

[금지]
- # 기호 X (태그 텍스트만)
- 마크다운, 코드블록 X
- 영어 (단 ADHD/CBT 등 약어 OK)
- 6자 초과 태그 X
- 일반 동사·형용사 (행동, 좋다 등) X
- 5개 초과 X

JSON만 출력.`
          }]
        })
      });
      const data = await resp.json();
      let raw = data.content[0].text.trim();
      raw = raw.replace(/^```\w*\s*/, '').replace(/\s*```\s*$/, '').trim();
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) {
        const parsed = JSON.parse(m[0]);
        if (Array.isArray(parsed.tags)) {
          tags = parsed.tags
            .map(t => String(t).replace(/^#/, '').trim())
            .filter(t => t && t.length <= 8)
            .slice(0, 5);
        }
      }
    } catch (e) {
      console.warn('memo tag AI failed:', e);
    }
  }

  const _dayKey = todayKey();
  const date = new Date(_dayKey + 'T00:00:00').toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
  state.archive.unshift({
    type: 'memo',
    userMemo: trimmed,
    headline: '',
    body: trimmed.slice(0, 80),
    insight: trimmed,        // 검색·legacy 호환
    tags,
    date,
    source: '메모',
    savedAt: new Date().toISOString()
  });
  saveState();
  if (typeof renderArchive === 'function') renderArchive();
  showToast(tags.length ? `메모 저장됨 ✎  ${tags.map(t => '#' + t).join(' ')}` : '메모 저장됨 ✎');
}

