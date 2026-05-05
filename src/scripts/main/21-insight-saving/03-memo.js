// V4-1h: ✎ 메모 — 자유 텍스트. 사용자 명시 2026-05-06: AI 호출 X / 분석·추출 input X / 순수 메모.
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
    message: '깨달음 한 줄. 자유롭게 — 짧아도 OK.\n(AI 가 읽지 않음. 순수 메모)',
    placeholder: '예: 새벽엔 결정 미루기 / 카페가 답이다',
    defaultValue: isTester ? memoExamples[seed] : '',
    multiline: true,
    maxLength: 400,
    okLabel: '저장 ✦'
  });
  if (!userMemo || !userMemo.trim()) return;
  const trimmed = userMemo.trim();

  // 사용자 명시 2026-05-06: AI 해시태그 자동 생성 제거 — 순수 메모 기능 (API 호출 X).
  const tags = [];

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
    savedAt: new Date().toISOString(),
    _excludeFromAI: true     // 사용자 명시 2026-05-06: 분석/추출 input 제외 마커
  });
  saveState();
  if (typeof renderArchive === 'function') renderArchive();
  showToast('메모 저장됨 ✎');
}
