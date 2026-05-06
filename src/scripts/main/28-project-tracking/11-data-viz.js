// V4-fix v3 (사용자 요청): 너만의 데이터 — 더 재미있고 흥미롭게
function _buildFunStatsSlideHTML(stats, inRange) {
  const items = [];
  const entries = (state.entries || []);
  const inRangeEntries = entries.filter(e => e.timestamp && inRange(e.timestamp));

  // 1) ⚡ 가장 활력 빵빵한 날
  const topVit = inRangeEntries.filter(e => e.vitality != null).sort((a,b) => (b.vitality - a.vitality))[0];
  if (topVit) {
    const dateStr = new Date(topVit.date + 'T12:00:00').toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
    items.push({ icon: '⚡', big: `${topVit.vitality}/5`, label: `${dateStr} — 가장 빵빵`, tone: 'gold' });
  }

  // 2) 😴 가장 긴 잠
  const sleeps = inRangeEntries.filter(e => e.sleepStart && e.sleepEnd).map(e => {
    const [sh, sm] = e.sleepStart.split(':').map(Number);
    const [eh, em] = e.sleepEnd.split(':').map(Number);
    let mins = (eh * 60 + em) - (sh * 60 + sm);
    if (mins < 0) mins += 24 * 60;
    return { date: e.date, mins };
  });
  const longest = sleeps.sort((a,b) => b.mins - a.mins)[0];
  if (longest) {
    const dateStr = new Date(longest.date + 'T12:00:00').toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
    items.push({ icon: '😴', big: `${Math.floor(longest.mins / 60)}h ${longest.mins % 60}m`, label: `${dateStr} — 가장 긴 잠`, tone: 'blue' });
  }

  // 3) 🐚 가장 많이 받은 shell emoji
  const shells = (state.shellCollection || []).filter(s => s.date && inRange(s.date));
  if (shells.length > 0) {
    const emojiCount = {};
    shells.forEach(s => { emojiCount[s.type] = (emojiCount[s.type] || 0) + 1; });
    const topEmoji = Object.entries(emojiCount).sort((a,b) => b[1] - a[1])[0];
    if (topEmoji && topEmoji[1] >= 2) {
      items.push({ icon: topEmoji[0], big: `${topEmoji[1]}번`, label: `이 분기 네 시그니처 소라`, tone: 'pink' });
    }
  }

  // 4) 🔥 연속 체크인 streak (가장 긴)
  if (inRangeEntries.length >= 3) {
    const sortedByDate = inRangeEntries.slice().sort((a, b) => a.date.localeCompare(b.date));
    let bestStreak = 1, curStreak = 1;
    for (let i = 1; i < sortedByDate.length; i++) {
      const prev = new Date(sortedByDate[i-1].date + 'T12:00:00').getTime();
      const cur = new Date(sortedByDate[i].date + 'T12:00:00').getTime();
      const diffDays = Math.round((cur - prev) / 86400000);
      if (diffDays === 1) { curStreak++; bestStreak = Math.max(bestStreak, curStreak); }
      else { curStreak = 1; }
    }
    if (bestStreak >= 3) {
      items.push({ icon: '🔥', big: `${bestStreak}일`, label: `연속 체크인 — 가장 긴 streak`, tone: 'orange' });
    }
  }

  // 5) 진주 카테고리 분포 + top emoji
  const pearls = (state.pearls || []).filter(p => p.type !== 'dna_pearl' && inRange(p.createdAt));
  if (pearls.length > 0) {
    const catCount = {};
    pearls.forEach(p => { const c = p.category || '기타'; catCount[c] = (catCount[c] || 0) + 1; });
    const topCat = Object.entries(catCount).sort((a,b) => b[1] - a[1])[0];
    const iconMap = { 음악:'🎵', 음식:'🍴', 장소:'📍', 순간:'✨', 사람:'👥' };
    if (topCat) {
      items.push({ icon: iconMap[topCat[0]] || '💎', big: `${topCat[1]}개`, label: `${topCat[0]} 진주 — 네 취향`, tone: 'purple' });
    }
  }

  // 6) 🎵 가장 자주 들은 곡 (음악 진주의 track.id 빈도)
  const musicTracks = pearls.filter(p => p.category === '음악' && p.track && p.track.id);
  if (musicTracks.length >= 2) {
    const trackCount = {};
    musicTracks.forEach(p => { trackCount[p.track.id] = (trackCount[p.track.id] || 0) + 1; });
    const topTrackId = Object.entries(trackCount).sort((a,b) => b[1] - a[1])[0];
    if (topTrackId && topTrackId[1] >= 2) {
      const t = musicTracks.find(p => p.track.id === topTrackId[0]).track;
      items.push({ icon: '🎵', big: `${topTrackId[1]}번`, label: `"${t.title || ''}" — ${t.artist || ''}`, tone: 'gold' });
    }
  }

  // 7) ↻ 가장 다시 본 깨달음
  const arrs = (state.archive || []).filter(a => !a._deleted && a.savedAt && inRange(a.savedAt));
  const topRevisit = arrs.slice().sort((a,b) => (b.revisitCount || 0) - (a.revisitCount || 0))[0];
  if (topRevisit && (topRevisit.revisitCount || 0) >= 2) {
    items.push({ icon: '↻', big: `${topRevisit.revisitCount}번`, label: `"${(topRevisit.headline || '').slice(0,18)}" — 살아있는 통찰`, tone: 'teal' });
  }

  // 8) 자주 활성된 모드
  const topMode = stats.modeCount ? Object.entries(stats.modeCount).sort((a,b) => b[1] - a[1])[0] : null;
  if (topMode) {
    const modeMap = { exam:'📚', travel:'✈️', sick:'🤒', rest:'🏖', period:'🩸', drained:'🪫' };
    const modeName = { exam:'시험', travel:'여행', sick:'아픔', rest:'휴식', period:'월경', drained:'방전' };
    items.push({ icon: modeMap[topMode[0]] || '🌀', big: `${topMode[1]}일`, label: `${modeName[topMode[0]] || topMode[0]} 모드`, tone: 'gray' });
  }

  // 9) 🌅 가장 일찍 일어난 날
  if (sleeps.length > 0) {
    const earliestEnd = inRangeEntries.filter(e => e.sleepEnd).sort((a, b) => a.sleepEnd.localeCompare(b.sleepEnd))[0];
    if (earliestEnd) {
      const dateStr = new Date(earliestEnd.date + 'T12:00:00').toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
      items.push({ icon: '🌅', big: earliestEnd.sleepEnd, label: `${dateStr} — 가장 빠른 기상`, tone: 'gold' });
    }
  }

  if (items.length === 0) {
    return `
      <div class="stories-label">너만의 데이터</div>
      <div class="stories-empty">이 분기 데이터 부족<br>다음 분기엔 더 풍부하게 ✦</div>
    `;
  }

  // 최대 6개 표시 (랜덤 selection으로 분기마다 다른 stat — 재미)
  const shuffled = items.slice().sort(() => Math.random() - 0.5).slice(0, 6);
  const toneClass = (t) => `fun-tile fun-tile-${t || 'gold'}`;
  return `
    <div class="stories-label">너만의 데이터 ✨</div>
    <div class="stories-title">너 자신만의 통계</div>
    <div class="stories-fun-grid">
      ${shuffled.map(it => `
        <div class="${toneClass(it.tone)}">
          <div class="fun-tile-icon">${it.icon}</div>
          <div class="fun-tile-big">${it.big}</div>
          <div class="fun-tile-label">${it.label}</div>
        </div>
      `).join('')}
    </div>
  `;
}

function _buildPatternsSlideHTML(inRange) {
  const diags = (state.diagnoses || []).filter(d => inRange(d.detectedAt));
  if (diags.length === 0) {
    return `
      <div class="stories-label">잘 안 풀릴 때</div>
      <div class="stories-title">이번 분기엔 큰 패턴 신호가 없었어</div>
      <div class="stories-body">평탄한 흐름. 그것도 안정.</div>
    `;
  }

  const labels = {
    weak_tool: '🔧 도구 약함',
    wrong_layer: '📐 차원 안 맞음',
    value_clash: '⚖️ 가치 상충',
    avoidance: '🌫 회피 패턴',
    willpower_cap: '🪫 의지 임계치'
  };
  // 가장 confidence 높은 진단 1-2개
  const topDiags = diags.sort((a, b) => (b.confidence || 0) - (a.confidence || 0)).slice(0, 2);

  // 사용자 요청 2026-04-28: 미적 보강 — type별 색 그라디언트, confidence bar, 깔끔한 메타
  const statusBadge = (s) => s === 'active' ? '<span style="background:rgba(255,80,80,0.28); color:#ffaaaa; font-size:9px; padding:2px 7px; border-radius:6px; letter-spacing:0.04em;">ACTIVE</span>' : s === 'shown' ? '<span style="background:rgba(168,157,200,0.28); color:#cfc4e8; font-size:9px; padding:2px 7px; border-radius:6px; letter-spacing:0.04em;">인용됨</span>' : '';
  const fmtDate = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return `${d.getMonth() + 1}월 ${d.getDate()}일`;
  };
  const typeStyles = {
    weak_tool:    { gradient: 'linear-gradient(135deg, rgba(255,140,90,0.22), rgba(212,167,106,0.14))', border: 'rgba(255,140,90,0.5)',  desc: '시도해도 안 통하는 도구. 다른 차원으로.' },
    wrong_layer:  { gradient: 'linear-gradient(135deg, rgba(126,200,227,0.22), rgba(140,160,210,0.14))', border: 'rgba(126,200,227,0.5)', desc: '차원 자체가 안 맞을 가능성.' },
    value_clash:  { gradient: 'linear-gradient(135deg, rgba(212,167,106,0.22), rgba(168,157,200,0.14))', border: 'rgba(212,167,106,0.5)', desc: '두 가치 충돌. 우선순위 정리 필요.' },
    avoidance:    { gradient: 'linear-gradient(135deg, rgba(168,157,200,0.22), rgba(140,140,180,0.14))', border: 'rgba(168,157,200,0.5)', desc: '회피 신호 — 의식적으로 직면하거나 우회 설계.' },
    willpower_cap:{ gradient: 'linear-gradient(135deg, rgba(143,200,143,0.22), rgba(126,200,227,0.14))', border: 'rgba(143,200,143,0.5)', desc: '의지 자원 임계치. 환경 자동화 ↑.' }
  };
  return `
    <div class="stories-label">잘 안 풀릴 때</div>
    <div class="stories-title" style="margin-bottom:18px;">네 안에서 작동 중</div>
    <div style="display:flex; flex-direction:column; gap:11px; max-width:300px;">
      ${topDiags.map(d => {
        const ts = typeStyles[d.type] || typeStyles.wrong_layer;
        const confPct = Math.round((d.confidence || 0) * 100);
        return `
          <div style="background:${ts.gradient}; border:1px solid ${ts.border}; border-radius:14px; padding:14px 15px;">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:8px;">
              <span style="font-size:14px; color:white; font-weight:600;">${labels[d.type] || d.type}</span>
              ${statusBadge(d.status)}
            </div>
            <div style="font-size:12px; color:rgba(255,255,255,0.78); line-height:1.5; margin-bottom:10px;">
              ${ts.desc}
            </div>
            <div style="height:4px; background:rgba(255,255,255,0.14); border-radius:2px; overflow:hidden; margin-bottom:6px;">
              <div style="height:100%; width:${confPct}%; background:${ts.border}; border-radius:2px;"></div>
            </div>
            <div style="display:flex; justify-content:space-between; font-size:10px; color:rgba(255,255,255,0.55);">
              <span>${d.detectedAt ? `📅 ${fmtDate(d.detectedAt)}` : ''}${d.lastUpdate ? ` → ${fmtDate(d.lastUpdate)}` : ''}</span>
              <span>신뢰도 ${confPct}%</span>
            </div>
          </div>
        `;
      }).join('')}
    </div>
    <div style="font-size:11px; color:rgba(255,255,255,0.55); margin-top:14px; max-width:280px; line-height:1.6; text-align:center; font-style:italic;">
      너 ≠ 그 패턴. 작동 중일 뿐.
    </div>
  `;
}

function _buildNarrativeSlideHTML(review) {
  const summary = review.summary || '';
  const sectionsArr = Array.isArray(review.sections) ? review.sections : [];
  const nextSection = sectionsArr.find(s => (s.label || '').includes('다음'));
  const otherSections = sectionsArr.filter(s => s !== nextSection);
  // 사용자 요청 2026-04-28: 매거진식 pull-quote — 박스 줄이고 type 자체로 elegant
  const sectionAccent = (label) => {
    const l = label || '';
    if (l.includes('흐름'))  return '#7ec8e3';   // 파랑
    if (l.includes('자라') || l.includes('성장')) return '#9fd49f';  // 녹
    if (l.includes('패턴'))  return '#b3a4d6';   // 보라
    return '#d4a76a';                              // 금 (default)
  };
  return `
    <div style="display:flex; flex-direction:column; align-items:center; max-width:320px; padding:20px 16px;">
      <!-- 라벨 + 가는 양쪽 선 -->
      <div style="display:flex; align-items:center; gap:10px; margin-bottom:24px;">
        <div style="width:20px; height:1px; background:rgba(212,167,106,0.45);"></div>
        <div class="stories-label" style="margin:0;">네 분기, 한 단락</div>
        <div style="width:20px; height:1px; background:rgba(212,167,106,0.45);"></div>
      </div>

      <!-- pull quote: 큰 따옴표 + serif 본문 -->
      <div style="position:relative; padding:8px 6px; margin-bottom:26px;">
        <div style="position:absolute; top:-12px; left:-8px; font-size:48px; line-height:1; color:rgba(212,167,106,0.55); font-family:'Gowun Batang', serif;">"</div>
        <div style="font-size:18px; line-height:1.85; color:white; font-family:'Gowun Batang', serif; font-weight:400; text-align:center; padding:0 14px; letter-spacing:0.005em;">
          ${escapeHtml(summary || '데이터가 더 쌓이면 narrative가 보일 거야.')}
        </div>
        <div style="position:absolute; bottom:-30px; right:-4px; font-size:48px; line-height:1; color:rgba(212,167,106,0.55); font-family:'Gowun Batang', serif;">"</div>
      </div>

      <!-- 가는 구분 ✦ -->
      ${otherSections.length > 0 ? `
        <div style="display:flex; align-items:center; gap:8px; margin:20px 0 18px; opacity:0.55;">
          <div style="width:30px; height:1px; background:rgba(212,167,106,0.4);"></div>
          <span style="color:rgba(212,167,106,0.75); font-size:11px;">✦</span>
          <div style="width:30px; height:1px; background:rgba(212,167,106,0.4);"></div>
        </div>

        <!-- section: 라벨 + 색 dot + 본문 (박스 X, 인라인) -->
        <div style="display:flex; flex-direction:column; gap:13px; width:100%;">
          ${otherSections.map(s => {
            const accent = sectionAccent(s.label);
            return `
              <div style="border-left:2px solid ${accent}; padding:2px 0 2px 12px;">
                <div style="font-size:10px; color:${accent}; margin-bottom:4px; font-weight:600; letter-spacing:0.08em; text-transform:uppercase; opacity:0.85;">${escapeHtml(s.label || '')}</div>
                <div style="font-size:13px; color:rgba(255,255,255,0.88); line-height:1.6;">${escapeHtml(s.body || '')}</div>
              </div>
            `;
          }).join('')}
        </div>
      ` : ''}

      <!-- next: 분리된 가벼운 highlight -->
      ${nextSection ? `
        <div style="margin-top:22px; padding:14px 16px; background:linear-gradient(135deg, rgba(143,200,143,0.18), rgba(212,167,106,0.10)); border-radius:14px; width:100%; box-sizing:border-box;">
          <div style="font-size:10px; color:rgba(143,200,143,0.95); margin-bottom:5px; font-weight:600; letter-spacing:0.08em; text-transform:uppercase;">${escapeHtml(nextSection.label || '다음 분기에')}</div>
          <div style="font-size:13px; color:white; line-height:1.6;">${escapeHtml(nextSection.body || '')}</div>
        </div>
      ` : ''}
    </div>
  `;
}

// 사용자 명시 2026-05-06 ultrathink: 분기 리뷰 차별화 — transformation 슬라이드.
//   "그때 너 → 지금 너" — start_quote (분기 첫 2주) ⇂ shift ⇂ end_quote (분기 끝 2주) + continuity anchor.
//   review.transformation = { start_quote, end_quote, shift } / review.continuity = string.
function _buildTransformationSlideHTML(review) {
  const tr = review && review.transformation;
  if (!tr || !(tr.start_quote || tr.end_quote || tr.shift)) return null;
  const continuity = (review.continuity || '').trim();
  return `
    <div style="display:flex; flex-direction:column; align-items:center; max-width:340px; padding:18px 14px;">
      <div style="display:flex; align-items:center; gap:10px; margin-bottom:22px;">
        <div style="width:20px; height:1px; background:rgba(168,156,214,0.5);"></div>
        <div class="stories-label" style="margin:0; color:rgba(168,156,214,0.95);">그때 너 → 지금 너</div>
        <div style="width:20px; height:1px; background:rgba(168,156,214,0.5);"></div>
      </div>

      ${tr.start_quote ? `
        <div style="width:100%; max-width:280px; padding:14px 16px; background:rgba(255,255,255,0.04); border:1px solid rgba(168,156,214,0.18); border-radius:14px; margin-bottom:8px; opacity:0.78;">
          <div style="font-size:9.5px; color:rgba(168,156,214,0.85); letter-spacing:0.14em; text-transform:uppercase; margin-bottom:6px;">분기 시작</div>
          <div style="font-family:'Gowun Batang',serif; font-size:14px; color:rgba(255,255,255,0.85); line-height:1.65;">"${escapeHtml(tr.start_quote)}"</div>
        </div>
      ` : ''}

      <div style="font-size:18px; color:rgba(168,156,214,0.7); margin:6px 0;">↓</div>

      ${tr.shift ? `
        <div style="font-family:'Gowun Batang',serif; font-size:18px; color:white; line-height:1.7; text-align:center; padding:10px 14px; letter-spacing:0.01em; margin-bottom:6px;">
          ${escapeHtml(tr.shift)}
        </div>
      ` : ''}

      <div style="font-size:18px; color:rgba(168,156,214,0.7); margin:6px 0;">↓</div>

      ${tr.end_quote ? `
        <div style="width:100%; max-width:280px; padding:14px 16px; background:linear-gradient(135deg, rgba(168,156,214,0.18), rgba(212,167,106,0.08)); border:1px solid rgba(168,156,214,0.32); border-radius:14px; margin-top:8px;">
          <div style="font-size:9.5px; color:rgba(212,167,106,0.95); letter-spacing:0.14em; text-transform:uppercase; margin-bottom:6px;">분기 끝</div>
          <div style="font-family:'Gowun Batang',serif; font-size:15px; color:white; line-height:1.65;">"${escapeHtml(tr.end_quote)}"</div>
        </div>
      ` : ''}

      ${continuity ? `
        <div style="margin-top:24px; padding-top:16px; border-top:1px dashed rgba(255,255,255,0.18); width:100%; text-align:center;">
          <div style="font-size:10px; color:rgba(143,200,143,0.85); letter-spacing:0.13em; text-transform:uppercase; margin-bottom:6px;">⚓ 안 변한 건</div>
          <div style="font-size:12.5px; color:rgba(255,255,255,0.82); line-height:1.6; font-style:italic;">${escapeHtml(continuity)}</div>
        </div>
      ` : ''}
    </div>
  `;
}

