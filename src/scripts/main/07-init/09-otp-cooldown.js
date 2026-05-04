// 사용자 명시 2026-05-02: OTP 60초 쿨타임 — alert() 대신 button inline countdown.
let _otpCooldownTimer = null;
function _startOtpCooldownUI(seconds) {
  const btn = document.getElementById('loginBtn');
  const status = document.getElementById('loginStatus');
  if (!btn) return;
  if (_otpCooldownTimer) { clearInterval(_otpCooldownTimer); _otpCooldownTimer = null; }
  let remaining = Math.max(1, Math.ceil(seconds));
  const restoreText = '로그인 코드 받기 ✦';
  function tick() {
    if (remaining <= 0) {
      clearInterval(_otpCooldownTimer); _otpCooldownTimer = null;
      btn.disabled = false;
      btn.textContent = restoreText;
      if (status) { status.textContent = ''; status.style.color = ''; }
      return;
    }
    btn.disabled = true;
    btn.textContent = `⏳ ${remaining}초 후 다시 받기`;
    if (status) {
      status.textContent = '잠깐 — 이메일 OTP 60초 쿨타임이야.';
      status.style.color = 'var(--text-soft)';
    }
    remaining -= 1;
  }
  tick();
  _otpCooldownTimer = setInterval(tick, 1000);
}
function _checkOtpCooldownAndStart() {
  try {
    const lastSent = parseInt(localStorage.getItem('soragodong_v4_last_otp_at') || '0', 10);
    if (!lastSent) return false;
    const elapsed = Date.now() - lastSent;
    if (elapsed >= 60000) return false;
    _startOtpCooldownUI(Math.ceil((60000 - elapsed) / 1000));
    return true;
  } catch { return false; }
}

async function handleSendCode() {
  const emailInput = document.getElementById('loginEmail');
  const email = emailInput.value.trim();
  if (!email || !email.includes('@')) {
    const status = document.getElementById('loginStatus');
    if (status) { status.textContent = '이메일을 정확히 입력해줘.'; status.style.color = 'var(--danger)'; }
    return;
  }

  // 사용자 명시 2026-05-02: 60s cooldown — alert() 대신 inline countdown.
  if (_checkOtpCooldownAndStart()) return;

  // 사용자 명시 2026-05-02: 동의는 신규 = 비밀번호 설정 모달 안에서 (로그인 화면 X). 단 loginMethod 넣어둠.
  try {
    localStorage.setItem('soragodong_pending_consent', JSON.stringify({
      email, loginMethod: 'email', at: new Date().toISOString()
    }));
  } catch {}

  const btn = document.getElementById('loginBtn');
  const status = document.getElementById('loginStatus');
  btn.disabled = true;
  btn.textContent = '전송 중...';
  status.textContent = '';

  try {
    await sendOTP(email);
    // 사용자 명시 2026-05-01 (agent audit): rate limit 추적용 timestamp 넣음.
    try { localStorage.setItem('soragodong_v4_last_otp_at', String(Date.now())); } catch {}
    // Move to step 2
    document.getElementById('loginStep1').style.display = 'none';
    document.getElementById('loginStep2').style.display = 'block';
    document.getElementById('loginEmailDisplay').textContent = email;
    // Store email for verification
    document.getElementById('loginStep2').dataset.email = email;
    setTimeout(() => document.getElementById('loginCode').focus(), 100);
  } catch (err) {
    // 사용자 명시 2026-05-01 (agent audit): Supabase rate-limit 영문 에러 한국어 매핑.
    const m = (err && err.message) || '';
    if (/rate.*limit|too many|60.?seconds?/i.test(m)) {
      // 서버 rate limit — timestamp 기록 후 inline countdown.
      try { localStorage.setItem('soragodong_v4_last_otp_at', String(Date.now())); } catch {}
      _startOtpCooldownUI(60);
      return;
    }
    const userMsg = /network|failed to fetch|offline/i.test(m)
      ? '인터넷 연결 확인해줘.'
      : '오류: ' + (m || '알 수 없음');
    status.textContent = userMsg;
    status.style.color = 'var(--danger)';
    btn.disabled = false;
    btn.textContent = '로그인 코드 받기 ✦';
  }
}

async function handleVerifyCode() {
  const email = document.getElementById('loginStep2').dataset.email;
  const codeInput = document.getElementById('loginCode');
  const code = codeInput.value.trim();
  if (!code || code.length < 6) { alert('이메일에 받은 코드를 입력해줘'); return; }

  const btn = document.getElementById('verifyBtn');
  const status = document.getElementById('verifyStatus');
  btn.disabled = true;
  btn.textContent = '확인 중...';
  status.textContent = '';

  try {
    await verifyOTP(email, code);
    status.textContent = '✓ 로그인 성공! 잠시만...';
    status.style.color = 'var(--success)';
    setTimeout(() => location.reload(), 600);
  } catch (err) {
    status.textContent = '오류: ' + err.message + ' — 코드를 다시 확인해줘.';
    status.style.color = 'var(--danger)';
    btn.disabled = false;
    btn.textContent = '로그인';
    codeInput.value = '';
    codeInput.focus();
  }
}

function resetLoginFlow() {
  document.getElementById('loginStep1').style.display = 'block';
  document.getElementById('loginStep2').style.display = 'none';
  document.getElementById('loginCode').value = '';
  document.getElementById('loginStatus').textContent = '';
  document.getElementById('verifyStatus').textContent = '';
  document.getElementById('loginBtn').disabled = false;
  document.getElementById('loginBtn').textContent = '로그인 코드 받기 ✦';
  // 사용자 명시 2026-05-02: cooldown 잔여 있으면 inline countdown 복원.
  if (typeof _checkOtpCooldownAndStart === 'function') _checkOtpCooldownAndStart();
}

