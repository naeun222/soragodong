// ═══════════════════════════════════════════════════════════════
// AI OUTAGE CIRCUIT BREAKER (2026-10-15)
// ═══════════════════════════════════════════════════════════════
// 배경: 2026-10-15 Anthropic 잔액 소진으로 /api/chat 이 전부 실패하는 동안, 앱은 켤 때마다
//   synthesis / semantic_dedup / forceAnalyze / insight discover 등 자동 LLM 작업을 전부 재시도했다.
//   실패 시 lastXxxAt 타임스탬프가 안 찍히니 쿨다운이 영원히 due 상태 → 새로고침 1번 = 실패 호출 N번.
//   잔액이 돌아와도 같은 구조라, 일시 장애 때마다 비용·로그 폭주.
//
// 해결: 서버 (functions/api/_lib/upstream-error.ts) 가 복구 불가 에러에 `X-AI-Outage: <seconds>` 헤더를 붙인다.
//   클라이언트는 그 시간 동안 "자동" AI 작업만 멈춘다 (사용자가 직접 보내는 채팅은 계속 시도 — 복구 확인 겸).
//   성공 응답 1번이면 즉시 해제.
//
// 저장: localStorage (state 와 분리 — 클라우드 sync / E2EE 와 무관한 기기 로컬 운영 플래그).

const _AI_OUTAGE_LS_KEY = 'sora_ai_outage_until';
const _AI_OUTAGE_REASON_LS_KEY = 'sora_ai_outage_reason';

function _aiOutageUntil() {
  try { return parseInt(localStorage.getItem(_AI_OUTAGE_LS_KEY) || '0', 10) || 0; } catch { return 0; }
}

function _aiOutageActive() {
  return _aiOutageUntil() > Date.now();
}

function _aiOutageSet(seconds, reason) {
  const sec = Math.max(60, Math.min(24 * 3600, parseInt(seconds, 10) || 0));
  const until = Date.now() + sec * 1000;
  try {
    // 더 긴 기존 값은 유지 (짧은 장애가 긴 장애를 덮어쓰지 않게).
    if (until > _aiOutageUntil()) {
      localStorage.setItem(_AI_OUTAGE_LS_KEY, String(until));
      localStorage.setItem(_AI_OUTAGE_REASON_LS_KEY, String(reason || '').slice(0, 80));
    }
  } catch {}
  console.warn(`[ai-outage] 자동 AI 작업 ${Math.round(sec / 60)}분 중지 (${reason || 'unknown'})`);
}

function _aiOutageClear() {
  if (!_aiOutageUntil()) return;
  try {
    localStorage.removeItem(_AI_OUTAGE_LS_KEY);
    localStorage.removeItem(_AI_OUTAGE_REASON_LS_KEY);
  } catch {}
  console.log('[ai-outage] 해제 — AI 응답 정상');
}

// 자동 (백그라운드) AI 작업 진입 가드. 사용자가 직접 누른 동작엔 쓰지 말 것.
function _aiAutoJobsAllowed(tag) {
  if (!_aiOutageActive()) return true;
  const remainMin = Math.ceil((_aiOutageUntil() - Date.now()) / 60000);
  console.log(`[ai-outage] ${tag || 'auto job'} skip — ${remainMin}분 뒤 재개`);
  return false;
}

// fetch Response 를 보고 breaker 갱신. /api/chat, /api/chat-batch 응답에 공통 적용.
function _aiOutageObserveResponse(resp) {
  if (!resp || typeof resp.status !== 'number') return;
  if (resp.ok) { _aiOutageClear(); return; }
  let outage = null;
  try { outage = resp.headers && resp.headers.get('X-AI-Outage'); } catch {}
  if (outage) _aiOutageSet(outage, 'server:' + resp.status);
}
