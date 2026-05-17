function openShellCollection() {
  const modal = document.getElementById('shellModal');
  _beachTab = 'all';
  document.querySelectorAll('.beach-tab').forEach(t => t.classList.toggle('active', t.dataset.beachTab === 'all'));
  renderBeach();
  modal.classList.add('active');
  // V4 (사용자 명시 2026-05-17): 모래사장 첫 진입 → simple tuto modal (옛 inline tip 토스트 교체, 강조 ↑).
  if (typeof _showSimpleTutoModal === 'function') {
    _showSimpleTutoModal({
      key: 'firstShell',
      pages: [{
        html: `<div style="font-size:18px; font-weight:600; margin-bottom:10px;">🏖 모래사장</div>이곳은 모래사장입니다.<br>소라들을 어떻게 모으는지 궁금하다면,<br>대화탭에서 <b>'더 알아보기'</b> → <b>'해볼게'</b>를 눌러보세요!`
      }]
    });
  }
}

function switchBeachTab(tab) {
  _beachTab = tab;
  document.querySelectorAll('.beach-tab').forEach(t => t.classList.toggle('active', t.dataset.beachTab === tab));
  renderBeach();
}

