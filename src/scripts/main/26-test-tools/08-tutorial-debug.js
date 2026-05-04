// 사용자 요청 2026-04-28: 특정 step부터 튜토리얼 시작 (디버그 편의)
// 사용자 요청 2026-04-28: 디버그 — 하단 nav padding-bottom 슬라이더 (실시간 조절)
function showNavPaddingSlider() {
  const existing = document.getElementById('navPaddingDebug');
  if (existing) { existing.remove(); return; }
  const nav = document.querySelector('.bottom-nav');
  const currentComputed = nav ? parseInt(window.getComputedStyle(nav).paddingBottom) : 26;
  const panel = document.createElement('div');
  panel.id = 'navPaddingDebug';
  panel.style.cssText = 'position:fixed; top:80px; right:12px; z-index:99999; background:rgba(15,14,23,0.95); color:white; padding:14px 16px; border-radius:14px; font-size:12px; font-family:monospace; display:flex; flex-direction:column; gap:10px; box-shadow:0 4px 18px rgba(0,0,0,0.5); border:1px solid var(--accent); min-width:240px;';
  panel.innerHTML = '<div style="display:flex; justify-content:space-between; align-items:center; gap:12px;"><span>nav padding-bottom: <b id="navPadVal">' + currentComputed + '</b>px</span><button onclick="document.getElementById(\'navPaddingDebug\').remove()" style="background:none; border:none; color:white; cursor:pointer; font-size:18px; line-height:1;">×</button></div><input type="range" id="navPadSlider" min="0" max="60" value="' + currentComputed + '" style="width:100%; accent-color:var(--accent);"><div style="display:flex; justify-content:space-between; font-size:10px; opacity:0.6;"><span>0</span><span>30</span><span>60</span></div><div style="font-size:10px; color:rgba(255,255,255,0.55); line-height:1.5;">실시간으로 적용됨. 만족하는 값 알려주면 코드에 적용할게요.</div>';
  document.body.appendChild(panel);
  const slider = document.getElementById('navPadSlider');
  const valEl = document.getElementById('navPadVal');
  slider.addEventListener('input', function(e) {
    const v = e.target.value;
    valEl.textContent = v;
    if (nav) nav.style.paddingBottom = v + 'px';
  });
  showToast('📏 슬라이더로 조절 중. ×로 닫기.');
}

