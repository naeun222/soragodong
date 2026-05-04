function closeReflectionScreen() {
  _activeReflectionId = null;
  if (typeof showScreen === 'function') showScreen('home');
}

// V4-1j-b: 숙고 채팅 별도 화면 — 메인챗과 분리. q.chatMessages 사용.
let _activeReflectionId = null;

function openReflectionChat(qId) {
  const q = (state.reflectionQuestions || []).find(x => x.id === qId);
  if (!q) return;
  // 활성화 안 됐으면 먼저 활성화
  if (q.status === 'pending' || q.status === 'paused') {
    const others = (state.reflectionQuestions || []).filter(x => x.status === 'active');
    others.forEach(o => { o.status = 'pending'; });
    q.status = 'active';
    saveState();
  }
  _activeReflectionId = qId;
  showScreen('reflection');
  renderReflectionChat();
  // 결론 / 삭제 버튼 wire (V4-fix: 보류 → 삭제로 변경)
  const resolveBtn = document.getElementById('reflectionResolveBtn');
  if (resolveBtn) {
    resolveBtn.onclick = () => resolveReflectionQuestion(qId);
  }
  const delBtn = document.getElementById('reflectionDeleteBtn');
  if (delBtn) {
    delBtn.onclick = async () => {
      const ok = await confirmDelete('이 숙고 질문', '대화 내용도 같이 사라져.');
      if (!ok) return;
      deleteReflectionQuestion(qId);
      showScreen('home');
      showToast('🗑 삭제됨');
    };
  }
  // V4-fix: 헤더 = 짧은 요약 (긴 원본은 채팅 첫 메시지에)
  const qEl = document.getElementById('reflectionScreenQ');
  if (qEl) qEl.textContent = q.shortText || q.text;
}

function renderReflectionChat() {
  const container = document.getElementById('reflectionChatArea');
  if (!container) return;
  const q = (state.reflectionQuestions || []).find(x => x.id === _activeReflectionId);
  if (!q) {
    container.innerHTML = '<div style="text-align:center; color:var(--text-dim); padding:40px 20px;">활성 질문 없음.</div>';
    return;
  }
  if (!Array.isArray(q.chatMessages)) q.chatMessages = [];
  if (q.chatMessages.length === 0) {
    container.innerHTML = `
      <div class="msg assistant">
        <div class="msg-bubble">이 질문 같이 보자.\n\n답이 바로 안 나와도 OK. 다양한 각도에서 천천히 — 며칠, 몇 주 걸려도 돼.\n\n첫 한 줄, 떠오르는 생각이나 감각 적어봐.</div>
      </div>
    `;
    return;
  }
  container.innerHTML = q.chatMessages.map((m, i) => {
    const cls = m.role === 'user' ? 'user' : 'assistant';
    // V4-fix: AI 메시지에 ✦ 깨달음으로 버튼 (8.5)
    const insightBtn = (m.role === 'assistant' && !m.error)
      ? `<button class="reflection-msg-insight ${m.savedAsInsight ? 'saved' : ''}" onclick="saveReflectionMsgAsInsight('${q.id}', ${i})">${m.savedAsInsight ? '✦ 저장됨' : '✦ 깨달음으로'}</button>`
      : '';
    return `<div class="msg ${cls}">
      <div class="msg-bubble">${escapeHtml(m.content || '')}</div>
      ${insightBtn}
    </div>`;
  }).join('');
  setTimeout(() => { container.scrollTop = container.scrollHeight; }, 30);
}

// 사용자 요청 2026-04-29: 임시 대화창 (숙고/돌연변이/마법) → caseFormulation feed-in 헬퍼.
// 메인 chat은 매 응답 자동 추출, 임시 대화는 사용자가 ✦ 깨달음 누른 시점에만 (가벼운 탐색 본질 유지).
// confidence threshold 0.6 (메인 0.5보다 보수적) + caseFormulation 항목은 unverified 풀로 → 사용자 ✓로 컨펌.
// fail silent (사용자 흐름 방해 X). 키 없으면 skip.
// 사용자 명시 2026-05-01 ultrathink: ✦ 깨달음으로 공통 정리 헬퍼 (haiku).
// 4 핸들러 (메인 chat / 마법 helpChat / 숙고 chat / 돌연변이) 모두 같은 형식 archive entry.
// 반환: { headline, body } 또는 null (실패 시 fallback 으로 호출자 단순 slice).
async function summarizeForArchive(messageContent, userQuestion) {
  if (!_canAI()) return null;
  if (!messageContent || typeof messageContent !== 'string') return null;
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: _anthropicHeaders(),
      body: JSON.stringify({
        _endpoint: 'archive_summary',
        model: 'claude-haiku-4-5',
        max_tokens: 180,
        messages: [{ role: 'user', content: `아래 대화에서 사용자가 얻은 "지혜(깨달음)"를 뽑아.

[출력 — 정확히 두 줄]
1줄: 헤드라인 (5-14자, 명사형 또는 짧은 명제)
2줄: 본문 (1문장, 30-70자, 깨달음의 핵심을 ~음/~함/~임 어미로 끝맺음)

[좋은 예]
환경이 의지보다 강함
집중 안 될 때 자책 X. 카페로 옮기면 30% 더 됨.

거절은 빠를수록 가벼움
미루면 부채감 누적. 그날 안에 한 줄로 답하면 깨끗해짐.

새벽 결정 의심
졸린 상태 결정은 후회 빈도 ↑. 자고 일어난 후 다시 봐야 함.

[규칙]
- 본문 어미: ~음 / ~함 / ~임 (간결, 명제형). "이다" "하다" "되다" 등 X.
- "지혜" 추출: 사용자가 깨달은 것·앞으로 적용할 것
- 일반 응원·격언·"잘했어" X
- 마크다운/JSON/코드블록/따옴표/이모지 X
- "나는 ~다" 일반 서술 X

${userQuestion ? `[사용자 질문/맥락]\n${userQuestion.slice(0, 400)}\n` : ''}[AI 응답 (이 안에서 지혜 추출)]
${messageContent.slice(0, 1500)}

두 줄만 출력.` }]
      })
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    let raw = (data?.content?.[0]?.text || '').trim();
    raw = raw.replace(/^```\w*\s*/, '').replace(/\s*```\s*$/, '').trim();
    raw = raw.replace(/\*\*/g, '').replace(/^#+\s*/gm, '');
    const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length >= 2) {
      return {
        headline: lines[0].replace(/^["']|["']$/g, '').slice(0, 30),
        body: lines.slice(1).join(' ').replace(/^["']|["']$/g, '').slice(0, 200)
      };
    } else if (lines.length === 1) {
      return { headline: '', body: lines[0].replace(/^["']|["']$/g, '') };
    }
    return null;
  } catch (e) {
    console.warn('[summarizeForArchive] fail:', e);
    return null;
  }
}

async function extractAndApplyInsightToModel(insightText, userMsg, source) {
