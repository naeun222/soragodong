function openFollowup(followupId) {
  const followup = state.predictionFollowups.find(f => f.id === followupId);
  if (!followup) return;
  const decision = state.decisions.find(d => d.id === followup.decisionId);
  if (!decision) return;
  const horizonLabel = { '3months': '3개월', '6months': '6개월', '12months': '12개월' }[followup.horizon];

  const screen = document.getElementById('screen-followup');
  screen.innerHTML = `
    <div class="screen-title">🔮 Future Self Letter</div>
    <div class="screen-sub">${horizonLabel} 전 너에게서 온 편지가 도착했어.</div>

    <div style="background: linear-gradient(135deg, rgba(212,167,106,0.1), rgba(139,126,196,0.08)); border: 1px solid rgba(212,167,106,0.25); border-radius: 16px; padding: 18px; margin-bottom: 20px;">
      <div style="font-size: 11px; color: #d4a76a; letter-spacing: 0.1em; margin-bottom: 8px;">결정: ${escapeHtml(decision.title)}</div>
      <div style="font-size: 12px; color: var(--text-dim); margin-bottom: 10px;">최종 결정: ${escapeHtml(decision.finalDecision || '')}</div>
      <div style="font-size: 11px; color: var(--accent); letter-spacing: 0.08em; margin-bottom: 6px; margin-top: 14px;">${horizonLabel} 전 네 예측:</div>
      <div style="font-size: 14px; line-height: 1.7; color: var(--text); font-style: italic;">"${escapeHtml(followup.originalPrediction)}"</div>
    </div>

    <div class="input-group">
      <div class="input-label">📝 지금 실제로는 어때?</div>
      <textarea id="followupOutcome" rows="4" placeholder="실제로 ${horizonLabel} 후, 상황과 네 느낌은?"></textarea>
    </div>

    <div class="input-group">
      <div class="input-label">🎯 예측 정확도 (1-10)</div>
      <input type="number" id="followupAccuracy" min="1" max="10" value="5">
      <div style="font-size:11px; color:var(--text-dim); margin-top:6px;">1: 완전히 틀림 / 5: 어느 정도 맞음 / 10: 정확히 예측대로</div>
    </div>

    <div class="input-group">
      <div class="input-label">💭 돌아보면 (선택)</div>
      <textarea id="followupReflection" rows="3" placeholder="이 예측이 왜 맞았/틀렸는지, 나에 대해 새로 알게 된 것이 있다면..."></textarea>
    </div>

    <button class="btn-primary decision" onclick="saveFollowup('${followupId}')">기록하고 닫기 ✦</button>
    <button class="btn-secondary" onclick="showScreen('home')">나중에</button>
  `;
  showScreen('followup');
}

async function saveFollowup(followupId) {
  const followup = state.predictionFollowups.find(f => f.id === followupId);
  const outcome = document.getElementById('followupOutcome').value.trim();
  const accuracy = parseInt(document.getElementById('followupAccuracy').value) || 5;
  const reflection = document.getElementById('followupReflection').value.trim();

  if (!outcome) { alert('실제 상황을 적어주세요.'); return; }

  followup.completedAt = new Date().toISOString();
  followup.actualOutcome = outcome;
  followup.accuracy = accuracy;
  followup.reflections = reflection;

  // Add to archive — 사용자 명시 2026-05-01 ultrathink: Future Self = 마법고동 흐름 → type='magic'
  const decision = state.decisions.find(d => d.id === followup.decisionId);
  state.archive.unshift({
    date: new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }),
    insight: `[Future Self] "${decision?.title}" 결정의 ${followup.horizon} 후 — 예측 정확도 ${accuracy}/10. ${reflection || outcome.slice(0, 100)}`,
    source: '🔮 Future Self',
    savedAt: new Date().toISOString(),
    type: 'magic',
    tags: ['마법고동', 'Future Self']
  });

  saveState();
  showCelebration('🔮', '편지 회신 완료', '✦');
  setTimeout(() => { showScreen('home'); }, 1500);
}

