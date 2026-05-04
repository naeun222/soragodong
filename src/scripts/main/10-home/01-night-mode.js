// ═══════════════════════════════════════════════════════════════
// V6 HOME — Today's Shell, Night Mode, Conditional Decision, SOS
// ═══════════════════════════════════════════════════════════════

function isNightTime() {
  // Manual override first
  if (state.preferences?.nightModeManual === 'on') return true;
  if (state.preferences?.nightModeManual === 'off') return false;
  // Auto: 21:00 ~ DAY_CUTOFF_HOUR (4시) — 체크인 "그 날" 윈도우와 일치
  const hour = new Date().getHours();
  return hour >= 21 || hour < DAY_CUTOFF_HOUR;
}

function applyNightMode() {
  const isNight = isNightTime();
  document.body.classList.toggle('night-mode', isNight);
  // Update greeting based on time
  const hour = new Date().getHours();
  const greetingMain = document.getElementById('greetingMain');
  const greetingSub = document.getElementById('greetingSub');
  if (greetingMain && greetingSub) {
    // V3.7: greetingSub은 init에서 날짜로 설정됨. 여기선 main만 업데이트.
    if (isNight) {
      const greeting = hour >= 21 ? '오늘 수고했어 🌙' : '아직 깨어있구나 🌙';
      greetingMain.innerHTML = greeting + ' <span class="accent">✦</span>';
    } else {
      const greeting = hour < 11 ? '좋은 아침 ☀️' : hour < 18 ? '오후도 잘 🌤' : '저녁이네 🌅';
      greetingMain.innerHTML = greeting + ' <span class="accent">✦</span>';
    }
  }
}

// Main action card — 시간대에 따라 (밤=체크인 / 낮=실행) 자동 변경
