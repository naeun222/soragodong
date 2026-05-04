async function exportReviewShareCard(type) {
  const screen = document.getElementById('screen-review');
  if (!screen || !screen.dataset.reviewData) { alert('리뷰 데이터 없음'); return; }
  const r = JSON.parse(screen.dataset.reviewData);

  // 폰트 (Gowun Batang) 로드 — canvas 에서 system font fallback 안 되도록 미리 ready
  try { if (document.fonts && document.fonts.ready) await document.fonts.ready; } catch {}
  showToast('🎨 카드 그리는 중...');

  // 로고 (godongicon.png) 미리 로드 — emoji 대신 사용
  let logoImg = null;
  try {
    logoImg = new Image();
    logoImg.crossOrigin = 'anonymous';
    logoImg.src = '/godongicon.png';
    await logoImg.decode();
  } catch (e) {
    console.warn('[shareCard] godongicon 로드 실패:', e);
    logoImg = null;
  }

  const W = 1080, H = 1920;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');

  // ── 1. Background — 깊은 다크 그라데이션 (3 stop) ──
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#0f0e17');
  bg.addColorStop(0.55, '#1a1826');
  bg.addColorStop(1, '#221f33');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // ── 2. Hero halo — center radial gold ──
  const halo = ctx.createRadialGradient(W * 0.5, 700, 0, W * 0.5, 700, 760);
  halo.addColorStop(0, 'rgba(201,169,110,0.22)');
  halo.addColorStop(0.55, 'rgba(201,169,110,0.06)');
  halo.addColorStop(1, 'rgba(201,169,110,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, W, H);

  // ── 3. 로고 watermark — 거대 옅은 원 (background depth) ──
  if (logoImg) {
    ctx.save();
    ctx.globalAlpha = 0.055;
    const wmSize = 760;
    ctx.drawImage(logoImg, (W - wmSize) / 2, 720, wmSize, wmSize);
    ctx.restore();
  }

  // ── 4. ✨ 작은 점 산재 (decoration, opacity 0.28) ──
  ctx.save();
  ctx.globalAlpha = 0.28;
  ctx.font = '36px serif';
  ctx.fillStyle = '#e8c99a';
  ctx.textAlign = 'center';
  const sparkles = [
    [180, 220], [920, 280], [240, 1640], [880, 1760],
    [120, 880], [960, 1100], [780, 200], [200, 1380]
  ];
  sparkles.forEach(([x, y]) => ctx.fillText('✦', x, y));
  ctx.restore();

  ctx.textAlign = 'center';

  // ── 5. Top 라벨 — 주간 진주 / 월간 진주 + 날짜 ──
  const dateStr = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }).replace(/년 |월 |일/g, m => ({ '년 ':'.', '월 ':'.', '일':'' }[m]));
  ctx.font = '500 30px "Noto Sans KR", system-ui, sans-serif';
  ctx.fillStyle = '#7b7a8e';
  ctx.fillText((type === 'weekly' ? '주간 진주' : '월간 진주') + '  ·  ' + dateStr, W / 2, 220);

  // ── 6. 로고 작게 (hero word 위) ──
  if (logoImg) {
    const heroSize = 130;
    ctx.drawImage(logoImg, (W - heroSize) / 2, 290, heroSize, heroSize);
  }

  // ── 7. momentum / 정체성 라벨 ──
  ctx.font = '600 26px "Noto Sans KR", system-ui';
  ctx.fillStyle = '#9d9aad';
  ctx.letterSpacing = '0.18em';
  const labelText = type === 'weekly' ? '이번 주 momentum' : '이번 달의 너';
  ctx.fillText(labelText, W / 2, 460);

  // ── 8. 한 단어 hero (거대 typography — Wrapped 2025 학습: 강한 hero 필요) ──
  const oneWord = r.one_word_weekly || r.one_word || '';
  if (oneWord) {
    ctx.font = '700 200px "Gowun Batang", "Nanum Myeongjo", serif';
    ctx.fillStyle = type === 'weekly' ? '#9ed4e8' : '#c9a96e';
    ctx.fillText(oneWord, W / 2, 700);

    // 한 단어 underline accent
    const tw = ctx.measureText(oneWord).width;
    const ux = W / 2 - tw / 2;
    ctx.fillStyle = type === 'weekly' ? 'rgba(126,200,227,0.35)' : 'rgba(201,169,110,0.35)';
    ctx.fillRect(ux, 730, tw, 4);
  }

  // ── 9. Best quote (60px serif italic, hero 다음 anchor) ──
  // quotes 중 가장 짧고 의미 강한 것 하나 — 첫 번째 사용
  const quotes = Array.isArray(r.quotes) ? r.quotes.filter(q => q && q.trim()) : [];
  const bestQuote = quotes[0] ? String(quotes[0]).replace(/^["\u201c]|["\u201d]$/g, '').trim() : '';
  if (bestQuote) {
    // hairline divider 위/아래
    ctx.fillStyle = 'rgba(232,201,154,0.20)';
    ctx.fillRect(W * 0.18, 880, W * 0.64, 1);

    ctx.font = 'italic 500 56px "Gowun Batang", serif';
    ctx.fillStyle = '#ede8f5';
    const qLines = _wrapText('"' + bestQuote + '"', 18);
    qLines.slice(0, 3).forEach((ln, i) => ctx.fillText(ln, W / 2, 970 + i * 78));

    ctx.fillStyle = 'rgba(232,201,154,0.20)';
    ctx.fillRect(W * 0.18, 1180, W * 0.64, 1);
  }

  // ── 10. Strengths label + 3 items ──
  const strengths = (Array.isArray(r.strengths) ? r.strengths : []).slice(0, 3);
  if (strengths.length > 0) {
    ctx.font = '600 28px "Noto Sans KR", system-ui';
    ctx.fillStyle = '#f5c870';
    ctx.fillText('✨  이번 ' + (type === 'weekly' ? '주' : '달') + ' 잘한 것', W / 2, 1300);

    ctx.font = '400 32px "Noto Sans KR", system-ui';
    ctx.fillStyle = '#ede8f5';
    strengths.forEach((s, i) => {
      const lines = _wrapText(s, 22);
      lines.slice(0, 2).forEach((ln, j) => {
        const yy = 1380 + (i * 88) + (j * 38);
        ctx.fillText(ln, W / 2, yy);
      });
    });
  }

  // ── 11. Footer — 🐚 소라고동 + URL (acquisition trigger) ──
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(W * 0.32, 1740, W * 0.36, 1);

  ctx.font = '600 36px "Gowun Batang", serif';
  ctx.fillStyle = '#c9a96e';
  // 로고 + 텍스트 inline (이미지 + '소라고동' 가운데 정렬)
  if (logoImg) {
    const brandText = '소라고동';
    const tw = ctx.measureText(brandText).width;
    const logoW = 44, gap = 14;
    const totalW = logoW + gap + tw;
    const startX = (W - totalW) / 2;
    ctx.drawImage(logoImg, startX, 1779, logoW, logoW);
    ctx.textAlign = 'left';
    ctx.fillText(brandText, startX + logoW + gap, 1812);
    ctx.textAlign = 'center';
  } else {
    ctx.fillText('소라고동', W / 2, 1810);
  }

  ctx.font = '400 24px "Noto Sans KR", system-ui';
  ctx.fillStyle = '#7b7a8e';
  ctx.fillText('soragodong.com', W / 2, 1854);

  // ── 12. Download ──
  canvas.toBlob((blob) => {
    if (!blob) { alert('PNG 변환 실패'); return; }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `soragodong_${type}_${new Date().toISOString().split('T')[0]}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('📤 공유 카드 다운로드됨 ✦');
  }, 'image/png');
}

// helper: 한 줄당 char 수로 줄바꿈
function _wrapText(text, charsPerLine) {
  const words = String(text).split(' ');
  const lines = [];
  let cur = '';
  words.forEach(w => {
    if ((cur + ' ' + w).trim().length > charsPerLine) {
      if (cur) lines.push(cur.trim());
      cur = w;
    } else {
      cur = (cur + ' ' + w).trim();
    }
  });
  if (cur) lines.push(cur);
  return lines.slice(0, 4);  // max 4 줄
}

// ─── Future Self Letter (prediction follow-up) ───
