// 사용자 요청 2026-05-11: 영상 마케팅 직후 신규 가입자 / 게스트 / 활동 / 결제 / 유입 콘솔 도구.
// DevTools 콘솔에서 recentUsers() 한 줄 → /api/admin/recent-users → console.table.
// 백엔드는 functions/api/admin/recent-users.ts. ADMIN_USER_ID env 로 서버 검증.
//
// 사용 예:
//   recentUsers()                                  // 24h 전체, 활동/결제/유입 join 포함
//   recentUsers({ since: '7d' })                   // 7일
//   recentUsers({ since: 'all', limit: 200 })      // 전부
//   recentUsers({ joins: 'none' })                 // 가입 기본 정보만 (빠름)
//   recentUsers({ joins: 'activity,billing' })     // 일부 join 만
//   recentGuests()                                 // 게스트만, 100명
//   recentSignups({ since: '7d' })                 // 7일 실가입만

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
  const joins = typeof opts.joins === 'string' ? opts.joins : '';  // '' = 기본 전부, 'none' = 가입 정보만
  const qs = new URLSearchParams({ limit: String(limit), since: String(since), filter: String(filter) });
  if (joins) qs.set('joins', joins);

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
  const summary = (data && data.summary) || { total: users.length, guests: 0, real: 0, withActivity: 0, paid: 0 };

  console.log(
    '%c최근 ' + since + ' 신규 ' + summary.total + '명 — 실가입 ' + summary.real + ' / 게스트 ' + summary.guests
    + ' · 활동 ' + summary.withActivity + ' · 유료 ' + summary.paid,
    'font-weight:bold; color:#3a7afe'
  );

  console.table(users.map(function (u) {
    return {
      가입시각: u.createdAt ? new Date(u.createdAt).toLocaleString('ko-KR') : '-',
      이메일: u.isGuest ? '(게스트)' : (u.email || '(없음)'),
      경로: u.provider || 'email',
      마지막활동: u.lastActivityAt ? new Date(u.lastActivityAt).toLocaleString('ko-KR') : '-',
      메시지: typeof u.messageCount === 'number' ? u.messageCount : '-',
      plan: u.plan || (u.subscriptionActive ? '구독중' : '-'),
      잔액USD: u.creditBalanceUsd != null ? Number(u.creditBalanceUsd).toFixed(4) : '-',
      utm: u.utmSource ? (u.utmSource + (u.utmCampaign ? '/' + u.utmCampaign : '')) : '-',
      referer: u.referer ? (function () { try { return new URL(u.referer).hostname; } catch { return u.referer.slice(0, 30); } })() : '-',
      id: u.id || '',
    };
  }));
  console.log('[recentUsers] raw 데이터는 return 값 (users 배열) 에 있음. 예: var u = await recentUsers(); u[0]');
  return users;
}

async function recentGuests(opts) {
  return recentUsers(Object.assign({ limit: 100 }, opts || {}, { filter: 'guests' }));
}

async function recentSignups(opts) {
  return recentUsers(Object.assign({ limit: 100 }, opts || {}, { filter: 'signups' }));
}
