function _buildDnaPearlSvgV20_OS() {
  return `
    <svg id="pearl-os" viewBox="0 0 220 220" style="overflow: visible;">
      <defs>
        <radialGradient id="halo-near-os" cx="50%" cy="50%" r="50%">
          <stop offset="68%" stop-color="#a8d8a8" stop-opacity="0"/>
          <stop offset="80%" stop-color="#a8d8a8" stop-opacity="0.55"/>
          <stop offset="90%" stop-color="#c8ecd8" stop-opacity="0.32"/>
          <stop offset="100%" stop-color="#fff0d8" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="pearl-base-os" cx="35%" cy="30%" r="65%">
          <stop offset="0%"  stop-color="#fff8e8" stop-opacity="0.18"/>
          <stop offset="50%" stop-color="#fff0d8" stop-opacity="0.10"/>
          <stop offset="100%" stop-color="#f5e8d0" stop-opacity="0.06"/>
        </radialGradient>
        <radialGradient id="sphere-os4" cx="35%" cy="30%" r="65%">
          <stop offset="0%"   stop-color="#f5fff5" stop-opacity="0.45"/>
          <stop offset="22%"  stop-color="#dff5df" stop-opacity="0.20"/>
          <stop offset="38%"  stop-color="#c8ecc8" stop-opacity="0.13"/>
          <stop offset="55%"  stop-color="#bce0bc" stop-opacity="0.09"/>
          <stop offset="72%"  stop-color="#a8d8a8" stop-opacity="0.05"/>
          <stop offset="88%"  stop-color="#88c088" stop-opacity="0.06"/>
          <stop offset="100%" stop-color="#6aa86a" stop-opacity="0.08"/>
        </radialGradient>
        <radialGradient id="iridescent-os" cx="50%" cy="55%" r="45%">
          <stop offset="0%"   stop-color="#ffffff" stop-opacity="0.36"/>
          <stop offset="28%"  stop-color="#e8ffe8" stop-opacity="0.20"/>
          <stop offset="55%"  stop-color="#a8d8a8" stop-opacity="0.10"/>
          <stop offset="78%"  stop-color="#ffd0e0" stop-opacity="0.06"/>
          <stop offset="100%" stop-color="#a8d8a8" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="rainbow-rim-os" cx="50%" cy="50%" r="55%">
          <stop offset="60%" stop-color="#ffd0e8" stop-opacity="0"/>
          <stop offset="78%" stop-color="#ffd0e8" stop-opacity="0.18"/>
          <stop offset="88%" stop-color="#c8e0ff" stop-opacity="0.15"/>
          <stop offset="100%" stop-color="#c8e0ff" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="highlight-os4" cx="35%" cy="28%" r="22%">
          <stop offset="0%"  stop-color="#ffffff" stop-opacity="0.95"/>
          <stop offset="40%" stop-color="#ffffff" stop-opacity="0.3"/>
          <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="highlight2-os" cx="50%" cy="50%" r="50%">
          <stop offset="0%"  stop-color="#ffffff" stop-opacity="0.65"/>
          <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="back-reflect-os" cx="50%" cy="50%" r="50%">
          <stop offset="0%"  stop-color="#e8ffe8" stop-opacity="0.5"/>
          <stop offset="60%" stop-color="#a8d8a8" stop-opacity="0.15"/>
          <stop offset="100%" stop-color="#a8d8a8" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="overlay-os4" cx="35%" cy="30%" r="65%">
          <stop offset="0%"  stop-color="#f5fff5" stop-opacity="0.12"/>
          <stop offset="40%" stop-color="#c8ecc8" stop-opacity="0.03"/>
          <stop offset="100%" stop-color="#a8d8a8" stop-opacity="0"/>
        </radialGradient>
        <filter id="glow-os" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="5" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      <circle class="dpv20-halo" cx="110" cy="110" r="105" fill="url(#halo-near-os)" filter="url(#glow-os)"/>
      <circle cx="110" cy="110" r="76" fill="url(#sphere-os4)"/>
      <circle cx="110" cy="110" r="76" fill="url(#pearl-base-os)"/>
      <circle cx="110" cy="110" r="60" fill="url(#iridescent-os)"/>
      <circle cx="110" cy="110" r="76" fill="url(#rainbow-rim-os)" pointer-events="none"/>
      <circle cx="110" cy="110" r="76" fill="none" stroke="#ffffff" stroke-width="0.4" stroke-opacity="0.4" filter="url(#glow-os)"/>
      <circle cx="110" cy="110" r="76" fill="none" stroke="#a8d8a8" stroke-width="0.3" stroke-opacity="0.35"/>
      <ellipse cx="135" cy="142" rx="14" ry="9" fill="url(#back-reflect-os)" pointer-events="none"/>
      <g id="shells-os"></g>
      <circle cx="110" cy="110" r="76" fill="url(#overlay-os4)" pointer-events="none"/>
      <g class="dpv20-highlight-flow" pointer-events="none">
        <ellipse cx="92" cy="85" rx="22" ry="14" fill="url(#highlight-os4)"/>
        <ellipse cx="86" cy="76" rx="5" ry="2.5" fill="#ffffff" opacity="0.85"/>
        <ellipse cx="138" cy="92" rx="8" ry="4" fill="url(#highlight2-os)"/>
      </g>
      <circle class="dpv20-glint" cx="105" cy="50"  r="1.2" fill="#ffffff" style="animation-delay:0s;"/>
      <circle class="dpv20-glint" cx="155" cy="120" r="1"   fill="#ffffff" style="animation-delay:0.7s;"/>
      <circle class="dpv20-glint" cx="78"  cy="150" r="1.3" fill="#ffffff" style="animation-delay:1.4s;"/>
      <circle class="dpv20-glint" cx="60"  cy="100" r="0.9" fill="#ffffff" style="animation-delay:2.1s;"/>
    </svg>
  `;
}

// pearl_design_spec_2026-05-03 §9-3: 🌳 quick-discovery SVG
function _buildDnaPearlSvgV20_Q() {
  return `
    <svg id="pearl-q" viewBox="0 0 220 220" style="overflow: visible;">
      <defs>
        <radialGradient id="halo-near-q" cx="50%" cy="50%" r="50%">
          <stop offset="68%" stop-color="#ffd870" stop-opacity="0"/>
          <stop offset="80%" stop-color="#ffd870" stop-opacity="0.65"/>
          <stop offset="90%" stop-color="#ffe5b8" stop-opacity="0.36"/>
          <stop offset="100%" stop-color="#fff5e0" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="pearl-base-q" cx="35%" cy="30%" r="65%">
          <stop offset="0%"  stop-color="#fff8e0" stop-opacity="0.20"/>
          <stop offset="50%" stop-color="#fff0c8" stop-opacity="0.12"/>
          <stop offset="100%" stop-color="#f5e0b8" stop-opacity="0.06"/>
        </radialGradient>
        <radialGradient id="sphere-q4" cx="35%" cy="30%" r="65%">
          <stop offset="0%"   stop-color="#fffce8" stop-opacity="0.48"/>
          <stop offset="22%"  stop-color="#fff5d0" stop-opacity="0.22"/>
          <stop offset="38%"  stop-color="#ffe9a0" stop-opacity="0.16"/>
          <stop offset="55%"  stop-color="#ffe088" stop-opacity="0.11"/>
          <stop offset="72%"  stop-color="#ffd870" stop-opacity="0.08"/>
          <stop offset="88%"  stop-color="#d4a838" stop-opacity="0.08"/>
          <stop offset="100%" stop-color="#b8841a" stop-opacity="0.1"/>
        </radialGradient>
        <radialGradient id="iridescent-q" cx="50%" cy="55%" r="45%">
          <stop offset="0%"   stop-color="#ffffff" stop-opacity="0.38"/>
          <stop offset="28%"  stop-color="#fff5b8" stop-opacity="0.22"/>
          <stop offset="55%"  stop-color="#ffd870" stop-opacity="0.12"/>
          <stop offset="78%"  stop-color="#ffc8d8" stop-opacity="0.06"/>
          <stop offset="100%" stop-color="#ffd870" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="rainbow-rim-q" cx="50%" cy="50%" r="55%">
          <stop offset="60%" stop-color="#ffd0a8" stop-opacity="0"/>
          <stop offset="78%" stop-color="#ffd0a8" stop-opacity="0.2"/>
          <stop offset="88%" stop-color="#ffe5d0" stop-opacity="0.18"/>
          <stop offset="100%" stop-color="#ffe5d0" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="highlight-q4" cx="35%" cy="28%" r="22%">
          <stop offset="0%"  stop-color="#ffffff" stop-opacity="0.95"/>
          <stop offset="40%" stop-color="#ffffff" stop-opacity="0.32"/>
          <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="highlight2-q" cx="50%" cy="50%" r="50%">
          <stop offset="0%"  stop-color="#ffffff" stop-opacity="0.7"/>
          <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="back-reflect-q" cx="50%" cy="50%" r="50%">
          <stop offset="0%"  stop-color="#fff5b8" stop-opacity="0.55"/>
          <stop offset="60%" stop-color="#ffd870" stop-opacity="0.18"/>
          <stop offset="100%" stop-color="#ffd870" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="overlay-q4" cx="35%" cy="30%" r="65%">
          <stop offset="0%"  stop-color="#fffce8" stop-opacity="0.14"/>
          <stop offset="40%" stop-color="#fff0a8" stop-opacity="0.04"/>
          <stop offset="100%" stop-color="#ffd870" stop-opacity="0"/>
        </radialGradient>
        <pattern id="texture-q4" x="0" y="0" width="14" height="14" patternUnits="userSpaceOnUse">
          <circle cx="7" cy="7" r="0.6" fill="#ffd870" opacity="0.10"/>
        </pattern>
        <filter id="glow-q" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="5.5" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      <circle class="dpv20-halo" cx="110" cy="110" r="105" fill="url(#halo-near-q)" filter="url(#glow-q)"/>
      <circle cx="110" cy="110" r="76" fill="url(#sphere-q4)"/>
      <circle cx="110" cy="110" r="76" fill="url(#pearl-base-q)"/>
      <circle cx="110" cy="110" r="60" fill="url(#iridescent-q)"/>
      <circle cx="110" cy="110" r="76" fill="url(#rainbow-rim-q)" pointer-events="none"/>
      <circle cx="110" cy="110" r="76" fill="url(#texture-q4)" opacity="0.5"/>
      <circle cx="110" cy="110" r="76" fill="none" stroke="#ffffff" stroke-width="0.4" stroke-opacity="0.4" filter="url(#glow-q)"/>
      <circle cx="110" cy="110" r="76" fill="none" stroke="#d4a020" stroke-width="0.3" stroke-opacity="0.35"/>
      <ellipse cx="135" cy="142" rx="14" ry="9" fill="url(#back-reflect-q)" pointer-events="none"/>
      <g id="shells-q"></g>
      <circle cx="110" cy="110" r="76" fill="url(#overlay-q4)" pointer-events="none"/>
      <g class="dpv20-highlight-flow" pointer-events="none">
        <ellipse cx="92" cy="85" rx="22" ry="14" fill="url(#highlight-q4)"/>
        <ellipse cx="86" cy="76" rx="5" ry="2.5" fill="#ffffff" opacity="0.9"/>
        <ellipse cx="138" cy="92" rx="8" ry="4" fill="url(#highlight2-q)"/>
      </g>
      <circle class="dpv20-glint" cx="105" cy="50"  r="1.3" fill="#ffffff" style="animation-delay:0s;"/>
      <circle class="dpv20-glint" cx="155" cy="120" r="1.1" fill="#ffffff" style="animation-delay:0.6s;"/>
      <circle class="dpv20-glint" cx="78"  cy="150" r="1.4" fill="#ffffff" style="animation-delay:1.2s;"/>
      <circle class="dpv20-glint" cx="60"  cy="100" r="1"   fill="#ffffff" style="animation-delay:1.8s;"/>
      <circle class="dpv20-glint" cx="125" cy="68"  r="1.2" fill="#ffffff" style="animation-delay:2.4s;"/>
    </svg>
  `;
}

// pearl_design_spec_2026-05-03 §9-4: 🧬 evolved SVG (swirl + 2 strand)
function _buildDnaPearlSvgV20_E() {
  return `
    <svg id="pearl-e" viewBox="0 0 220 220" style="overflow: visible;">
      <defs>
        <radialGradient id="halo-near-e" cx="50%" cy="50%" r="50%">
          <stop offset="68%" stop-color="#ffd0c0" stop-opacity="0"/>
          <stop offset="80%" stop-color="#ffd0c0" stop-opacity="0.55"/>
          <stop offset="90%" stop-color="#e8c8e0" stop-opacity="0.35"/>
          <stop offset="100%" stop-color="#fff0e0" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="swirl-e4" x1="20%" y1="15%" x2="80%" y2="85%">
          <stop offset="0%"   stop-color="#ffe5d4" stop-opacity="0.32"/>
          <stop offset="30%"  stop-color="#ffc0a8" stop-opacity="0.22"/>
          <stop offset="55%"  stop-color="#ffd870" stop-opacity="0.18"/>
          <stop offset="80%"  stop-color="#88d0c8" stop-opacity="0.22"/>
          <stop offset="100%" stop-color="#9080c0" stop-opacity="0.24"/>
        </linearGradient>
        <radialGradient id="pearl-base-e" cx="35%" cy="30%" r="65%">
          <stop offset="0%"  stop-color="#fff8e8" stop-opacity="0.18"/>
          <stop offset="50%" stop-color="#fff0d8" stop-opacity="0.10"/>
          <stop offset="100%" stop-color="#f0d8b8" stop-opacity="0.06"/>
        </radialGradient>
        <radialGradient id="sphere-e4" cx="35%" cy="30%" r="65%">
          <stop offset="0%"   stop-color="#fffce8" stop-opacity="0.5"/>
          <stop offset="22%"  stop-color="#fff5e0" stop-opacity="0.22"/>
          <stop offset="42%"  stop-color="#fff0d8" stop-opacity="0.14"/>
          <stop offset="62%"  stop-color="#f5e0c0" stop-opacity="0.08"/>
          <stop offset="82%"  stop-color="#d8b890" stop-opacity="0.06"/>
          <stop offset="100%" stop-color="#8a6510" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="iridescent-e" cx="50%" cy="55%" r="45%">
          <stop offset="0%"   stop-color="#ffffff" stop-opacity="0.38"/>
          <stop offset="22%"  stop-color="#fff5b8" stop-opacity="0.22"/>
          <stop offset="48%"  stop-color="#ffc0a8" stop-opacity="0.14"/>
          <stop offset="72%"  stop-color="#c8c0e8" stop-opacity="0.10"/>
          <stop offset="100%" stop-color="#a89dc8" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="rainbow-rim-e" cx="50%" cy="50%" r="55%">
          <stop offset="60%" stop-color="#ffd0e0" stop-opacity="0"/>
          <stop offset="76%" stop-color="#ffd0e0" stop-opacity="0.22"/>
          <stop offset="86%" stop-color="#c0e0ff" stop-opacity="0.18"/>
          <stop offset="100%" stop-color="#c0e0ff" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="highlight-e4" cx="35%" cy="28%" r="22%">
          <stop offset="0%"  stop-color="#ffffff" stop-opacity="0.95"/>
          <stop offset="40%" stop-color="#ffffff" stop-opacity="0.35"/>
          <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="highlight2-e" cx="50%" cy="50%" r="50%">
          <stop offset="0%"  stop-color="#ffffff" stop-opacity="0.7"/>
          <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="back-reflect-e" cx="50%" cy="50%" r="50%">
          <stop offset="0%"  stop-color="#ffe5d4" stop-opacity="0.5"/>
          <stop offset="60%" stop-color="#a89dc8" stop-opacity="0.18"/>
          <stop offset="100%" stop-color="#a89dc8" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="overlay-e4" cx="35%" cy="30%" r="65%">
          <stop offset="0%"  stop-color="#fffce8" stop-opacity="0.14"/>
          <stop offset="40%" stop-color="#fff0d8" stop-opacity="0.04"/>
          <stop offset="100%" stop-color="#a89dc8" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="rainbow-e4" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"   stop-color="#ff6b6b"/>
          <stop offset="33%"  stop-color="#ffd93d"/>
          <stop offset="66%"  stop-color="#5fcfba"/>
          <stop offset="100%" stop-color="#a89dc8"/>
        </linearGradient>
        <filter id="glow-e" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="6" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      <circle class="dpv20-halo" cx="110" cy="110" r="105" fill="url(#halo-near-e)" filter="url(#glow-e)"/>
      <circle cx="110" cy="110" r="76" fill="url(#swirl-e4)"/>
      <circle cx="110" cy="110" r="76" fill="url(#sphere-e4)"/>
      <circle cx="110" cy="110" r="76" fill="url(#pearl-base-e)"/>
      <circle cx="110" cy="110" r="60" fill="url(#iridescent-e)"/>
      <circle cx="110" cy="110" r="76" fill="url(#rainbow-rim-e)" pointer-events="none"/>
      <circle cx="110" cy="110" r="76" fill="none" stroke="#ffffff" stroke-width="0.4" stroke-opacity="0.4" filter="url(#glow-e)"/>
      <circle cx="110" cy="110" r="76" fill="none" stroke="url(#rainbow-e4)" stroke-width="0.3" stroke-opacity="0.45"/>
      <ellipse cx="135" cy="142" rx="14" ry="9" fill="url(#back-reflect-e)" pointer-events="none"/>
      <g id="shells-e"></g>
      <circle cx="110" cy="110" r="76" fill="url(#overlay-e4)" pointer-events="none"/>
      <g class="dpv20-highlight-flow" pointer-events="none">
        <ellipse cx="92" cy="85" rx="22" ry="14" fill="url(#highlight-e4)"/>
        <ellipse cx="86" cy="76" rx="5" ry="2.5" fill="#ffffff" opacity="0.9"/>
        <ellipse cx="138" cy="92" rx="8" ry="4" fill="url(#highlight2-e)"/>
      </g>
      <circle class="dpv20-glint" cx="105" cy="50"  r="1.4" fill="#ffffff" style="animation-delay:0s;"/>
      <circle class="dpv20-glint" cx="155" cy="120" r="1.2" fill="#ffffff" style="animation-delay:0.5s;"/>
      <circle class="dpv20-glint" cx="78"  cy="150" r="1.5" fill="#ffffff" style="animation-delay:1s;"/>
      <circle class="dpv20-glint" cx="60"  cy="100" r="1.1" fill="#ffffff" style="animation-delay:1.5s;"/>
      <circle class="dpv20-glint" cx="125" cy="68"  r="1.3" fill="#ffffff" style="animation-delay:2s;"/>
    </svg>
  `;
}

function _buildDnaPearlSvgV20(path) {
  if (path === 'evolved')         return _buildDnaPearlSvgV20_E();
  if (path === 'quick-discovery') return _buildDnaPearlSvgV20_Q();
  return _buildDnaPearlSvgV20_OS();
}

function _buildDnaPearlSparklesV20(path) {
  if (path === 'evolved') {
    return [
      `<div class="dpv20-sparkle rainbow sm" style="left: 80%; top: 28%; animation-delay: 0.6s;">✦</div>`,
      `<div class="dpv20-sparkle iridescent md" style="left: 86%; top: 70%; animation-delay: 1.2s;">✦</div>`,
      `<div class="dpv20-sparkle rainbow sm" style="left: 18%; top: 80%; animation-delay: 1.8s;">✦</div>`,
      `<div class="dpv20-sparkle rainbow sm" style="left: 50%; top: 8%;  animation-delay: 2.4s;">✦</div>`
    ].join('');
  }
  if (path === 'quick-discovery') {
    return [
      `<div class="dpv20-sparkle yellow sm"     style="left: 86%; top: 22%; animation-delay: 0.6s;">✦</div>`,
      `<div class="dpv20-sparkle iridescent sm" style="left: 88%; top: 56%; animation-delay: 1.1s;">✦</div>`,
      `<div class="dpv20-sparkle yellow sm"     style="left: 84%; top: 80%; animation-delay: 1.6s;">✦</div>`,
      `<div class="dpv20-sparkle yellow sm"     style="left: 12%; top: 78%; animation-delay: 2.1s;">✦</div>`
    ].join('');
  }
  // one-shot
  return [
    `<div class="dpv20-sparkle green sm"      style="left: 86%; top: 24%; animation-delay: 1s;">✦</div>`,
    `<div class="dpv20-sparkle iridescent sm" style="left: 88%; top: 70%; animation-delay: 1.7s;">✦</div>`,
    `<div class="dpv20-sparkle green sm"      style="left: 22%; top: 82%; animation-delay: 2.3s;">✦</div>`
  ].join('');
}

