function playMissionRewardEffect(shell) {
  if (!shell) return;
  const isLegendary = shell.rarity === 'legendary' || shell.tier === 'legend';
  const overlay = document.createElement('div');
  overlay.className = 'mission-reward-overlay';
  overlay.innerHTML = `
    <div class="mission-reward-shell${isLegendary ? ' legendary' : ''}">${shell.emoji || shell.type || '⭐'}</div>
    <div class="mission-reward-label">${isLegendary ? '✨ 특별한 부름!' : '🐚 새 소라 획득!'}</div>
    <div class="mission-reward-tier">${shell.label || shell.tier || ''}</div>
  `;
  document.body.appendChild(overlay);
  // 입자 burst
  const particles = isLegendary
    ? ['🌈','✨','🦄','🌌','💫','🦋','🌸','🪐','💖','🎀']
    : ['⭐','✨','🌟','💫','🪐','🐚','🌙'];
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2;
  const count = isLegendary ? 16 : 10;
  for (let i = 0; i < count; i++) {
    const p = document.createElement('div');
    p.className = 'mission-reward-particle';
    p.textContent = particles[i % particles.length];
    p.style.left = cx + 'px';
    p.style.top = cy + 'px';
    const angle = (i / count) * Math.PI * 2 + Math.random() * 0.3;
    const dist = 160 + Math.random() * 80;
    const ex = Math.cos(angle) * dist;
    const ey = Math.sin(angle) * dist - 30;
    p.style.setProperty('--mr-end', `translate(${ex}px, ${ey}px)`);
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 2100);
  }
  setTimeout(() => overlay.remove(), 2700);
}

// 사용자 요청 2026-04-28: DNA 진주 3종 슬라이더 모달 (튜토리얼)
let _dnaPearlTypesIdx = 0;
