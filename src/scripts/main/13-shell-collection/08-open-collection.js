function openShellCollection() {
  const modal = document.getElementById('shellModal');
  _beachTab = 'all';
  document.querySelectorAll('.beach-tab').forEach(t => t.classList.toggle('active', t.dataset.beachTab === 'all'));
  renderBeach();
  modal.classList.add('active');
  // V4 (v8 묶음 18): 모래사장 첫 진입 inline tip
  if (typeof _showInlineTip === 'function') _showInlineTip('firstShell');
}

function switchBeachTab(tab) {
  _beachTab = tab;
  document.querySelectorAll('.beach-tab').forEach(t => t.classList.toggle('active', t.dataset.beachTab === tab));
  renderBeach();
}

