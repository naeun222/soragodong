function _initDnaPearlHelixV20(scope, groupId, shells, strands, speed) {
  const PEARL_CX = 110, PEARL_CY = 110;
  const HELIX_RADIUS = 32, HELIX_TOP = -52, HELIX_BOTTOM = 52;
  const group = scope.querySelector('#' + groupId);
  if (!group || !Array.isArray(shells) || shells.length === 0) return null;
  const ns = 'http://www.w3.org/2000/svg';
  const elements = shells.map((emoji) => {
    const text = document.createElementNS(ns, 'text');
    text.setAttribute('class', 'dpv20-helix-text');
    text.textContent = emoji;
    group.appendChild(text);
    return text;
  });
  const n = shells.length;
  let rafId = null;
  function update(timestamp) {
    const t = timestamp * speed;
    elements.forEach((el, i) => {
      let phase, yPos;
      if (strands === 1) {
        const yT = (i + 0.5) / n;
        yPos = HELIX_TOP + yT * (HELIX_BOTTOM - HELIX_TOP);
        phase = t + yT * Math.PI * 2.5;
      } else {
        const half = Math.ceil(n / 2);
        const isStrand1 = i < half;
        const j = isStrand1 ? i : (i - half);
        const m = isStrand1 ? half : (n - half);
        const yT = (j + 0.5) / m;
        yPos = HELIX_TOP + yT * (HELIX_BOTTOM - HELIX_TOP);
        const strandPhase = isStrand1 ? 0 : Math.PI;
        phase = t + strandPhase + yT * Math.PI * 2.5;
      }
      const x = HELIX_RADIUS * Math.cos(phase);
      const z = Math.sin(phase);
      const screenX = PEARL_CX + x;
      const screenY = PEARL_CY + yPos;
      const depthScale = 0.85 + z * 0.22;
      const fontSize = 20 * depthScale;
      const tNorm = (z + 1) * 0.5;
      const depthOpacity = 0.7 + tNorm * 0.3;
      const glowAlpha = 0.5 + Math.max(0, z) * 0.4;
      const glowBlur = 3 + Math.max(0, z) * 2;
      el.setAttribute('x', screenX);
      el.setAttribute('y', screenY);
      el.setAttribute('font-size', fontSize);
      el.setAttribute('opacity', depthOpacity.toFixed(3));
      el.style.filter = `drop-shadow(0 0 ${glowBlur.toFixed(1)}px rgba(255,255,240,${glowAlpha.toFixed(2)}))`;
    });
    rafId = requestAnimationFrame(update);
  }
  rafId = requestAnimationFrame(update);
  return rafId;
}

// V3.13.x: 만료된 부름 다시 받기 — 오늘 pending으로 복원
