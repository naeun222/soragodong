// ═══════════════════════════════════════════════════════════════
// V3.3: 대화 일별 아카이브 (raw → AI 요약)
// ═══════════════════════════════════════════════════════════════

let _expandedArchiveDates = new Set();

let _chatArchiveEscDetach = null;
function openChatArchive() {
  _expandedArchiveDates.clear();
  renderChatArchiveModal();
  const overlay = document.getElementById('chatArchiveOverlay');
  overlay.style.display = 'flex';
  // V4-fix: 모달이 chat-input-bar에 가려지는 것 방지
  const chatBar = document.getElementById('chatInputBar');
  if (chatBar) chatBar.style.visibility = 'hidden';
  // 사용자 명시 2026-05-01 (agent audit): ESC = 닫기.
  if (_chatArchiveEscDetach) _chatArchiveEscDetach();
  _chatArchiveEscDetach = _registerModalEsc(overlay, () => closeChatArchive());
}

function closeChatArchive() {
  document.getElementById('chatArchiveOverlay').style.display = 'none';
  const chatBar = document.getElementById('chatInputBar');
  if (chatBar) chatBar.style.visibility = '';
  if (_chatArchiveEscDetach) { _chatArchiveEscDetach(); _chatArchiveEscDetach = null; }
}

function renderChatArchiveModal() {
  const container = document.getElementById('chatArchiveContent');
  if (!container) return;
  
  const archive = (state.chatArchive || []).slice().sort((a, b) => 
    new Date(b.date) - new Date(a.date)
  );
  
  if (archive.length === 0) {
    container.innerHTML = `<div style="text-align:center; padding:30px 16px; color:var(--text-dim); font-size:13px; line-height:1.8;">
      <div style="font-size:32px; margin-bottom:12px;">📚</div>
      아직 보관된 대화가 없어.<br>
      7일 넘은 대화가 자동으로 여기 모일 거야.<br>
      <span style="font-size:11px; opacity:0.8;">📌 핀 꽂으면 영구 보관됨.</span>
    </div>`;
    return;
  }

  // 사용자 요청 2026-04-29: 핀 꽂힌 거 위로
  const sortedArchive = archive.slice().sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
    return 0;
  });

  container.innerHTML = sortedArchive.map(a => {
    const dateLabel = new Date(a.date).toLocaleDateString('ko-KR', {
      year: 'numeric', month: 'long', day: 'numeric', weekday: 'short'
    });
    // archive entry id (별도 entry — 같은 날 여러 챕터 구분)
    const archId = a.id || a.date;
    // 사용자 보고 2026-05-02 ultrathink: 더보기 (carret ▸/▾) 눌러도 안 보이는 버그.
    // root cause: toggleArchiveDay(archId) 으로 toggle 했는데 isExpanded 는 a.date 만 검사 → archId !== a.date 시 매칭 X.
    // fix: archId 으로 통일.
    const isExpanded = _expandedArchiveDates.has(archId);
    const messages = isExpanded ? (a.messages || []) : [];
    const pinIcon = a.pinned ? '📌' : '📍';
    const pinTitle = a.pinned ? '핀 풀기 (7일 cap 다시)' : '핀 꽂기 (영구 보관)';
    // 사용자 명시 2026-05-01 ultrathink: 4AM 처리 전 (pending) = 소프트 placeholder. legacy flag 도 호환.
    // 사용자 명시 2026-05-02 ultrathink: batch submit 후엔 "정리 중 ⏳" 로 변경 (오류 X 처리 중 명시).
    const isPending = !!(a._pendingExtract || a._pendingCaseAnalysis);
    const isBatchProcessing = !!a._batchSubmittedAt;
    const pendingNote = isPending
      ? (isBatchProcessing
          ? `<div class="cac-pending-note" style="font-size:11px; color:var(--text-soft); opacity:0.7; margin-top:4px; line-height:1.6;">🌙 정리 중 ⏳ — 보통 5분~2시간 후 자리잡아.</div>`
          : `<div class="cac-pending-note" style="font-size:11px; color:var(--text-soft); opacity:0.65; margin-top:4px; line-height:1.6;">🌙 새벽 4시에 자동 정리될 예정 — 그때 나 탭 / 도서관에 깔끔히 자리잡아.</div>`)
      : '';
    const cardOpacity = isPending ? '0.7' : '1';

    return `
      <div class="chat-archive-card${a.pinned ? ' pinned' : ''}" style="opacity:${cardOpacity};">
        <div class="cac-header" onclick="toggleArchiveDay('${archId}')">
          <div class="cac-date">${a.pinned ? '📌 ' : ''}${dateLabel}</div>
          <div class="cac-meta">
            <span>${a.messageCount || 0}개 메시지</span>
            <button class="cac-pin-btn" onclick="event.stopPropagation(); toggleArchivePin('${a.date}')" title="${pinTitle}" style="background:transparent; border:none; cursor:pointer; font-size:14px; padding:2px 6px; opacity:${a.pinned ? '1' : '0.5'};">${pinIcon}</button>
            <span class="cac-toggle">${isExpanded ? '▾' : '▸'}</span>
          </div>
        </div>
        ${pendingNote}
        ${isExpanded ? `
          <div class="cac-messages">
            ${messages.map(m => {
              const cls = m.role === 'user' ? 'user' : 'assistant';
              let content = m.content || '';
              content = content.replace(/```json[\s\S]*?```/g, '').trim();
              content = content.replace(/\{[\s\S]*"(?:new_traits|new_values|new_patterns|insight|case_formulation|proposal|extracted_tasks|extracted_schedule|extracted_pearls|decision_suggested)[\s\S]*\}\s*$/g, '').trim();
              const time = m.timestamp ? new Date(m.timestamp).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '';
              return `<div class="cac-msg ${cls}">
                <div class="cac-msg-time">${time}</div>
                <div class="cac-msg-content">${escapeHtml(content.slice(0, 500))}${content.length > 500 ? '...' : ''}</div>
              </div>`;
            }).join('')}
            <div style="display:flex; gap:6px; margin-top:10px; padding-top:10px; border-top:1px solid var(--border);">
              <button class="btn-secondary" onclick="event.stopPropagation(); resumeArchiveChat('${archId}')" style="flex:1; font-size:11.5px; padding:8px;">↩️ 이어서 하기</button>
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }).join('');
}

// 사용자 명시 2026-05-02 ultrathink: 이전 대화 이어서 — archive.messages 를 state.chatMessages 으로 복원.
// 마무리 안 된 현재 대화 있으면 = 덮어쓰기 confirm 모달 (확인 시 _archiveCurrentChapter 강제 후 복원).
async function resumeArchiveChat(archId) {
  const archive = (state.chatArchive || []).find(a => (a.id || a.date) === archId);
  if (!archive || !Array.isArray(archive.messages) || archive.messages.length === 0) {
    showToast('대화를 불러올 수 없어');
    return;
  }
  const currentMsgs = (state.chatMessages || []).filter(m => !m.typing && !m.error);
  if (currentMsgs.length > 0) {
    const yes = await showConfirmModal({
      title: '⚠️ 잠깐, 현재 대화는?',
      message: '지금 대화 마무리 안 했는데 — 이대로 이어서 불러오면 현재 대화는 자동으로 도서관에 보관돼.\n\n그래도 진행할까?',
      okLabel: '응, 보관하고 이어서',
      cancelLabel: '아니, 그만'
    });
    if (!yes) return;
    // 현재 대화 = archive 으로 보관 (수동 마무리 단 batch 에 안 들어감)
    if (typeof _archiveCurrentChapter === 'function') {
      _archiveCurrentChapter({ manual: true, minMessages: 1 });
    }
  }
  // archive.messages → state.chatMessages 복원 + 그 archive 제거
  state.chatMessages = archive.messages.slice();
  // 사용자 보고 2026-05-03: 이어서 → 새 채팅 가는 버그.
  // root cause: archive 의 옛 timestamp (며칠 전) → sendChat 의 5h+ 갭 detect → _archiveCurrentChapter 자동 분리 → state.chatMessages = [].
  // fix: 마지막 message timestamp = now 으로 update (resume 시점이 새 시작점). 5h+ 갭 detect skip.
  if (state.chatMessages.length > 0) {
    state.chatMessages[state.chatMessages.length - 1].timestamp = new Date().toISOString();
  }
  // V4 (사용자 보고 2026-05-04 V199): belt-and-suspenders — resume 직후 sendChat 1회는 갭 detect 강제 skip.
  // 옛 fix (마지막 timestamp=now) 만으론 edge case (마지막 메시지 객체 다른 곳에서 mutated 등) 에 취약.
  // _chatResumedAt 마커 — sendChat 가 5h 내면 isNewChapter=false 강제 후 마커 클리어.
  state._chatResumedAt = Date.now();
  state.chatArchive = (state.chatArchive || []).filter(a => (a.id || a.date) !== archId);
  saveState();
  if (typeof closeChatArchive === 'function') closeChatArchive();
  if (typeof renderChat === 'function') renderChat();
  if (typeof showScreen === 'function') showScreen('chat');
  showToast('↩️ 대화 이어서 시작');
}

function toggleArchiveDay(date) {
  if (_expandedArchiveDates.has(date)) {
    _expandedArchiveDates.delete(date);
  } else {
    _expandedArchiveDates.add(date);
  }
  renderChatArchiveModal();
}

// V3.8: 챕터 토픽 추출. 사용자 명시 2026-05-01 ultrathink: passedMessages arg 받음 (4AM 일괄 batch.messages 직접 처리).
// 결과: state.topicCards에 1-3개 토픽 카드 저장
// 사용자 명시 2026-05-02 ultrathink: prompt builder + result processor 분리 — Batch API path 가 재사용.
function _buildExtractTopicPrompt(prevChapterMsgs) {
  const chatLog = prevChapterMsgs.map(m => {
    const role = m.role === 'user' ? '나' : '소라';
    let content = m.content || '';
    content = content.replace(/```json[\s\S]*?```/g, '').trim();
    content = content.replace(/\{[\s\S]*"(?:new_traits|new_values)[\s\S]*\}\s*$/g, '').trim();
    return `${role}: ${content}`;
  }).join('\n\n');

  return `사용자가 AI 친구 "소라고동"과 나눈 한 챕터(연속된 대화 묶음)를 토픽 카드로 정리해.

[대화 원문]
${chatLog.slice(0, 8000)}

[토픽 카드 추출 규칙]
- 의미 있는 토픽 1-3개만 (잡담은 토픽 X)
- 카테고리 중 하나 선택 (V4 8 카테고리):
  · diary: 일기 / 그날 정서 기록
  · casual: 일상 / 가벼운 사실
  · concern: 고민 / 갈림길 / 큰 결정
  · emotion: 감정 / 마음 상태
  · memory: 기억할 순간 / 강한 인상
  · todo: 할 일 / 일감 / 마감
  · idea: 아이디어 / 통찰
  · relationship: 관계 / 사람
- 각 카드: 짧은 제목 (한 줄 ~25자) + 1-2문장 요약
- 의미 없는 짧은 잡담만 있으면 빈 배열 반환

[출력 형식 — 반드시 JSON만]
{
  "topics": [
    {
      "title": "이 일 계속할지 고민",
      "summary": "사람 갈등 + 진로 회의. 결정 못 내림.",
      "category": "concern"
    }
  ]
}

JSON만 출력. 마크다운 X. 다른 설명 X.`;
}

// parsed JSON 받아 topicCards push + chapterMeta 갱신.
// V4 (V191): archive.summary 갱신 분기 폐기 — 히스토리 줄거리 요약 흐름 제거.
function _processExtractTopicData(parsed, prevChapterMsgs) {
  if (!parsed?.topics || !Array.isArray(parsed.topics)) return;
  if (!prevChapterMsgs || prevChapterMsgs.length === 0) return;
  const chapterStartedAt = prevChapterMsgs[0]?.timestamp;
  const chapterEndedAt = prevChapterMsgs[prevChapterMsgs.length - 1]?.timestamp;
  if (!chapterStartedAt) return;
  // dedupe — 같은 chapterStartedAt 으로 이미 만들어진 카드는 skip (중복 prompt 비용 / state 오염 방지)
  if ((state.topicCards || []).some(c => c.chapterStartedAt === chapterStartedAt)) return;

  parsed.topics.forEach(t => {
    if (!t.title || !t.summary) return;
    const V3_TO_V4 = { decision: 'concern', task: 'todo', emotional: 'emotion', strategy: 'idea' };
    let rawCat = V3_TO_V4[t.category] || t.category;
    const validCats = ['diary', 'casual', 'concern', 'emotion', 'memory', 'todo', 'idea', 'relationship'];
    const category = validCats.includes(rawCat) ? rawCat : 'memory';
    const cardTitle = String(t.title).trim().slice(0, 60);
    const cardSummary = String(t.summary).trim().slice(0, 300);
    const card = {
      id: 'tc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      chapterStartedAt,
      chapterEndedAt,
      title: cardTitle,
      summary: cardSummary,
      category,
      messageCount: prevChapterMsgs.length,
      createdAt: new Date().toISOString()
    };
    if (category === 'strategy') {
      card.generations = [{
        gen: 1, layer: 'L2', action: cardSummary || cardTitle,
        missions: [], shells: [], attempts: [], status: 'working'
      }];
      card.embodimentStatus = 'seedling';
      card.embodimentPath = null;
      card.evolutionChats = [];
    }
    if (!Array.isArray(state.topicCards)) state.topicCards = [];
    state.topicCards.push(card);
  });

  let metaUpdated = false;
  if (parsed.topics.length > 0 && prevChapterMsgs[0]) {
    const startMsg = prevChapterMsgs[0];
    if (startMsg.chapterStart) {
      const firstTopic = parsed.topics[0];
      const cat = firstTopic.category || null;
      const sum = firstTopic.title || null;
      if (!startMsg.chapterMeta) startMsg.chapterMeta = { category: null, summary: null, strategyId: null };
      if (cat && !startMsg.chapterMeta.category) { startMsg.chapterMeta.category = cat; metaUpdated = true; }
      if (sum && !startMsg.chapterMeta.summary) { startMsg.chapterMeta.summary = sum; metaUpdated = true; }
    }
  }

  // V4 (사용자 명시 2026-05-04 V191): archive.summary 갱신 제거 — 히스토리 API 줄거리 요약 기능 폐기.
  // topicCards 추출 흐름은 보존 (도서관 / 나 탭 카드 정상). chatArchive item 자체는 raw messages 그대로 보관.
  saveState();
  if (metaUpdated && typeof renderChat === 'function') renderChat();
  console.log(`✦ 챕터 토픽 ${parsed.topics.length}개 추출됨`);
}

// 일반 path — 5h+ 갭 즉시 (신규유저 첫 3 챕터). 또는 batch fallback timeout 시.
async function extractPreviousChapterTopics(passedMessages) {
  if (!_canAI()) return;
  if (window._onbTutorialMode) return;
  if (state.preferences && state.preferences.testerMode) return;

  let prevChapterMsgs;
  if (Array.isArray(passedMessages) && passedMessages.length > 0) {
    prevChapterMsgs = passedMessages.filter(m => !m.typing && !m.error);
    if (prevChapterMsgs.length < 3) return;
  } else {
    // legacy 경로 — chatMessages chapterStart 마커 스캔 (호환 보존)
    const msgs = (state.chatMessages || []).filter(m => !m.typing && !m.error);
    if (msgs.length < 3) return;
    let newChapterIdx = -1;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].chapterStart) { newChapterIdx = i; break; }
    }
    if (newChapterIdx <= 0) return;
    let prevChapterStart = 0;
    for (let i = newChapterIdx - 1; i >= 0; i--) {
      if (msgs[i].chapterStart) { prevChapterStart = i; break; }
    }
    prevChapterMsgs = msgs.slice(prevChapterStart, newChapterIdx);
    if (prevChapterMsgs.length < 3) return;
  }

  // dedupe — submit 전 가드
  const chapterStartedAt = prevChapterMsgs[0]?.timestamp;
  if (!chapterStartedAt) return;
  if ((state.topicCards || []).some(c => c.chapterStartedAt === chapterStartedAt)) return;

  const prompt = _buildExtractTopicPrompt(prevChapterMsgs);
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: _anthropicHeaders(),
      body: JSON.stringify({ _endpoint: 'extract_topic', model: 'claude-haiku-4-5', max_tokens: 600, messages: [{ role: 'user', content: prompt }] })
    });
    if (!resp.ok) return;
    const data = await resp.json();
    let text = data.content[0].text.trim();
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return;
    const parsed = JSON.parse(jsonMatch[0]);
    _processExtractTopicData(parsed, prevChapterMsgs);
  } catch (e) {
    console.warn('Topic extract failed:', e);
  }
}

async function generateShellStory(shellIdx, task) {
  const shell = state.shellCollection[shellIdx];
  if (!shell) return;
  
  const dateStr = new Date(shell.date).toLocaleDateString('ko-KR', { 
    month: 'long', day: 'numeric' 
  });
  const timeStr = new Date(shell.date).toLocaleTimeString('ko-KR', { 
    hour: '2-digit', minute: '2-digit' 
  });
  
  const prompt = `사용자가 방금 작업을 완료했어. 이 순간을 기억할 수 있는 짧은 한 줄 또는 두 줄짜리 메모를 만들어.

[작업]
"${task.title}"
${task.description ? `설명: ${task.description}` : ''}
종류: ${task.source === 'ai_mission' ? '소라의 부름 (AI 제안 미션)' : task.weight === 'main' ? '메인 작업' : task.weight === 'daily' ? '일상 작업' : '가벼운 작업'}
시간: ${dateStr} ${timeStr}

[규칙]
- 1-2줄, 30자 이내
- 그 순간의 분위기를 살리되 과장 X
- 너무 시적이지 X, 너무 건조하지 X
- 친근한 반말
- "수고했어" 같은 칭찬 X
- 사용자가 나중에 봤을 때 그날을 떠올릴 수 있을 만한 작은 디테일
- 따옴표 X, 다른 설명 X

[좋은 예시]
"오후의 작은 마침표"
"세그포머 한 줄, 그래도 한 줄"
"메일 하나, 어깨 가벼워짐"
"마감 직전의 천재 모드"
"오늘 첫 번째 도파민"

한 줄만 출력. 따옴표 X.`;

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: _anthropicHeaders(),
      body: JSON.stringify({ _endpoint: 'shell_story', model: 'claude-haiku-4-5', max_tokens: 80, messages: [{ role: 'user', content: prompt }] })
    });
    if (!resp.ok) return;
    const data = await resp.json();
    let text = data.content[0].text.trim().replace(/^["'`]+|["'`]+$/g, '');
    if (text && text.length < 60) {
      // Update the shell's story
      if (state.shellCollection[shellIdx]) {
        state.shellCollection[shellIdx].story = text;
        state.shellCollection[shellIdx].experience = text;  // 별칭
        saveState();
      }
    }
  } catch (e) {
    console.warn('shell story gen error:', e);
  }
}

// Toggle - allows "uncompleting" if user clicked by mistake
// V3.12.x: 마지막 start의 경과시간 (시작 → 돌아옴)
function getTaskElapsedTime(taskId) {
  const starts = (state.starts || []).filter(s => s.taskId === taskId && s.returnedAt);
  if (starts.length === 0) return null;
  const last = starts[starts.length - 1];
  const ms = new Date(last.returnedAt) - new Date(last.startedAt);
  const mins = Math.round(ms / 60000);
  if (mins < 1) return '< 1분';
  if (mins < 60) return `${mins}분`;
  return `${Math.floor(mins/60)}시간 ${mins%60}분`;
}

function toggleQuestComplete(taskId) {
  const task = state.tasks.find(t => t.id === taskId);
  if (!task) return;
  if (task.status === 'done') {
    // Uncomplete
    task.status = 'active';
    task.completedAt = null;
    // V3.12.x fix: 모든 task 종류에서 마지막 소라 제거 (이전엔 ai_mission만 제거하던 버그)
    const lastShell = (state.shellCollection || []).slice().reverse().find(s => s.taskId === taskId);
    if (lastShell) {
      const idx = state.shellCollection.lastIndexOf(lastShell);
      if (idx >= 0) state.shellCollection.splice(idx, 1);
    }
    saveState();
    renderExecute();
    if (typeof renderShellBar === 'function') renderShellBar();
    showToast('되살림 ✦');
  } else {
    completeQuest(taskId);
  }
}

// V4-1u-b: 타임테이블 시간 grid (V4 비전 10.6)
// state.todaySchedule = [{id, title, start:'14:00', end:'15:30', source, taskId, color}]
const _V4_TT_COLORS = ['#a89dc8', '#d4a76a', '#8fc88f', '#c98c8c', '#7ab9d4', '#d4b87a', '#c08fc8'];

function renderV4TimetableHTML() {
  const items = (state.todaySchedule || []).slice().sort((a, b) => (a.start || '').localeCompare(b.start || ''));
  const todayK = todayKey();
  // 오늘 항목만 (date 안 들어가 있으면 모두 오늘로 가정)
  const todayItems = items.filter(it => !it.date || it.date === todayK);

  // 사용 시간 범위: 항목 있으면 min~max, 없으면 8-22 default
  let startHour = 8, endHour = 22;
  if (todayItems.length > 0) {
    const hours = todayItems.flatMap(it => {
      const s = parseInt((it.start || '').split(':')[0]) || 0;
      const e = parseInt((it.end   || '').split(':')[0]) || 0;
      return [s, e];
    });
    startHour = Math.min(...hours, 8);
    endHour = Math.max(...hours, 22);
  }

  // 현재 시각
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();

  // 시간 grid (각 시간 60px / 분 1px)
  const HOUR_PX = 50;
  let html = `
    <div class="v4-timetable-section">
      <div class="v4-tt-header">
        <span class="v4-tt-label">📅 일정</span>
        <div style="display:flex; gap:6px; flex-wrap:wrap;">
          <button class="v4-tt-add-btn" onclick="addV4ScheduleItem()">+ 추가</button>
          ${(state.todaySchedule || []).length > 0 ? `<button class="v4-tt-add-btn" onclick="exportToGoogleCalendar()" title="Google 캘린더에 일정 추가">📤 구글 캘린더</button>` : ''}
          <button class="v4-tt-add-btn" onclick="importFromGoogleCalendar()" title="Google 캘린더에서 일정 가져오기">📥 가져오기</button>
        </div>
      </div>
      <div class="v4-tt-grid" id="v4ttGrid">
  `;
  for (let h = startHour; h <= endHour; h++) {
    const hourLabel = String(h).padStart(2, '0') + ':00';
    // V4-fix: 빈 시간대 클릭 → task picker
    html += `<div class="v4-tt-hour-row" style="height:${HOUR_PX}px;" onclick="pickTaskForHour(${h})" title="이 시간에 할 일 적용하기">
      <span class="v4-tt-hour-label">${hourLabel}</span>
    </div>`;
  }
  // 항목들
  todayItems.forEach((it, idx) => {
    const sParts = (it.start || '').split(':');
    const eParts = (it.end   || '').split(':');
    const sMin = (parseInt(sParts[0]) || 0) * 60 + (parseInt(sParts[1]) || 0);
    const eMin = (parseInt(eParts[0]) || 0) * 60 + (parseInt(eParts[1]) || 0);
    const startTopMin = sMin - startHour * 60;
    const heightMin = Math.max(20, eMin - sMin);
    const top = (startTopMin / 60) * HOUR_PX;
    const height = (heightMin / 60) * HOUR_PX;
    const color = it.color || _V4_TT_COLORS[idx % _V4_TT_COLORS.length];
    const isPast = eMin < nowMin && !it._past;
    html += `
      <div class="v4-tt-item${isPast ? ' past' : ''}" style="top:${top}px; height:${height}px; background:${color}33; border-left:3px solid ${color};" onclick="openV4ScheduleItem('${it.id}')" title="${escapeHtml(it.title)} ${it.start}~${it.end}">
        <div class="v4-tt-item-time">${it.start}–${it.end}</div>
        <div class="v4-tt-item-title">${escapeHtml(it.title)}</div>
      </div>
    `;
  });
  // 현재 시각 라인
  if (nowMin >= startHour * 60 && nowMin <= endHour * 60) {
    const nowTopMin = nowMin - startHour * 60;
    const nowTop = (nowTopMin / 60) * HOUR_PX;
    html += `<div class="v4-tt-now-line" style="top:${nowTop}px;"><span class="v4-tt-now-dot"></span></div>`;
  }
  html += `</div>`;
  if (todayItems.length === 0) {
    html += `<div class="v4-tt-empty">오늘 일정 비어있어. <span style="color:var(--accent2);">+ 일정 추가</span>로 시작.</div>`;
  }
  html += `</div>`;
  return html;
}

// V4-fix: 시간 grid 빈 시간대 클릭 → 할 일 목록 picker (그 시간에 적용하기)
async function pickTaskForHour(hour) {
  // 아직 시간 안 적용된 today task 모음 (오늘의 카드 + 오늘 할 일)
  const tasks = (state.tasks || []).filter(t =>
    t.status !== 'done' &&
    !t.scheduledStart &&
    (t.slot === 'now3' || t.isToday)
  );
  const options = tasks.map(t => {
    const tag = t.slot === 'now3' ? '✦' : '📋';
    return { label: `${tag} ${(t.title || '').slice(0, 35)}`, value: t.id };
  });
  options.push({ label: '+ 새 일정 직접 입력', value: '__new' });
  options.push({ label: '취소', value: 'cancel' });

  const action = await showOptionsModal({
    title: `${String(hour).padStart(2,'0')}:00 — 뭘 적용할까?`,
    message: tasks.length === 0 ? '적용할 할 일 없음 — 직접 입력 가능' : '오늘 할 일 중 골라.',
    options
  });
  if (!action || action === 'cancel') return;

  const startStr = `${String(hour).padStart(2,'0')}:00`;
  const endHour = (hour + 1) % 24;
  const endStr = `${String(endHour).padStart(2,'0')}:00`;
  const todayK = todayKey();

  if (action === '__new') {
    const title = await showInputModal({
      title: `📅 ${startStr} 새 일정`,
      placeholder: '뭐 할 거야?',
      maxLength: 60,
      okLabel: '적용하기'
    });
    if (!title || !title.trim()) return;
    // 시간 정확히 조정 picker
    const time = await showTimeRangePicker({
      title: title.trim(),
      startDefault: startStr,
      endDefault: endStr
    });
    if (!time) return;
    if (!Array.isArray(state.todaySchedule)) state.todaySchedule = [];
    state.todaySchedule.push({
      id: 'sched_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      title: title.trim(),
      start: time.start,
      end: time.end,
      date: todayK,
      source: 'manual',
      taskId: null,
      color: _V4_TT_COLORS[Math.floor(Math.random() * _V4_TT_COLORS.length)]
    });
    saveState();
    renderExecute();
    showToast(`📅 ${time.start} 적용됨`);
    return;
  }

  // 기존 task → schedule push
  const t = tasks.find(x => x.id === action);
  if (!t) return;
  // 시간 확인 picker (사용자가 1시간 default 변경 가능)
  const time = await showTimeRangePicker({
    title: `⏰ ${t.title}`,
    startDefault: startStr,
    endDefault: endStr
  });
  if (!time) return;
  if (!Array.isArray(state.todaySchedule)) state.todaySchedule = [];
  state.todaySchedule.push({
    id: 'sched_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    title: t.title,
    start: time.start,
    end: time.end,
    date: todayK,
    source: 'task',
    taskId: t.id,
    color: _V4_TT_COLORS[Math.floor(Math.random() * _V4_TT_COLORS.length)]
  });
  t.scheduledStart = time.start;
  t.scheduledEnd = time.end;
  saveState();
  renderExecute();
  showToast(`⏰ ${(t.title || '').slice(0, 20)} → ${time.start}`);
}

async function addV4ScheduleItem() {
  const title = await showInputModal({
    title: '📅 일정 추가',
    message: '뭐 할 거야?',
    placeholder: '예: 미팅 / 운동 / 카페 작업',
    maxLength: 60,
    okLabel: '다음 →'
  });
  if (!title || !title.trim()) return;
  const time = await showTimeRangePicker({
    title: title.trim(),
    startDefault: '',
    endDefault: ''
  });
  if (!time) return;

  if (!Array.isArray(state.todaySchedule)) state.todaySchedule = [];
  state.todaySchedule.push({
    id: 'sched_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    title: title.trim(),
    start: time.start,
    end: time.end,
    date: todayKey(),
    source: 'manual',
    taskId: null,
    color: _V4_TT_COLORS[Math.floor(Math.random() * _V4_TT_COLORS.length)]
  });
  saveState();
  renderExecute();
  showToast('일정 추가됨 📅');
}

// V4-fix: 오늘 할 일 직접 추가
async function addTodayTask() {
  const title = await showInputModal({
    title: '오늘 할 일 추가',
    message: '한 줄로 적어.',
    placeholder: '예: 메일 답장 / 빨래 돌리기',
    maxLength: 60,
    okLabel: '추가'
  });
  if (!title || !title.trim()) return;
  if (!Array.isArray(state.tasks)) state.tasks = [];
  state.tasks.push({
    id: 'task_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    title: title.trim().slice(0, 60),
    status: 'active',
    slot: 'drawer',
    isToday: true,
    weight: 'light',
    energy: 'mid',
    priority: typeof nextPriority === 'function' ? nextPriority() : 0,
    createdAt: new Date().toISOString(),
    date: todayKey(),
    source: 'manual_today'
  });
  saveState();
  renderExecute();
  showToast('오늘 할 일에 추가됨 📋');
}

// V3 5블록 토글 — V4-fix에서 완전 삭제로 dead code (호출 X). 함수 stub만 남겨 onclick 호환.
function toggle5Blocks() { /* dead — V4 5블록 제거 */ }

// V4-1u-d: 할 일 → 일정 적용하기 (V4 비전 10.7) — task.scheduledStart/End + state.todaySchedule push (taskId)
async function scheduleTaskToTime(taskId) {
  const task = (state.tasks || []).find(t => t.id === taskId);
  if (!task) return;

  // 이미 적용된 일정 있으면 변경/제거 picker
  const existing = (state.todaySchedule || []).find(it => it.taskId === taskId && (!it.date || it.date === todayKey()));
  if (existing) {
    const action = await showOptionsModal({
      title: `⏰ ${task.title}`,
      message: `현재 ${existing.start}–${existing.end}`,
      options: [
        { label: '✏️ 시간 변경', value: 'change' },
        { label: '✕ 일정에서 빼기', value: 'remove' },
        { label: '취소', value: 'cancel' }
      ]
    });
    if (action === 'remove') {
      state.todaySchedule = state.todaySchedule.filter(it => it.id !== existing.id);
      task.scheduledStart = null;
      task.scheduledEnd = null;
      saveState();
      renderExecute();
      showToast('일정에서 뺐어');
      return;
    }
    if (action !== 'change') return;
    // change → 아래 흐름으로 이어짐
  }

  const time = await showTimeRangePicker({
    title: `⏰ ${task.title}`,
    startDefault: existing?.start || '',
    endDefault: existing?.end || ''
  });
  if (!time) return;
  const startT = time.start;
  const endT = time.end;
  const todayK = todayKey();

  if (existing) {
    existing.start = startT;
    existing.end = endT;
  } else {
    if (!Array.isArray(state.todaySchedule)) state.todaySchedule = [];
    state.todaySchedule.push({
      id: 'sched_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      title: task.title,
      start: startT,
      end: endT,
      date: todayK,
      source: 'task',
      taskId: taskId,
      color: _V4_TT_COLORS[Math.floor(Math.random() * _V4_TT_COLORS.length)]
    });
  }
  task.scheduledStart = startT;
  task.scheduledEnd = endT;
  saveState();
  renderExecute();
  showToast(`⏰ ${startT} 적용됨`);
}

// V4-1w-1: 일정 → .ics 파일 export (V4 비전 10.4 단방향)
// Google/Apple 캘린더로 import 가능. OAuth 없이 단순 파일 다운.
function _icsEscape(s) {
  return String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function _icsLocalDateTime(dateStr, timeStr) {
  // dateStr 'YYYY-MM-DD' + timeStr 'HH:MM' → '20260427T140000' (local time, no Z)
  const [Y, M, D] = dateStr.split('-');
  const [h, m] = timeStr.split(':');
  return `${Y}${M}${D}T${(h || '00').padStart(2,'0')}${(m || '00').padStart(2,'0')}00`;
}

function _icsUnescape(s) {
  return String(s || '').replace(/\\n/g, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');
}

// ICS 텍스트 → VEVENT 배열 파싱 (단순 파서, RFC 5545 부분 지원)
function parseICS(text) {
  const events = [];
  // line-fold (next line starts with space) 합치기
  const unfolded = text.replace(/\r?\n[ \t]/g, '');
  const lines = unfolded.split(/\r?\n/);
  let current = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') current = {};
    else if (line === 'END:VEVENT') {
      if (current) events.push(current);
      current = null;
    } else if (current) {
      // KEY[;PARAM]:VALUE
      const colon = line.indexOf(':');
      if (colon < 0) continue;
      const keyPart = line.slice(0, colon);
      const val = line.slice(colon + 1);
      const key = keyPart.split(';')[0].toUpperCase();
      if (key === 'SUMMARY') current.summary = _icsUnescape(val);
      else if (key === 'DESCRIPTION') current.description = _icsUnescape(val);
      else if (key === 'DTSTART') current.dtstart = val;
      else if (key === 'DTEND') current.dtend = val;
      else if (key === 'UID') current.uid = val;
    }
  }
  return events;
}

// ICS DTSTART 'YYYYMMDDTHHMMSS' (또는 Z) → { date:'YYYY-MM-DD', time:'HH:MM' }
function _parseICSDate(dt) {
  if (!dt) return null;
  const m = dt.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})/);
  if (!m) return null;
  return { date: `${m[1]}-${m[2]}-${m[3]}`, time: `${m[4]}:${m[5]}` };
}

async function importICSFile() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.ics,text/calendar';
  input.style.display = 'none';
  document.body.appendChild(input);
  input.onchange = async () => {
    const file = input.files && input.files[0];
    document.body.removeChild(input);
    if (!file) return;
    showToast('📥 가져오는 중...');
    try {
      const text = await file.text();
      const events = parseICS(text);
      if (events.length === 0) {
        showToast('이벤트 없는 파일');
        return;
      }
      const todayK = todayKey();
      const todayEvents = events.filter(ev => {
        const s = _parseICSDate(ev.dtstart);
        return s && s.date === todayK;
      });
      const importTarget = todayEvents.length > 0
        ? todayEvents
        : await (async () => {
            const yes = await showConfirmModal({
              title: '오늘 일정 없음',
              message: `${events.length}개 이벤트 중 오늘 항목 없어. 모든 날짜 가져올까?`,
              okLabel: '전부',
              cancelLabel: '취소'
            });
            return yes ? events : [];
          })();
      if (!importTarget.length) return;

      if (!Array.isArray(state.todaySchedule)) state.todaySchedule = [];
      let added = 0;
      importTarget.forEach((ev, i) => {
        const s = _parseICSDate(ev.dtstart);
        const e = _parseICSDate(ev.dtend) || s;
        if (!s || !ev.summary) return;
        // dedupe: 같은 uid 또는 같은 (date, start, summary)
        const dupe = state.todaySchedule.some(x =>
          (ev.uid && x.icsUid === ev.uid) ||
          (x.date === s.date && x.start === s.time && x.title === ev.summary)
        );
        if (dupe) return;
        state.todaySchedule.push({
          id: 'sched_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
          title: ev.summary.slice(0, 60),
          start: s.time,
          end: (e && e.time) || s.time,
          date: s.date,
          source: 'gcal',
          taskId: null,
          note: ev.description ? ev.description.slice(0, 100) : '',
          color: _V4_TT_COLORS[i % _V4_TT_COLORS.length],
          icsUid: ev.uid || null
        });
        added++;
      });
      saveState();
      renderExecute();
      showToast(`📥 ${added}개 일정 가져옴${added < importTarget.length ? ` (${importTarget.length - added}개 중복 skip)` : ''}`);
    } catch (e) {
      console.warn('ICS import failed:', e);
      showToast('가져오기 실패. .ics 파일인지 확인.');
    }
  };
  input.click();
}

// V4-fix: Google 캘린더 연동 (단방향, OAuth X — V5+로 양방향)
// export: 옵션 picker → (a) 각 일정 개별 Google quick-add URL / (b) .ics 파일
// import: 옵션 picker → (a) Google에서 .ics export 안내 / (b) 파일 업로드
async function exportToGoogleCalendar() {
  const items = (state.todaySchedule || []).filter(it => it.title && it.start && it.end);
  if (items.length === 0) {
    showToast('내보낼 일정 없어');
    return;
  }
  const action = await showOptionsModal({
    title: '📤 구글 캘린더로',
    message: `오늘 ${items.length}개 일정 내보내기`,
    options: [
      { label: '🔗 일정별 Google에 추가 (한 개씩)', value: 'gcal_url' },
      { label: '📁 .ics 파일 다운 (Google 캘린더 import)', value: 'ics' },
      { label: '취소', value: 'cancel' }
    ]
  });
  if (action === 'gcal_url') {
    // 각 일정마다 Google quick-add URL 생성 → 새 탭 열기
    const todayK = todayKey();
    const targetItems = items.filter(it => !it.date || it.date === todayK);
    let opened = 0;
    targetItems.forEach((it, i) => {
      setTimeout(() => {
        const url = buildGoogleCalendarURL(it);
        window.open(url, '_blank');
      }, i * 200); // 차례로 열기 (브라우저 팝업 차단 회피)
      opened++;
    });
    showToast(`🔗 ${opened}개 Google 새 탭 열림`);
  } else if (action === 'ics') {
    exportTodayICS();
  }
}

function buildGoogleCalendarURL(it) {
  const date = it.date || todayKey();
  const start = _icsLocalDateTime(date, it.start);  // YYYYMMDDTHHMMSS
  const end = _icsLocalDateTime(date, it.end);
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: it.title,
    dates: `${start}/${end}`,
    ...(it.note ? { details: it.note } : {})
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

async function importFromGoogleCalendar() {
  const action = await showOptionsModal({
    title: '📥 구글 캘린더에서',
    message: '어떻게 가져올까?',
    options: [
      { label: '📁 .ics 파일 가져오기', value: 'ics' },
      { label: '❓ Google에서 .ics 받는 법', value: 'help' },
      { label: '취소', value: 'cancel' }
    ]
  });
  if (action === 'ics') {
    importICSFile();
  } else if (action === 'help') {
    await showConfirmModal({
      title: '❓ Google에서 .ics 받기',
      message: 'Google 캘린더 → 설정 → 캘린더 가져오기/내보내기 → 내보내기 → .zip 다운 → 압축 풀어 .ics 파일 → 여기서 "가져오기".',
      okLabel: '알았어',
      cancelLabel: ''
    });
  }
}

function exportTodayICS() {
  const items = (state.todaySchedule || []).filter(it => it.title && it.start && it.end);
  if (items.length === 0) {
    showToast('내보낼 일정 없어');
    return;
  }
  const todayK = todayKey();
  const targetItems = items.filter(it => !it.date || it.date === todayK);
  if (targetItems.length === 0) {
    showToast('오늘 일정 없어');
    return;
  }

  const dtstamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//soragodong//V4//KR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH'
  ];
  targetItems.forEach(it => {
    const date = it.date || todayK;
    const uid = it.id + '@soragodong';
    lines.push(
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART:${_icsLocalDateTime(date, it.start)}`,
      `DTEND:${_icsLocalDateTime(date, it.end)}`,
      `SUMMARY:${_icsEscape(it.title)}`,
      it.note ? `DESCRIPTION:${_icsEscape(it.note)}` : '',
      'END:VEVENT'
    );
  });
  lines.push('END:VCALENDAR');
  const ics = lines.filter(Boolean).join('\r\n');

  // 파일 다운
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `소라고동_${todayK}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast(`📤 ${targetItems.length}개 일정 내보냄`);
}

// AI 스케줄러 함수 삭제 (사용자 요청 2026-04-28). UI 호출 없는 dead code였음. 일정은 채팅으로만 등록.

async function openV4ScheduleItem(id) {
  const it = (state.todaySchedule || []).find(x => x.id === id);
  if (!it) return;
  const action = await showOptionsModal({
    title: `📅 ${it.title}`,
    message: `${it.start}–${it.end}`,
    options: [
      { label: '🗑 삭제',   value: 'delete' },
      { label: '✏️ 수정',   value: 'edit' },
      { label: '취소',      value: 'cancel' }
    ]
  });
  if (action === 'delete') {
    state.todaySchedule = state.todaySchedule.filter(x => x.id !== id);
    // 연결된 task가 있으면 task.scheduledStart도 비움
    if (it.taskId) {
      const t = (state.tasks || []).find(x => x.id === it.taskId);
      if (t) { t.scheduledStart = null; t.scheduledEnd = null; }
    }
    saveState();
    renderExecute();
    showToast('일정 삭제됨');
  } else if (action === 'edit') {
    const result = await showTimeRangePicker({
      title: `✏️ ${it.title}`,
      startDefault: it.start,
      endDefault: it.end
    });
    if (!result) return;
    it.start = result.start;
    it.end = result.end;
    if (it.taskId) {
      const t = (state.tasks || []).find(x => x.id === it.taskId);
      if (t) { t.scheduledStart = result.start; t.scheduledEnd = result.end; }
    }
    saveState();
    renderExecute();
    showToast('수정됨 ✦');
  }
}

// V4-fix: 시간 범위 picker (input type=time × 2). 알람 picker 느낌.
function showTimeRangePicker(opts) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'input-modal-overlay show time-range-overlay';
    overlay.innerHTML = `
      <div class="input-modal time-range-modal">
        <div class="input-modal-title">${escapeHtml(opts.title || '시간 선택')}</div>
        <div class="time-range-row">
          <div class="time-range-col">
            <label>시작</label>
            <input type="time" id="trStartInput" value="${opts.startDefault || ''}" step="300">
          </div>
          <div class="time-range-arrow">→</div>
          <div class="time-range-col">
            <label>끝</label>
            <input type="time" id="trEndInput" value="${opts.endDefault || ''}" step="300">
          </div>
        </div>
        <div style="display:flex; gap:8px; margin-top:18px;">
          <button class="input-modal-btn" id="trCancel" style="flex:1;">취소</button>
          <button class="input-modal-btn primary" id="trOk" style="flex:1;">확인 ✦</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const cleanup = (val) => {
      overlay.remove();
      resolve(val);
    };
    document.getElementById('trCancel').onclick = () => cleanup(null);
    document.getElementById('trOk').onclick = () => {
      const start = document.getElementById('trStartInput').value;
      const end = document.getElementById('trEndInput').value;
      if (!start || !end) {
        showToast('시작·끝 시간 둘 다 필요');
        return;
      }
      if (start >= end) {
        showToast('끝 시각이 시작 이후여야 해');
        return;
      }
      cleanup({ start, end });
    };
    overlay.onclick = (e) => { if (e.target === overlay) cleanup(null); };
  });
}

// V4-1v: 서랍장 4 그룹 자동 분류 (V4 비전 10.3)
// 🌅 지금 가능 / 📅 나중 / 💭 아이디어 / 🎯 큰 것
let _drawerView = 'auto';  // 'auto' | 'time'

function toggleDrawerView() {
  _drawerView = _drawerView === 'auto' ? 'time' : 'auto';
  renderExecute();
}

// V4-fix #4: 서랍장 그룹 collapse 토글
function toggleDrawerGroup(key) {
  if (!state.preferences) state.preferences = {};
  if (!state.preferences._drawerGroupCollapsed) {
    state.preferences._drawerGroupCollapsed = { now: false, big: false, later: true, idea: true };
  }
  const c = state.preferences._drawerGroupCollapsed;
  c[key] = !c[key];
  saveState();
  renderExecute();
}

// 단순 키워드 + heuristic 분류. 토글로 사용자 직접 변경 가능.
function classifyDrawerTask(task) {
  const text = ((task.title || '') + ' ' + (task.description || '')).toLowerCase();
  // 양생 가닥 후속 = 🎯 큰 것
  if (task.strategyId || task.weight === 'main') return 'big';
  // 조건 대기 키워드 = 📅 나중
  const laterKeywords = /(주말|다음|나중|친구|만나|카페|학교|병원|이번 주말|언젠가|올해|올가을)/;
  if (laterKeywords.test(text)) return 'later';
  // 아이디어 키워드 / 검토용 = 💭 아이디어
  const ideaKeywords = /(아이디어|생각|살펴|검토|찾아보|읽어|배워|언젠가는)/;
  if (ideaKeywords.test(text) && task.weight !== 'main') return 'idea';
  // default = 🌅 지금 가능
  return 'now';
}

async function promoteFromDrawer() {
  const todayKeyVal = todayKey();
  const drawer = (state.tasks || []).filter(t => t.slot === 'drawer' && t.date === todayKeyVal && t.status !== 'done');
  if (drawer.length === 0) {
    showToast('오늘 할 일 다 끝! 잘했어 🐚');
    return;
  }
  const yes = await showConfirmModal({
    title: '오늘의 카드 다 깼어 🐚',
    message: `서랍장에 ${drawer.length}장 더 있어.\n다음 3장 꺼낼까?`,
    okLabel: '꺼낼래',
    cancelLabel: '쉴래'
  });
  if (!yes) return;
  drawer.slice(0, 3).forEach(t => {
    t.slot = 'now3';
    t.status = 'active';
  });
  saveState();
  renderExecute();
  showToast('새 카드 3장 ✦');
}

// === IMMERSE START — V4 redesign (사용자 명시 2026-05-04 ultrathink): 진입장벽 제거 ===
// 옛: task 입력 modal → ritual 모달 (IF-THEN 4 step) → 발사
// 신: 버튼 누르면 즉시 단축어 trigger + start 기록 + active bar
async function openImmerseStart() {
  _quickStart({ taskId: null, taskTitle: null });
}

// 공통 헬퍼 — 즉시 단축어 trigger + state.starts 기록 + localStorage active ritual + active bar
function _quickStart({ taskId, taskTitle }) {
  if (!Array.isArray(state.starts)) state.starts = [];
  const startEntry = {
    id: 'start_' + Date.now(),
    taskId: taskId || null,
    taskTitle: taskTitle || null,
    startIf: null,
    startThen: null,
    obstacle: null,
    plan: null,
    ifThenType: 'none',
    startedAt: new Date().toISOString(),
    returnedAt: null,
    outcome: null
  };
  state.starts.push(startEntry);
  saveState();

  // localStorage 활성 ritual — 새로고침 / 다른 화면 진입 후에도 active bar 복원
  try {
    localStorage.setItem('soragodong_active_ritual', JSON.stringify({
      startId: startEntry.id,
      taskId: taskId || null,
      taskTitle: taskTitle || null,
      startIf: null, startThen: null, obstacle: null, plan: null,
      launchedAt: Date.now()
    }));
  } catch (e) {}

  triggerShortcut();
  showRitualActiveBar();
  showToast(taskTitle ? `🌧 시작 — "${taskTitle}"` : '🌧 시작 — 갔다 와');
}

// V3.13: 서랍장 task 우선순위 다음 번호 계산 (가장 높은 priority + 1)
function getNextDrawerPriority() {
  const drawer = (state.tasks || []).filter(t => t.slot === 'drawer');
  if (drawer.length === 0) return 0;
  const maxP = Math.max(...drawer.map(t => t.priority ?? 0));
  return maxP + 1;
}

// V3.13: 단일 서랍장 task → now3 슬롯으로 승격
function promoteSingleTask(taskId) {
  const task = (state.tasks || []).find(t => t.id === taskId);
  if (!task) return;
  // now3 한도 체크 (3장)
  const todayKeyVal = todayKey();
  const now3Count = (state.tasks || []).filter(t =>
    t.slot === 'now3' && t.status !== 'done' && t.date === todayKeyVal
  ).length;
  if (now3Count >= 3) {
    showToast('⚠ 오늘의 카드 3장 꽉 찼어. 하나 완료하고 다시.');
    return;
  }
  task.slot = 'now3';
  task.date = todayKeyVal;
  saveState();
  renderExecute();
  showToast('↑ 오늘의 카드로 올림 ✦');
}

function triggerShortcut() {
  const useShortcut = state.preferences?.starRitualSettings?.useShortcut !== false;
  const shortcutName = state.preferences?.starRitualSettings?.shortcutName || 'SoraRitual';
  if (useShortcut && /iPhone|iPad|iPod/.test(navigator.userAgent)) {
    setTimeout(() => {
      try {
        window.location.href = `shortcuts://run-shortcut?name=${encodeURIComponent(shortcutName)}`;
      } catch(e) { /* graceful fail */ }
    }, 500);
  }
}

