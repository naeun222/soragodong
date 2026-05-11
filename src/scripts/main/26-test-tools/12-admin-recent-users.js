// 사용자 요청 2026-05-11: 영상 마케팅 직후 신규 가입자 / 게스트 현황 확인용 콘솔 도구.
// DevTools 콘솔에서 recentUsers() 한 줄 → /api/admin/recent-users 호출 → console.table 출력.
// 백엔드는 별도 repo (Phase 1: auth.users 만 조회). 서버는 ADMIN_USER_ID env 로 검증, 클라 _isAdmin() 은 UI 가드일 뿐.

async function recentUsers(opts) {
  opts = opts || {};
  if (typeof _isAdmin === 'function' && !_isAdmin()) {
    console.warn('admin 권한 필요 — ADMIN_UID 로 로그인 후 다시 시도.');
    return;
  }
  if (!session || !session.access_token) {
    console.warn('로그인 필요.');
    return;
  }
  const limit = opts.limit || 50;
  const since = opts.since || '24h';        // 24h / 7d / 30d / all
  const filter = opts.filter || 'all';       // all / guests / signups
  const qs = new URLSearchParams({ limit: String(limit), since: String(since), filter: String(filter) });
  let resp;
  try {
    resp = await _authedFetch('/api/admin/recent-users?' + qs.toString());
  } catch (e) {
    console.error('[recentUsers] fetch 실패:', (e && e.message) || e);
    return;
  }
  if (!resp.ok) {
    console.error('[recentUsers] 백엔드 오류 status=' + resp.status + ' (endpoint 배포 / ADMIN_USER_ID env 확인)');
    return;
  }
  let data;
  try { data = await resp.json(); } catch (e) { console.error('[recentUsers] JSON 파싱 실패:', e); return; }
  const users = (data && data.users) || [];
  const summary = (data && data.summary) || { total: users.length, guests: 0, real: 0 };
  console.log(
    '%c최근 ' + since + ' 신규 ' + summary.total + '명 (실가입 ' + summary.real + ' / 게스트 ' + summary.guests + ')',
    'font-weight:bold; color:#3a7afe'
  );
  console.table(users.map(function (u) {
    return {
      가입시각: u.createdAt ? new Date(u.createdAt).toLocaleString('ko-KR') : '-',
      이메일: u.isGuest ? '(게스트)' : (u.email || '(없음)'),
      경로: u.provider || 'email',
      마지막로그인: u.lastSignInAt ? new Date(u.lastSignInAt).toLocaleString('ko-KR') : '-',
      id: u.id || '',
    };
  }));
  return users;
}

async function recentGuests(opts) {
  return recentUsers(Object.assign({ limit: 100 }, opts || {}, { filter: 'guests' }));
}

async function recentSignups(opts) {
  return recentUsers(Object.assign({ limit: 100 }, opts || {}, { filter: 'signups' }));
}
