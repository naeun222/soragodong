async function generateAIResponse(modelOverride) {
  state.chatMessages = state.chatMessages.filter(m => !m.typing);
  state.chatMessages.push({ role: 'assistant', content: '...', typing: true });
  renderChat();

  // 사용자 요청 2026-04-30 (Phase C): apiKey 비어있어도 백엔드 프록시로 동작.
  // session 활성 여부만 체크 (fetch interceptor가 자동으로 /api/chat 라우팅).
  if (!_canAI() &&(typeof session === 'undefined' || !session || !session.access_token)) {
    state.chatMessages[state.chatMessages.length - 1] = {
      role: 'assistant', content: '로그인이 필요해! 새로고침 후 다시 시도해줘 🐚',
      timestamp: new Date().toISOString()
    };
    saveState(); renderChat(); return;
  }

  try {
    // V3.8: 프롬프트 캐싱 — stable 부분 캐시 (90% 비용 절감)
    const promptParts = buildSystemPromptParts();
    const systemBlocks = [];
    if (promptParts.stable && promptParts.stable.length > 0) {
      systemBlocks.push({
        type: 'text',
        text: promptParts.stable,
        // 사용자 요청 2026-04-29 비용절감: 1h cache TTL — ADHD burst+break 패턴, 5분 default 만료 회피 → 헤비 사용자 ~10% 절감.
        cache_control: { type: 'ephemeral' }
      });
    }
    if (promptParts.volatile && promptParts.volatile.length > 0) {
      systemBlocks.push({
        type: 'text',
        text: promptParts.volatile
      });
    }
    
    // V3.8: 현재 챕터(마지막 chapterStart 이후) 메시지만 컨텍스트로
    // 이전 챕터는 caseFormulation/traits/vault에 이미 흡수됨 → 비용 ↓
    const validMsgs = state.chatMessages.filter(m => !m.typing && !m.error);
    let chapterStartIdx = 0;
    for (let i = validMsgs.length - 1; i >= 0; i--) {
      if (validMsgs[i].chapterStart) { chapterStartIdx = i; break; }
    }
    // 사용자 명시 2026-05-02 ultrathink: 챕터 시작 후 cap 25 → 20 (sweet spot 20-30 안 하단).
    // 5h+ 갭이면 archive 이송 후 챕터 비워지므로 단절 위험 낮음. messages 영역 ~15% 토큰 절감.
    const fromChapter = validMsgs.slice(chapterStartIdx);
    const sliced = fromChapter.length > 20
      ? fromChapter.slice(-20)
      : fromChapter.length > 0
        ? fromChapter
        : validMsgs.slice(-20);
    const messages = sliced.map(m => ({ role: m.role, content: m.content }));

    // 사용자 명시 2026-05-01 ultrathink: messages prefix cache_control — 마지막 user 메시지 직전 turn 에 ephemeral breakpoint.
    // 같은 챕터 안 연속 호출 (1h TTL) 시 옛 turn 들이 90% 할인 prefix cache hit. 4단 분석 응답 (~1000 토큰) 비싼 turn 도 cached.
    // breakpoint 위치 매 호출마다 끝쪽으로 이동 — Anthropic 의 prefix-match 자동 cache 패턴 활용.
    if (messages.length >= 2) {
      const _cacheIdx = messages.length - 2;
      const _last = messages[_cacheIdx];
      messages[_cacheIdx] = {
        role: _last.role,
        content: [{ type: 'text', text: _last.content, cache_control: { type: 'ephemeral' } }]
      };
    }

    const response = await callAnthropic({
      _endpoint: 'chat_main',
      // 사용자 요청 2026-04-30 ultrathink Task 7: useOpus 토글 시 Opus, 아니면 Sonnet
      model: modelOverride || ((state.preferences && state.preferences.useOpus) ? 'claude-opus-4-7' : 'claude-sonnet-4-6'),
      max_tokens: 2000,
      stream: true,
      system: systemBlocks,
      messages
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('API error response:', err);
      let parsed = {};
      try { parsed = JSON.parse(err); } catch {}
      // 사용자 요청 2026-04-30: 402 (잔액·cap 도달) → 결제 모달 자동 표시 (Claude 패턴)
      // Phase 1c: 게스트 한도 도달 = 가입 유도 모달 (별도). 인증 사용자 = 기존 결제 모달.
      if (response.status === 402) {
        if (state.chatMessages[state.chatMessages.length - 1]?.typing) state.chatMessages.pop();
        saveState(); renderChat();
        if (parsed.code === 'GUEST_LIMIT' || (state.isGuest && typeof showGuestConversionModal === 'function')) {
          if (typeof showGuestConversionModal === 'function') {
            showGuestConversionModal({ reason: 'limit' });
          }
        } else if (typeof showBudgetExceededModal === 'function') {
          showBudgetExceededModal(parsed.error || '잔액 / 한도 도달');
        }
        return;
      }
      // Phase 1c: Turnstile 검증 실패 — 페이지 새로고침 안내.
      if (response.status === 403 && parsed.code === 'TURNSTILE_FAIL') {
        if (state.chatMessages[state.chatMessages.length - 1]?.typing) state.chatMessages.pop();
        saveState(); renderChat();
        if (typeof showToast === 'function') showToast('🔄 봇 검증 — 페이지 새로고침 필요');
        return;
      }
      // 사용자 명시 2026-05-02 ultrathink: Opus Premium 전용 + 일일 30번 한도 응답 처리.
      if (response.status === 403 && parsed.code === 'OPUS_PREMIUM_ONLY') {
        if (state.chatMessages[state.chatMessages.length - 1]?.typing) state.chatMessages.pop();
        // Sonnet 으로 자동 fallback
        state.preferences.useOpus = false;
        if (typeof updateChatModeBtn === 'function') updateChatModeBtn();
        saveState(); renderChat();
        showToast('🦉 Opus 깊은 대화는 Premium 에서만');
        if (typeof openSubscribeModal === 'function') {
          setTimeout(() => openSubscribeModal(), 700);
        }
        return;
      }
      if (response.status === 429 && parsed.code === 'OPUS_DAILY_LIMIT') {
        if (state.chatMessages[state.chatMessages.length - 1]?.typing) state.chatMessages.pop();
        // Sonnet 으로 자동 fallback
        state.preferences.useOpus = false;
        if (typeof updateChatModeBtn === 'function') updateChatModeBtn();
        saveState(); renderChat();
        if (typeof showOpusLimitReachedModal === 'function') {
          showOpusLimitReachedModal();
        } else {
          showToast('🫂 오늘 깊은 대화 다 나눴네');
        }
        return;
      }
      // V3.13.x: 응답 본문에서 message 추출해서 사용자에게 보여주기
      // V4 (사용자 보고 2026-05-05 ultrathink-3): err 가 HTML (Cloudflare 자체 5xx 페이지) 면 <title> 추출.
      // backend Worker 가 응답 못 했을 때 Cloudflare 가 자체 페이지 반환 — 진짜 error code (520/522/524 등) 가 title 안에 있음.
      let detail = '';
      if (parsed.error?.message) {
        detail = ' — ' + parsed.error.message.slice(0, 200);
      } else if (err) {
        const _trimmed = err.trimStart();
        if (_trimmed.startsWith('<!DOCTYPE') || _trimmed.startsWith('<html') || _trimmed.startsWith('<!--')) {
          const _titleMatch = err.match(/<title>([^<]+)<\/title>/i);
          if (_titleMatch) {
            detail = ' — Cloudflare: ' + _titleMatch[1].trim().slice(0, 200);
          } else {
            detail = ' — (HTML 응답 — backend Worker 응답 X. Cloudflare Real-time Logs 확인.)';
          }
        } else {
          detail = ' — ' + err.slice(0, 200);
        }
      }
      throw new Error('API ' + response.status + detail);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    state.chatMessages[state.chatMessages.length - 1] = { role: 'assistant', content: '', timestamp: new Date().toISOString() };

    // V4.0: 스트리밍 부분 업데이트 — 첫 청크만 renderChat (빈 bubble DOM 생성), 이후엔 마지막 bubble innerHTML만 갱신.
    // 이전: 매 청크마다 전체 메시지 N개 escape+format 재생성 → 200+ 메시지에서 lag.
    let _streamFirstChunk = true;
    let _streamPending = null;
    let _streamRafId = null;
    const flushStreamUpdate = () => {
      _streamRafId = null;
      if (_streamPending === null) return;
      const text = _streamPending; _streamPending = null;
      const container = document.getElementById('chatMessages');
      if (!container) return;
      const bubbles = container.querySelectorAll('.msg.assistant .msg-bubble');
      const lastBubble = bubbles[bubbles.length - 1];
      if (!lastBubble) return;
      // formatAIResponse 호출은 1개 bubble만 → 전체 재렌더보다 압도적으로 빠름.
      // ⋮ 메뉴 버튼은 typing/error 아닌 메시지에만 붙는데, 스트리밍 중엔 typing 끝난 상태라
      // renderChat이 이미 menuBtn을 포함해서 그렸음. 우린 .innerHTML로 통째 교체하니
      // formatAIResponse 결과 + menuBtn HTML을 같이 써줘야 함.
      const lastIdx = state.chatMessages.length - 1;
      lastBubble.innerHTML = formatAIResponse(text) +
        `<button class="msg-menu-btn" onclick="showMessageMenu(${lastIdx})" aria-label="더보기">⋮</button>`;
      // 사용자 요청 2026-04-29 (final): _stuckToBottom 일 때만 streaming 자동 스크롤 (ChatGPT 표준)
      // 사용자가 위로 스크롤한 상태면 자동 스크롤 X — 칩으로 새 메시지 알림.
      if (_stuckToBottom) {
        const screen = document.getElementById('screen-chat');
        if (screen) screen.scrollTop = screen.scrollHeight;
      }
    };
    const scheduleStreamUpdate = (text) => {
      _streamPending = text;
      if (_streamRafId !== null) return;
      _streamRafId = requestAnimationFrame(flushStreamUpdate);
    };

    // V4 (사용자 보고 2026-05-03): SSE chunk *line buffer* 누락 fix — chunk 가 line 중간에서 끝나면 split 시 마지막 불완전 line 이 잘려 다음 chunk 첫 line 과 합쳐야 하는데 안 됨 → delta text 누락 → 답변 중간 끊김.
    let _sseBuffer = '';  // 불완전 line 보관
    const _processSSELine = (line) => {
      if (!line.startsWith('data: ')) return;
      const data = line.slice(6);
      if (data === '[DONE]') return;
      try {
        const parsed = JSON.parse(data);
        // V4 (사용자 보고 2026-05-03): error type 처리 — silent fail 차단. throw → catch 분기에서 사용자 메시지 표시.
        if (parsed.type === 'error') {
          const _emsg = parsed.error?.message || 'Anthropic SSE error';
          throw new Error('SSE error: ' + _emsg);
        }
        if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
          fullText += parsed.delta.text;
          let display = fullText;
          display = display.replace(/```json[\s\S]*?```/g, '');
          display = display.replace(/```json[\s\S]*$/g, '');
          display = display.replace(/```[\s\S]*$/g, ''); // 미완성 fence
          display = display.replace(/\n*\{[\s\S]*$/g, (match) => {
            if (/"(?:new_traits|new_values|new_patterns|insight|case_formulation|proposal|extracted_tasks|extracted_schedule|extracted_pearls|decision_suggested)/.test(match)) {
              return '';
            }
            return match;
          });
          // V3.12.x: orphan JSON 키 (앞에 { 없이 시작) 잡기 — streaming 중 잘렸을 때
          display = display.replace(/[\s,]*"(?:new_traits|new_values|new_patterns|insight|case_formulation|proposal|extracted_tasks|extracted_schedule|extracted_pearls|decision_suggested)"[\s\S]*$/g, '');
          display = display.trim();
          state.chatMessages[state.chatMessages.length - 1].content = display;
          if (_streamFirstChunk) {
            renderChat();  // 첫 청크: 빈 bubble DOM 생성
            _streamFirstChunk = false;
          } else {
            scheduleStreamUpdate(display);  // 이후: 마지막 bubble innerHTML만 갱신
          }
        }
      } catch (parseErr) {
        // SSE error type → 위로 throw (user-facing 메시지 분기 진입)
        if (parseErr && parseErr.message && parseErr.message.startsWith('SSE error:')) throw parseErr;
        // JSON parse 실패 — silent skip (일반 처리)
      }
    };
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      // V4 fix: chunk + 직전 buffer 결합 후 line 단위로 split. 마지막 line 이 *불완전* 가능성 (newline 없이 잘림) → buffer 보관, 다음 chunk 와 합침.
      _sseBuffer += decoder.decode(value, { stream: true });
      const lines = _sseBuffer.split('\n');
      _sseBuffer = lines.pop() || '';  // 마지막 = 불완전 line (다음 chunk 와 합치기 위해 보관)
      for (const line of lines) {
        _processSSELine(line);
      }
    }
    // 스트리밍 끝 — buffer 잔여 처리 (마지막 line 이 newline 없이 끝났다면)
    if (_sseBuffer) {
      _processSSELine(_sseBuffer);
      _sseBuffer = '';
    }
    if (_streamRafId !== null) {
      cancelAnimationFrame(_streamRafId);
      flushStreamUpdate();
    }

    // Extract analysis JSON
    const jsonMatch = fullText.match(/```json\s*([\s\S]*?)\s*```/);
    let analysisData = null;
    if (jsonMatch) {
      try {
        analysisData = JSON.parse(jsonMatch[1]);
        await processAnalysis(analysisData, state.chatMessages.length - 1);
      } catch (e) { console.error('Analysis parse error:', e); }
    } else {
      const rawJsonMatch = fullText.match(/\{[\s\S]*"(?:new_traits|new_values|new_patterns|insight|proposal|extracted_tasks|decision_suggested)[\s\S]*\}/);
      if (rawJsonMatch) {
        try {
          analysisData = JSON.parse(rawJsonMatch[0]);
          await processAnalysis(analysisData, state.chatMessages.length - 1);
        } catch (e) {}
      }
    }

    const finalDisplay = fullText
      .replace(/```json[\s\S]*?```/g, '')
      .replace(/```[\s\S]*$/g, '')
      .replace(/\{[\s\S]*"(?:new_traits|new_values|new_patterns|insight|case_formulation|proposal|extracted_tasks|extracted_schedule|extracted_pearls|decision_suggested)[\s\S]*\}/g, '')
      .replace(/[\s,]*"(?:new_traits|new_values|new_patterns|insight|case_formulation|proposal|extracted_tasks|extracted_schedule|extracted_pearls|decision_suggested)"[\s\S]*$/g, '')
      .trim();
    state.chatMessages[state.chatMessages.length - 1].content = finalDisplay;

    // V3.13.x: 4단 응답 ([오늘의 제안] 또는 다른 4단 라벨 포함) 판정
    // askDeeper로 트리거됐든, 사용자 직접 '어떡하지' 등 도움 요청 → 자동 4단이든 다 해당
    // → fromDeeper(전략으로) + proposal(해볼게) 두 버튼 노출
    const has4Stage = /\[내가 본 것\]|\[이게 뭐냐면\]|\[오늘의 제안\]/.test(fullText);
    if (has4Stage) {
      state.chatMessages[state.chatMessages.length - 1].fromDeeper = true;
      // V4 (v8 묶음 3): [상황] 추출 → message.situation stash → acceptProposal 시 mission.situation 으로 전달
      const sitMatch = fullText.match(/\[상황\]\s*([\s\S]*?)(?=\n*\[내가 본 것\]|\n*\[이게 뭐냐면\]|\n*\[이럴 땐 이렇게\]|\n*\[오늘의 제안\]|$)/);
      if (sitMatch && sitMatch[1] && sitMatch[1].trim()) {
        state.chatMessages[state.chatMessages.length - 1].situation = sitMatch[1].trim().slice(0, 200);
      }
    }

    // Check for proposal in response
    if (fullText.includes('[오늘의 제안]') || (analysisData && analysisData.proposal)) {
      state.chatMessages[state.chatMessages.length - 1].proposal = true;
      if (analysisData && analysisData.proposal) {
        state.chatMessages[state.chatMessages.length - 1].proposalData = analysisData.proposal;
      }
    }

    saveState();
    renderChat();
    renderModelPreview();

    // 사용자 명시 2026-05-06: 미구독/게스트 = 3턴마다 자동 모델 갱신 (forceAnalyze auto). 게스트와 똑같이.
    if (typeof _maybeAutoForceAnalyzeFreeTier === 'function') {
      _maybeAutoForceAnalyzeFreeTier().catch(e => console.warn('[auto force]', e));
    }

  } catch (err) {
    // 사용자 보고 2026-05-05 ultrathink: 정확한 진단 위해 console.error — 사용자가 console 열어 진짜 원인 (status / message) 확인 가능.
    console.error('[generateAIResponse] error:', err);
    // 사용자 보고 2026-05-05 (audit Medium): _streamRafId 가 catch 시점에 살아있으면 cancel — 안 그러면 에러 메시지 위에 partial RAF flush 가 덮여 깜빡임.
    if (typeof _streamRafId !== 'undefined' && _streamRafId !== null) {
      try { cancelAnimationFrame(_streamRafId); } catch {}
      _streamRafId = null;
    }
    // 사용자 요청 2026-04-28: 에러 종류별 명확한 메시지 (이전엔 'err.message' 그대로 노출 — 이해 어려움)
    // 사용자 보고 2026-04-30 ultrathink: Phase C 마이그 후 키 모델 폐기 — 401은 session 만료. 메시지 분기.
    const m = (err && err.message) || '';
    let userMsg;
    if (/401/.test(m) || /authentication/i.test(m) || /invalid.*api.*key/i.test(m) || /api[_ ]?key/i.test(m)) {
      // 사용자 명시 2026-05-01 (agent audit): state.apiKey 영구 wipe (마이그레이션) 후 Phase C 백엔드 프록시 — 본인 키 분기 dead. session 만료 분기만 보존.
      if (typeof session !== 'undefined' && session && session.access_token) {
        userMsg = '⏰ 로그인 세션이 만료된 것 같아.\n\n페이지 새로고침 또는 로그아웃 → 다시 로그인 해줘.';
      } else {
        userMsg = '🔑 로그인 필요 — 다시 로그인 해줘.';
      }
    } else if (/429/.test(m) || /rate[_ ]?limit/i.test(m) || /quota/i.test(m)) {
      userMsg = '⏳ 잠깐 너무 빨라. 1분 정도 후 다시 시도하거나 Anthropic 대시보드에서 사용량 확인해봐.';
    } else if (/network|failed to fetch|offline/i.test(m) || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
      userMsg = '📡 인터넷 연결을 확인해봐.\n\n복구되면 "다시 보내기" 눌러줘.';
    } else if (/5\d\d/.test(m) || /overloaded/i.test(m)) {
      // 사용자 보고 2026-05-05 ultrathink-2: 5xx 토스트가 계속 나와도 진짜 원인 (env 누락 / Anthropic overloaded / 모델 ID 거부 등) 안 보임.
      // err.message = 'API 500 — <body snippet>' 형태 — 'API XXX —' prefix 제거 후 detail 만 토스트에 노출.
      // backend (functions/api/chat.ts) 가 Anthropic 응답 본문 그대로 forward 하므로 진단 텍스트 (e.g., 'ANTHROPIC_API_KEY 미설정', 'overloaded_error') 가 detail 에 포함됨.
      const _statusMatch = m.match(/(\b5\d\d\b)/);
      const _status = _statusMatch ? ` (${_statusMatch[1]})` : '';
      const _detail = m.replace(/^API\s+\d+\s*(—\s*)?/, '').trim().slice(0, 200);
      const _looksLikeBareCode = !_detail || /^\d{3}$/.test(_detail);
      const _detailLine = _looksLikeBareCode ? '' : `\n\n${_detail}`;
      userMsg = `⚠️ AI 서버 일시 과부하${_status} — 자동 재시도 후에도 실패. 1-2분 후 다시 보내기.${_detailLine}`;
      // 사용자 명시 2026-05-05: 5xx 자동 개발자 보고 (1h dedupe — 같은 signature 1시간 안 1번만).
      if (typeof reportError === 'function') {
        let _sig = 'chat-5xx';
        if (_statusMatch) _sig += `-${_statusMatch[1]}`;
        const _cfMatch = m.match(/Cloudflare:\s*([^|<\n]+)/i);
        if (_cfMatch) _sig += `|cf=${_cfMatch[1].trim().slice(0, 80)}`;
        else _sig += `|${_detail.slice(0, 80)}`;
        reportError({ signature: _sig, detail: m, stack: err.stack });
      }
    } else {
      userMsg = '연결이 안 됐어 😅\n(' + (m || '알 수 없는 오류') + ')\n\n다시 보내기 버튼을 눌러봐.';
    }
    // V4 (사용자 보고 2026-05-04 VB024): 스트리밍 도중 끊겨도 부분 응답 유지 — 옛 코드는 lastMsg 통째 교체 → 80% 받은 답변도 사라짐.
    // partial content 가 있으면 보존 + 끊김 안내만 suffix 로 붙임. 없으면 옛 동작 (full error 메시지).
    const _lastIdx = state.chatMessages.length - 1;
    const _lastMsg = state.chatMessages[_lastIdx];
    const _hasPartial = _lastMsg && !_lastMsg.typing && typeof _lastMsg.content === 'string' && _lastMsg.content.trim().length > 30;
    if (_hasPartial) {
      _lastMsg.content = _lastMsg.content.trimEnd() + '\n\n— ⚠️ 답변 도중 끊김 — 다시 보내기로 이어가';
      _lastMsg.error = true;
      _lastMsg.canRetry = true;
      _lastMsg.partial = true;
      _lastMsg.timestamp = _lastMsg.timestamp || new Date().toISOString();
    } else {
      state.chatMessages[_lastIdx] = {
        role: 'assistant',
        content: userMsg,
        error: true,
        canRetry: true,
        timestamp: new Date().toISOString()
      };
    }
    saveState(); renderChat();
  }
}

