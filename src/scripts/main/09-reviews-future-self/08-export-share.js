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

// 사용자 명시 2026-05-09 ultrathink: 분기 share card — viral 잠재력 핵심 (Spotify Wrapped 식).
//   one_word + best quote + transformation.shift / summary. 계절별 색조.
async function exportQuarterlyShareCard(reviewId) {
  const review = (state.quarterlyReviews || []).find(r => r.id === reviewId);
  if (!review) { showToast('분기 리뷰 데이터 없음'); return; }
  try { if (document.fonts && document.fonts.ready) await document.fonts.ready; } catch {}
  showToast('🎨 카드 그리는 중...');

  let logoImg = null;
  try {
    logoImg = new Image();
    logoImg.crossOrigin = 'anonymous';
    logoImg.src = '/godongicon.png';
    await logoImg.decode();
  } catch (e) { logoImg = null; }

  const W = 1080, H = 1920;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');

  const seasonColors = {
    Q1: ['#0e1513', '#1a2620', '#1f2823'],  // 봄
    Q2: ['#0d1418', '#1a2228', '#1f2731'],  // 여름
    Q3: ['#1a1410', '#26201a', '#2a221c'],  // 가을
    Q4: ['#0f0e17', '#1a1826', '#221f33']   // 겨울
  };
  const seasonAccents = { Q1: '#9ed4a0', Q2: '#7ec8e3', Q3: '#d4a76a', Q4: '#a89cd6' };
  const Q = (review.quarterKey || '').match(/-Q(\d)/)?.[1];
  const colors = seasonColors['Q' + Q] || seasonColors.Q4;
  const accent = seasonAccents['Q' + Q] || '#c9a96e';

  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, colors[0]); bg.addColorStop(0.55, colors[1]); bg.addColorStop(1, colors[2]);
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

  const halo = ctx.createRadialGradient(W * 0.5, 700, 0, W * 0.5, 700, 760);
  halo.addColorStop(0, 'rgba(201,169,110,0.22)');
  halo.addColorStop(0.55, 'rgba(201,169,110,0.06)');
  halo.addColorStop(1, 'rgba(201,169,110,0)');
  ctx.fillStyle = halo; ctx.fillRect(0, 0, W, H);

  if (logoImg) {
    ctx.save(); ctx.globalAlpha = 0.055;
    ctx.drawImage(logoImg, (W - 760) / 2, 720, 760, 760);
    ctx.restore();
  }

  ctx.save();
  ctx.globalAlpha = 0.28;
  ctx.font = '36px serif';
  ctx.fillStyle = '#e8c99a';
  ctx.textAlign = 'center';
  [[180,220],[920,280],[240,1640],[880,1760],[120,880],[960,1100],[780,200],[200,1380]]
    .forEach(([x,y]) => ctx.fillText('✦', x, y));
  ctx.restore();

  ctx.textAlign = 'center';

  const seasonLabel = (typeof seasonLabelOf === 'function')
    ? seasonLabelOf(review.quarterKey, { withEmoji: true })
    : (review.quarterKey || '');
  ctx.font = '500 30px "Noto Sans KR", system-ui, sans-serif';
  ctx.fillStyle = '#9d9aad';
  ctx.fillText(seasonLabel, W / 2, 220);

  if (logoImg) ctx.drawImage(logoImg, (W - 130) / 2, 290, 130, 130);

  ctx.font = '600 26px "Noto Sans KR", system-ui';
  ctx.fillStyle = '#9d9aad';
  ctx.fillText('이 계절의 너', W / 2, 460);

  const oneWord = review.one_word || '';
  if (oneWord) {
    ctx.font = '700 200px "Gowun Batang", "Nanum Myeongjo", serif';
    ctx.fillStyle = accent;
    ctx.fillText(oneWord, W / 2, 700);
    const tw = ctx.measureText(oneWord).width;
    ctx.fillStyle = 'rgba(201,169,110,0.35)';
    ctx.fillRect(W / 2 - tw / 2, 730, tw, 4);
  }

  const quotes = Array.isArray(review.quotes) ? review.quotes.filter(q => q && String(q).trim()) : [];
  const bestQuote = quotes[0] ? String(quotes[0]).replace(/^["“]|["”]$/g, '').trim() : '';
  if (bestQuote) {
    ctx.fillStyle = 'rgba(232,201,154,0.20)';
    ctx.fillRect(W * 0.18, 880, W * 0.64, 1);
    ctx.font = 'italic 500 56px "Gowun Batang", serif';
    ctx.fillStyle = '#ede8f5';
    _wrapText('"' + bestQuote + '"', 18).slice(0, 3).forEach((ln, i) => ctx.fillText(ln, W / 2, 970 + i * 78));
    ctx.fillStyle = 'rgba(232,201,154,0.20)';
    ctx.fillRect(W * 0.18, 1180, W * 0.64, 1);
  }

  const shift = review.transformation && review.transformation.shift ? String(review.transformation.shift).trim() : '';
  if (shift) {
    ctx.font = '600 28px "Noto Sans KR", system-ui';
    ctx.fillStyle = '#f5c870';
    ctx.fillText('🌊 한 계절의 변화', W / 2, 1300);
    ctx.font = '500 38px "Gowun Batang", serif';
    ctx.fillStyle = '#ede8f5';
    _wrapText(shift, 18).slice(0, 2).forEach((ln, i) => ctx.fillText(ln, W / 2, 1380 + i * 56));
  } else if (review.summary) {
    ctx.font = '500 36px "Gowun Batang", serif';
    ctx.fillStyle = '#ede8f5';
    _wrapText(review.summary, 20).slice(0, 3).forEach((ln, i) => ctx.fillText(ln, W / 2, 1340 + i * 54));
  }

  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(W * 0.32, 1740, W * 0.36, 1);
  ctx.font = '600 36px "Gowun Batang", serif';
  ctx.fillStyle = '#c9a96e';
  if (logoImg) {
    const brandText = '소라고동';
    const tw = ctx.measureText(brandText).width;
    const startX = (W - (44 + 14 + tw)) / 2;
    ctx.drawImage(logoImg, startX, 1779, 44, 44);
    ctx.textAlign = 'left';
    ctx.fillText(brandText, startX + 44 + 14, 1812);
    ctx.textAlign = 'center';
  } else { ctx.fillText('소라고동', W / 2, 1810); }
  ctx.font = '400 24px "Noto Sans KR", system-ui';
  ctx.fillStyle = '#7b7a8e';
  ctx.fillText('soragodong.com', W / 2, 1854);

  canvas.toBlob((blob) => {
    if (!blob) { alert('PNG 변환 실패'); return; }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `soragodong_quarterly_${review.quarterKey}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('📤 공유 카드 다운로드됨 ✦');
  }, 'image/png');
}

// 사용자 명시 2026-05-09 ultrathink: 분기 experiment → 미션 1-click import.
// 리뷰 → 다음 행동 link 단절 해소 — "이 실험 해볼래?" → mission 으로 자동 등록.
function importQuarterlyExperimentToMission(reviewId) {
  const review = (state.quarterlyReviews || []).find(r => r.id === reviewId);
  if (!review || !review.experiment || !review.experiment.what) {
    showToast('실험 데이터 없음');
    return;
  }
  if (typeof createMission !== 'function') {
    showToast('미션 시스템 로드 안 됨');
    return;
  }
  const title = String(review.experiment.what).trim().slice(0, 80);
  const desc = (review.experiment.why ? String(review.experiment.why).trim() : '');
  const seasonLabel = (typeof seasonLabelOf === 'function')
    ? seasonLabelOf(review.quarterKey, { withEmoji: false })
    : (review.quarterKey || '지난 분기');
  const mission = createMission(title, desc, {
    situation: `${seasonLabel} 리뷰에서 시작`,
    _situationSource: 'llm_extracted'
  });
  if (mission) showToast('🐚 다음 부름으로 등록됨 ✦');
}

// 사용자 명시 2026-05-09 ultrathink: 연간 share card — 가장 무거운 hero. oneWord (거대) + persona + best_pearl + oneLine.
async function exportAnnualShareCard(yearOrReview) {
  const review = (yearOrReview && typeof yearOrReview === 'object')
    ? yearOrReview
    : (state.annualReviews || []).find(r => r.year === Number(yearOrReview));
  if (!review) { showToast('연간 리뷰 데이터 없음'); return; }
  try { if (document.fonts && document.fonts.ready) await document.fonts.ready; } catch {}
  showToast('🎨 카드 그리는 중...');

  let logoImg = null;
  try {
    logoImg = new Image();
    logoImg.crossOrigin = 'anonymous';
    logoImg.src = '/godongicon.png';
    await logoImg.decode();
  } catch (e) { logoImg = null; }

  const W = 1080, H = 1920;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');

  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#0a0913'); bg.addColorStop(0.4, '#1a1623');
  bg.addColorStop(0.7, '#221d2e'); bg.addColorStop(1, '#1a1820');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

  const halo1 = ctx.createRadialGradient(W * 0.5, 600, 0, W * 0.5, 600, 900);
  halo1.addColorStop(0, 'rgba(212,167,106,0.32)');
  halo1.addColorStop(0.5, 'rgba(212,167,106,0.08)');
  halo1.addColorStop(1, 'rgba(212,167,106,0)');
  ctx.fillStyle = halo1; ctx.fillRect(0, 0, W, H);

  const halo2 = ctx.createRadialGradient(W * 0.3, 1300, 0, W * 0.3, 1300, 600);
  halo2.addColorStop(0, 'rgba(168,156,214,0.20)');
  halo2.addColorStop(0.5, 'rgba(168,156,214,0.05)');
  halo2.addColorStop(1, 'rgba(168,156,214,0)');
  ctx.fillStyle = halo2; ctx.fillRect(0, 0, W, H);

  if (logoImg) {
    ctx.save(); ctx.globalAlpha = 0.06;
    ctx.drawImage(logoImg, (W - 820) / 2, 700, 820, 820);
    ctx.restore();
  }

  ctx.save();
  ctx.globalAlpha = 0.32;
  ctx.font = '36px serif';
  ctx.fillStyle = '#e8c99a';
  ctx.textAlign = 'center';
  [[180,220],[920,280],[240,1640],[880,1760],[120,880],[960,1100],[780,200],[200,1380],
   [500,180],[640,1820],[150,1100],[860,540]].forEach(([x,y]) => ctx.fillText('✦', x, y));
  ctx.restore();

  ctx.textAlign = 'center';

  ctx.font = '500 30px "Noto Sans KR", system-ui, sans-serif';
  ctx.fillStyle = '#9d9aad';
  ctx.fillText(`${review.year}년 · 한 해를 한 단어로`, W / 2, 200);

  if (logoImg) ctx.drawImage(logoImg, (W - 130) / 2, 260, 130, 130);

  const oneWord = review.oneWord || '';
  if (oneWord) {
    ctx.font = '700 240px "Gowun Batang", "Nanum Myeongjo", serif';
    ctx.fillStyle = '#d4a76a';
    ctx.fillText(oneWord, W / 2, 660);
    const tw = ctx.measureText(oneWord).width;
    ctx.fillStyle = 'rgba(212,167,106,0.40)';
    ctx.fillRect(W / 2 - tw / 2, 700, tw, 5);
  }

  if (review.persona) {
    ctx.font = 'italic 500 52px "Gowun Batang", serif';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    _wrapText('"' + review.persona + '"', 20).slice(0, 2).forEach((ln, i) => ctx.fillText(ln, W / 2, 850 + i * 70));
  }

  const bp = (review.best_pearl && review.best_pearl.title) ? String(review.best_pearl.title).trim() : '';
  if (bp) {
    ctx.fillStyle = 'rgba(255,250,205,0.20)';
    ctx.fillRect(W * 0.18, 1080, W * 0.64, 1);
    ctx.font = '600 26px "Noto Sans KR", system-ui';
    ctx.fillStyle = '#fffacd';
    ctx.fillText('🐚 올해 가장 현명한 한 마디', W / 2, 1140);
    ctx.font = '500 44px "Gowun Batang", serif';
    ctx.fillStyle = '#ede8f5';
    _wrapText(bp, 18).slice(0, 2).forEach((ln, i) => ctx.fillText(ln, W / 2, 1220 + i * 64));
    ctx.fillStyle = 'rgba(255,250,205,0.20)';
    ctx.fillRect(W * 0.18, 1370, W * 0.64, 1);
  }

  const ol = (review.oneLine || '').trim();
  if (ol) {
    ctx.font = 'italic 400 32px "Gowun Batang", serif';
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ol.split('\n').slice(0, 5).forEach((ln, i) => ctx.fillText(ln.trim(), W / 2, 1480 + i * 50));
  }

  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(W * 0.32, 1740, W * 0.36, 1);
  ctx.font = '600 36px "Gowun Batang", serif';
  ctx.fillStyle = '#c9a96e';
  if (logoImg) {
    const brandText = '소라고동';
    const tw = ctx.measureText(brandText).width;
    const startX = (W - (44 + 14 + tw)) / 2;
    ctx.drawImage(logoImg, startX, 1779, 44, 44);
    ctx.textAlign = 'left';
    ctx.fillText(brandText, startX + 44 + 14, 1812);
    ctx.textAlign = 'center';
  } else { ctx.fillText('소라고동', W / 2, 1810); }
  ctx.font = '400 24px "Noto Sans KR", system-ui';
  ctx.fillStyle = '#7b7a8e';
  ctx.fillText('soragodong.com', W / 2, 1854);

  canvas.toBlob((blob) => {
    if (!blob) { alert('PNG 변환 실패'); return; }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `soragodong_annual_${review.year}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('📤 공유 카드 다운로드됨 ✦');
  }, 'image/png');
}

// ─── Future Self Letter (prediction follow-up) ───
