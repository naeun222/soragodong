#!/usr/bin/env node
// scripts/recover-user-data.mjs
// V4 (사용자 명시 2026-05-18) — 17명 계정 데이터 복구 one-off 스크립트.
//
// 목적:
//   특정 사용자의 main row(me_v4) 가 비어있거나 파괴됐을 때,
//   V3→V4 마이그레이션 시 자동 생성된 backup row(backup_v6_pre_v7) 데이터를
//   main row 로 복원.
//
// 흐름:
//   1. `--diagnose` (기본) — read-only. 각 사용자의 auth + main + backup + legacy row 상태 출력.
//   2. `--apply --email=foo@bar.com` — backup 데이터 → main row 덮어쓰기. 1명씩.
//
// 사용법 (PowerShell):
//   $env:SUPABASE_URL = "https://xxxxx.supabase.co"
//   $env:SUPABASE_SERVICE_ROLE_KEY = "<service_role key — Dashboard → Project Settings → API>"
//
//   # 17명 진단
//   node scripts/recover-user-data.mjs --diagnose --emails-file=scripts/recover-emails.local.txt
//
//   # 단일 사용자 진단
//   node scripts/recover-user-data.mjs --diagnose --email=foo@bar.com
//
//   # 복원 (1명씩, dry-run 먼저)
//   node scripts/recover-user-data.mjs --apply --email=foo@bar.com --source=manual_backup --dry-run
//   node scripts/recover-user-data.mjs --apply --email=foo@bar.com --source=manual_backup --confirm --force
//
//   source 옵션:
//     v6_pre_v7      (기본) — backup_v6_pre_v7 row (V3→V4 마이그 백업)
//     tester_backup           — me_v4_backup row (testerMode ON 직전)
//     manual_backup           — me_v4_manual_backup row, snapshots[] (사용자 트리거)
//     auto_backup             — me_v4_auto_backup row, snapshots[] (주 1회 + version)
//
//   snapshots[] source 인 경우 --snapshot-idx=N (기본 = 최신).
//   main 에 E2EE 본문 / plain 내용 있을 땐 --force 추가 필요.
//
// 안전 장치:
//   - service_role 키는 RLS 우회 → 매우 강력. 절대 commit / 노출 X.
//   - --apply 는 --confirm 없으면 dry-run.
//   - main row 에 데이터 있으면 (cluster size > 1KB plain content) --apply 도 거부 → --force 필요.
//   - 모든 write 전에 현재 main row 상태를 stdout 에 출력 → 사용자가 검증 가능.

import { readFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('❌ env 누락: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY 설정 필요.');
  console.error('   PowerShell:');
  console.error('     $env:SUPABASE_URL = "https://xxxxx.supabase.co"');
  console.error('     $env:SUPABASE_SERVICE_ROLE_KEY = "eyJ..."');
  process.exit(1);
}

const SB_HEADERS = {
  apikey: SERVICE_ROLE,
  Authorization: `Bearer ${SERVICE_ROLE}`,
};

const V4_USER_ID = 'me_v4';
const V4_BACKUP_USER_ID = 'backup_v6_pre_v7';

// ─────────── CLI parsing ───────────
const args = process.argv.slice(2);
const argMap = {};
for (const a of args) {
  if (a.startsWith('--')) {
    const eq = a.indexOf('=');
    if (eq === -1) argMap[a.slice(2)] = true;
    else argMap[a.slice(2, eq)] = a.slice(eq + 1);
  }
}
const MODE = argMap.apply ? 'apply' : 'diagnose';
// write 명령 (apply 또는 merge) 시 --confirm 없으면 자동 dry-run.
const DRY_RUN = !!argMap['dry-run'] || ((MODE === 'apply' || argMap.merge) && !argMap.confirm);
const FORCE = !!argMap.force;

// ─────────── helpers ───────────

// GoTrue admin 의 `?email=` filter 가 무시되는 deployment 가 있음 → 전체 list 페이지네이션 후
// client-side 에서 email map 구성. 한 번만 하면 됨 (전체 사용자 ~수백명 수준 가정).
let _authUserMapCache = null;
let _authUserListCache = null;
async function loadAllAuthUsers() {
  if (_authUserMapCache) return _authUserMapCache;
  const map = new Map();
  const list = [];
  const PER_PAGE = 1000;
  let page = 1;
  while (true) {
    const u = `${SUPABASE_URL}/auth/v1/admin/users?page=${page}&per_page=${PER_PAGE}`;
    const r = await fetch(u, { headers: SB_HEADERS });
    if (!r.ok) {
      throw new Error(`auth.users fetch page=${page}: ${r.status} ${(await r.text()).slice(0, 200)}`);
    }
    const j = await r.json();
    const users = Array.isArray(j.users) ? j.users : [];
    for (const u of users) {
      list.push(u);
      if (u.email) map.set(u.email.toLowerCase(), u);
    }
    if (users.length < PER_PAGE) break;
    page++;
    if (page > 50) {  // 50000 사용자 safety cap
      console.warn(`auth.users pagination 50 페이지 도달 — 중단`);
      break;
    }
  }
  _authUserMapCache = map;
  _authUserListCache = list;
  console.log(`auth.users 전체 load: ${list.length}명 (email 보유 ${map.size}명)`);
  return map;
}

function fuzzyEmailMatches(email, limit = 3) {
  if (!_authUserListCache) return [];
  const target = email.toLowerCase();
  const localPart = target.split('@')[0];
  // prefix 5자 이상 매칭 / 또는 local part 가 포함된 케이스
  const candidates = [];
  for (const u of _authUserListCache) {
    const e = (u.email || '').toLowerCase();
    if (!e) continue;
    if (e === target) continue;
    const eLocal = e.split('@')[0];
    let score = 0;
    if (eLocal === localPart) score = 100;
    else if (eLocal.startsWith(localPart) || localPart.startsWith(eLocal)) score = 80;
    else if (eLocal.length >= 5 && localPart.includes(eLocal.slice(0, 5))) score = 60;
    else if (localPart.length >= 5 && eLocal.includes(localPart.slice(0, 5))) score = 60;
    if (score > 0) candidates.push({ email: e, score, id: u.id, provider: u.app_metadata?.provider });
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, limit);
}

async function findAuthUserByEmail(email) {
  const map = await loadAllAuthUsers();
  const user = map.get(email.toLowerCase());
  if (!user) {
    const fuzzy = fuzzyEmailMatches(email);
    return { error: 'auth.users 에서 매칭 X', fuzzy };
  }
  return { user };
}

async function getDataRows(authUserId) {
  // 사용자 보고 2026-05-18: soragodong_data 에 created_at 컬럼 없음 → updated_at 만 select.
  const u = `${SUPABASE_URL}/rest/v1/soragodong_data?auth_user_id=eq.${authUserId}&select=user_id,data,updated_at&order=updated_at.desc`;
  const r = await fetch(u, { headers: SB_HEADERS });
  if (!r.ok) {
    return { error: `data rows fetch ${r.status}: ${(await r.text()).slice(0, 200)}` };
  }
  return { rows: await r.json() };
}

function detectShape(data) {
  if (!data || typeof data !== 'object') return 'invalid';
  if (data._encryptedBody) return 'e2ee';
  if (data._compressed && data._payload) return 'compressed';
  if (data._backup_meta) return 'backup';
  return 'plain';
}

function tryDecompress(data) {
  if (!data?._compressed || !data?._payload) return null;
  try {
    const buf = Buffer.from(data._payload, 'base64');
    const json = gunzipSync(buf).toString('utf-8');
    return JSON.parse(json);
  } catch (e) {
    return { _decompress_error: e.message };
  }
}

function summarizeData(data, label) {
  if (!data) return { type: 'null', size_kb: 0 };
  const shape = detectShape(data);
  const raw = JSON.stringify(data);
  const sizeKb = +(raw.length / 1024).toFixed(1);

  const base = { type: shape, size_kb: sizeKb, version: data.version || null };

  if (shape === 'e2ee') {
    base.has_recovery = !!data._e2eeRecovery;
    base.e2ee_version = data._e2eeVersion || null;
    // _encryptedBody = { _e2ee, iv, data: base64ciphertext }
    // AES-GCM ciphertext = plaintext + 16 byte tag. base64 +33% 오버헤드.
    // plaintext_bytes ≈ data_base64_len * 0.75 - 16
    const cipherB64 = data._encryptedBody?.data;
    if (typeof cipherB64 === 'string') {
      const cipherLen = cipherB64.length;
      const plaintextBytes = Math.max(0, Math.floor(cipherLen * 0.75 - 16));
      base.cipher_b64_kb = +(cipherLen / 1024).toFixed(1);
      base.est_plaintext_kb = +(plaintextBytes / 1024).toFixed(1);
      // 빈 sensitiveBody JSON ≈ 1-2KB. 데이터 있는 state ≈ 10KB+.
      if (plaintextBytes < 2500) {
        base.fullness = '거의 빈 듯 (empty state 추정)';
      } else if (plaintextBytes < 8000) {
        base.fullness = '약간 (수 개 entries 추정)';
      } else if (plaintextBytes < 30000) {
        base.fullness = '중간 (의미있는 데이터 있음)';
      } else {
        base.fullness = '풍부 (큰 데이터)';
      }
    }
    base.note = 'E2EE — 본문 inspect 불가, 크기로만 추정';
    return base;
  }

  if (shape === 'compressed') {
    const decompressed = tryDecompress(data);
    if (decompressed?._decompress_error) {
      base.note = 'gzip 복원 실패: ' + decompressed._decompress_error;
      return base;
    }
    base.note = 'gzip 압축';
    base.fields = describeFields(decompressed);
    return base;
  }

  // snapshots[] wrapper (auto_backup / manual_backup)
  if (Array.isArray(data.snapshots)) {
    base.type = 'snapshots';
    base.snapshot_count = data.snapshots.length;
    base.snapshots = data.snapshots.map((s, i) => {
      const inner = s.data || {};
      return {
        idx: i,
        ts: s.ts,
        reason: s.reason || null,
        appVersion: s.appVersion || null,
        snapshot_kb: +((JSON.stringify(s).length || 0) / 1024).toFixed(1),
        fields: describeFields(inner)
      };
    });
    return base;
  }

  // plain or backup (tester_mode 등)
  base.fields = describeFields(data);
  if (shape === 'backup') {
    base._backup_meta = data._backup_meta;
  }
  return base;
}

function describeFields(state) {
  if (!state || typeof state !== 'object') return {};
  const f = {};
  const COUNT = ['entries', 'chatMessages', 'chatArchive', 'pearls', 'missions', 'tasks', 'topicCards', 'archive', 'decisions', 'shellCollection', 'projects', 'starts', 'insights', 'diagnoses', 'reflectionQuestions'];
  for (const k of COUNT) {
    if (Array.isArray(state[k])) f[k] = state[k].length;
  }
  if (state.profile && String(state.profile).trim()) f._profileLen = String(state.profile).length;
  if (state.preferences?.testerMode) f._testerMode = true;
  if (state.userName) f._userName = state.userName;
  if (state.lastSync) f._lastSync = state.lastSync;
  return f;
}

function snapshotsSummaryLine(snapshots) {
  // 한 줄 요약 — ts (최신) + 최신 snapshot 의 entries/chat/pearls 등 합계
  if (!snapshots || snapshots.length === 0) return '(empty)';
  const lines = snapshots.map(s => {
    const dt = (s.ts || '').slice(0, 16).replace('T', ' ');
    const f = s.fields || {};
    const parts = [];
    if (f.entries) parts.push(`entries:${f.entries}`);
    if (f.chatArchive) parts.push(`chatArchive:${f.chatArchive}`);
    if (f.chatMessages) parts.push(`chat:${f.chatMessages}`);
    if (f.pearls) parts.push(`pearls:${f.pearls}`);
    if (f.topicCards) parts.push(`topicCards:${f.topicCards}`);
    if (f.tasks) parts.push(`tasks:${f.tasks}`);
    if (f.missions) parts.push(`missions:${f.missions}`);
    if (f.projects) parts.push(`projects:${f.projects}`);
    if (f.starts) parts.push(`starts:${f.starts}`);
    if (f.shellCollection) parts.push(`shells:${f.shellCollection}`);
    if (f._profileLen) parts.push(`profile:${f._profileLen}c`);
    const body = parts.length ? parts.join(',') : 'empty';
    return `    [${s.idx}] ${dt} · ${s.reason || '?'} · ${s.snapshot_kb}KB · ${body}`;
  });
  return '\n' + lines.join('\n');
}

function looksEmptyMain(summary) {
  // E2EE 는 inspect 불가 → empty 추정 불가. 보수적으로 false.
  if (summary.type === 'e2ee') return false;
  const f = summary.fields || {};
  const totalContent = (f.entries || 0) + (f.chatMessages || 0) + (f.pearls || 0)
    + (f.missions || 0) + (f.tasks || 0) + (f.topicCards || 0) + (f.archive || 0);
  return totalContent < 3;  // 빈 시드 / 거의 텅 빔
}

function recommend(state) {
  const { mainRow, backupRow, legacyRows } = state;
  const mainSummary = mainRow ? summarizeData(mainRow.data) : null;
  const backupSummary = backupRow ? summarizeData(backupRow.data) : null;

  if (!mainRow && !backupRow && !legacyRows.length) {
    return 'no_data — auth 만 있고 data row 0 개. 신규 가입자 또는 reset 직후.';
  }
  if (mainRow && !looksEmptyMain(mainSummary)) {
    return 'no_action — main row 에 내용 있음 (E2EE 인 경우 inspect 불가, 사용자 확인 필요).';
  }
  if (backupRow) {
    return `restore_from_backup — backup row ${backupSummary.size_kb}KB (v${backupSummary.version}) → main 복원 후보.`;
  }
  if (legacyRows.length > 0) {
    return `restore_from_legacy — legacy row(s) ${legacyRows.map(r => r.user_id).join(', ')} 존재. backup 없으므로 수동 검토.`;
  }
  return 'no_backup_available — 복구 source 없음. (사용자에게 데이터 손실 안내 필요)';
}

// ─────────── diagnose ───────────

async function diagnoseOne(email) {
  console.log(`\n━━━━━━ ${email} ━━━━━━`);
  const auth = await findAuthUserByEmail(email);
  if (auth.error) {
    console.log('  ❌ auth lookup:', auth.error);
    if (auth.fuzzy?.length) {
      console.log('  💡 유사 email 후보:');
      for (const c of auth.fuzzy) {
        console.log(`     · ${c.email} (${c.provider || 'email'}, score=${c.score}, id=${c.id})`);
      }
    }
    return { email, ok: false, reason: auth.error, fuzzy: auth.fuzzy };
  }
  const user = auth.user;
  console.log(`  auth_user_id : ${user.id}`);
  console.log(`  provider     : ${user.app_metadata?.provider || (user.is_anonymous ? 'anonymous' : 'email')}`);
  console.log(`  created_at   : ${user.created_at || 'X'}`);
  console.log(`  last_sign_in : ${user.last_sign_in_at || 'never'}`);
  console.log(`  is_anonymous : ${user.is_anonymous ? 'YES' : 'no'}`);
  console.log(`  email_conf   : ${user.email_confirmed_at ? 'yes' : 'no'}`);

  const dataRes = await getDataRows(user.id);
  if (dataRes.error) {
    console.log('  ❌ data rows fetch:', dataRes.error);
    return { email, ok: false, reason: dataRes.error };
  }
  const rows = dataRes.rows;
  console.log(`  rows         : ${rows.length ? rows.map(r => `${r.user_id}(${(JSON.stringify(r.data).length / 1024).toFixed(1)}KB @ ${(r.updated_at || '').slice(0, 16).replace('T', ' ')})`).join(' / ') : '(none)'}`);

  const mainRow = rows.find(r => r.user_id === V4_USER_ID) || null;
  const backupRow = rows.find(r => r.user_id === V4_BACKUP_USER_ID) || null;
  const legacyRows = rows.filter(r => r.user_id !== V4_USER_ID && !r.user_id?.startsWith('backup_'));

  const renderRow = (label, r) => {
    if (!r) { console.log(`  ${label.padEnd(28)}: (X)`); return; }
    const s = summarizeData(r.data);
    if (s.type === 'snapshots') {
      console.log(`  ${label.padEnd(28)}: snapshots(${s.snapshot_count}) total ${s.size_kb}KB${snapshotsSummaryLine(s.snapshots)}`);
    } else {
      console.log(`  ${label.padEnd(28)}: ${JSON.stringify(s)}`);
    }
  };

  renderRow('main (me_v4)', mainRow);
  renderRow('backup (backup_v6_pre_v7)', backupRow);
  for (const r of legacyRows) {
    renderRow(`legacy(${r.user_id})`, r);
  }

  const rec = recommend({ mainRow, backupRow, legacyRows });
  console.log(`  → 권장        : ${rec}`);

  return { email, ok: true, user, mainRow, backupRow, legacyRows, recommendation: rec };
}

async function diagnoseAll(emails) {
  const results = [];
  for (const email of emails) {
    const r = await diagnoseOne(email).catch(e => ({ email, ok: false, reason: e.message }));
    results.push(r);
  }

  // 요약 표
  console.log('\n\n━━━━━━ 요약 ━━━━━━');
  for (const r of results) {
    const flag = r.ok ? '✓' : '✗';
    const rec = r.recommendation || r.reason || '?';
    console.log(`  ${flag} ${r.email.padEnd(35)} ${rec}`);
  }
}

// ─────────── apply ───────────

const SOURCE_MAP = {
  v6_pre_v7:     { userId: V4_BACKUP_USER_ID,         kind: 'raw' },       // backup_v6_pre_v7 (V3→V4 마이그레이션 백업)
  tester_backup: { userId: 'me_v4_backup',            kind: 'raw' },       // testerMode ON 직전 백업
  manual_backup: { userId: 'me_v4_manual_backup',     kind: 'snapshots' }, // 사용자 트리거 백업 (snapshots[])
  auto_backup:   { userId: 'me_v4_auto_backup',       kind: 'snapshots' }, // 주 1회 + version 변경 시 (snapshots[])
};

async function applyOne(email, sourceName, snapshotIdx) {
  console.log(`\n━━━━━━ APPLY: ${email} ━━━━━━`);
  console.log(`  source: ${sourceName}${snapshotIdx !== null ? ` (snapshot idx=${snapshotIdx})` : ''}`);
  console.log(`  dry-run: ${DRY_RUN}  force: ${FORCE}`);

  const srcDef = SOURCE_MAP[sourceName];
  if (!srcDef) {
    console.error(`❌ 알 수 없는 source: ${sourceName}. 가능: ${Object.keys(SOURCE_MAP).join(', ')}`);
    process.exit(2);
  }

  const auth = await findAuthUserByEmail(email);
  if (auth.error) { console.error('❌ auth:', auth.error); process.exit(2); }
  const user = auth.user;
  console.log(`  auth_user_id: ${user.id}`);

  const dataRes = await getDataRows(user.id);
  if (dataRes.error) { console.error('❌ rows:', dataRes.error); process.exit(2); }
  const rows = dataRes.rows;

  const mainRow = rows.find(r => r.user_id === V4_USER_ID) || null;
  const sourceRow = rows.find(r => r.user_id === srcDef.userId) || null;

  if (!sourceRow) {
    console.error(`❌ source row (${srcDef.userId}) 없음. (--apply 거부)`);
    process.exit(3);
  }
  console.log(`  source row   : ${srcDef.userId} (${(JSON.stringify(sourceRow.data).length / 1024).toFixed(1)}KB @ ${(sourceRow.updated_at || '').slice(0, 16).replace('T', ' ')})`);

  // 복원 데이터 추출
  let restoredData;
  if (srcDef.kind === 'snapshots') {
    const snaps = Array.isArray(sourceRow.data?.snapshots) ? sourceRow.data.snapshots : [];
    if (snaps.length === 0) {
      console.error(`❌ snapshots[] 비어있음 (${srcDef.userId}).`);
      process.exit(3);
    }
    const idx = snapshotIdx === null ? snaps.length - 1 : snapshotIdx;  // 기본 = 최신
    if (idx < 0 || idx >= snaps.length) {
      console.error(`❌ snapshot idx ${idx} 범위 밖. snapshots(${snaps.length}).`);
      console.log('  사용 가능:');
      snaps.forEach((s, i) => {
        console.log(`    [${i}] ${s.ts} · ${s.reason || '?'} · fields=${JSON.stringify(describeFields(s.data || {}))}`);
      });
      process.exit(3);
    }
    const picked = snaps[idx];
    if (!picked || !picked.data) {
      console.error(`❌ snapshot[${idx}].data 없음.`);
      process.exit(3);
    }
    console.log(`  picked snap  : [${idx}] ${picked.ts} · ${picked.reason || '?'} · ${(JSON.stringify(picked).length / 1024).toFixed(1)}KB`);
    console.log(`               fields: ${JSON.stringify(describeFields(picked.data))}`);
    restoredData = JSON.parse(JSON.stringify(picked.data));
  } else {
    // raw: row.data 그대로, _backup_meta strip
    restoredData = JSON.parse(JSON.stringify(sourceRow.data));
    delete restoredData._backup_meta;
    console.log(`  picked raw   : fields=${JSON.stringify(describeFields(restoredData))}`);
  }

  // testerMode flag 강제 OFF (복구 후 사용자가 또 testerMode 진입 X)
  if (restoredData.preferences) restoredData.preferences.testerMode = false;

  // main row 안전 가드
  if (mainRow) {
    const mainSum = summarizeData(mainRow.data);
    console.log('  main (전)    :', JSON.stringify(mainSum));
    if (mainSum.type === 'e2ee' && !FORCE) {
      console.error('⚠ main 이 E2EE — 본문 inspect 불가. 사용자 보고 "백지" 라면 main 의 _encryptedBody 가 빈 state 일 가능성 큼.');
      console.error('   진행하려면 --force. plain backup 데이터로 _encryptedBody 덮어쓰기 = 클라가 다음 save 에서 새 master key 로 재암호화.');
      process.exit(4);
    }
    if (mainSum.type !== 'e2ee' && !looksEmptyMain(mainSum) && !FORCE) {
      console.error('⚠ main 이 plain + 내용 있음. 덮어쓰면 손실 가능. --force 필요.');
      process.exit(4);
    }
  } else {
    console.log('  main         : (없음 — POST 로 신규 생성)');
  }

  if (DRY_RUN) {
    console.log('  → DRY-RUN 종료. 실제 PATCH/POST X. --confirm 추가하면 적용.');
    return;
  }

  if (mainRow) {
    const url = `${SUPABASE_URL}/rest/v1/soragodong_data?auth_user_id=eq.${user.id}&user_id=eq.${V4_USER_ID}`;
    const r = await fetch(url, {
      method: 'PATCH',
      headers: { ...SB_HEADERS, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify({ data: restoredData, updated_at: new Date().toISOString() }),
    });
    if (!r.ok) {
      console.error(`❌ PATCH 실패 ${r.status}: ${(await r.text()).slice(0, 500)}`);
      process.exit(5);
    }
    console.log('✦ PATCH 완료 — main row 복원됨.');
  } else {
    const url = `${SUPABASE_URL}/rest/v1/soragodong_data`;
    const r = await fetch(url, {
      method: 'POST',
      headers: { ...SB_HEADERS, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify({ auth_user_id: user.id, user_id: V4_USER_ID, data: restoredData }),
    });
    if (!r.ok) {
      console.error(`❌ POST 실패 ${r.status}: ${(await r.text()).slice(0, 500)}`);
      process.exit(5);
    }
    console.log('✦ POST 완료 — main row 신규 생성.');
  }

  // post-write verify
  const verifyRes = await getDataRows(user.id);
  const verifyMain = verifyRes.rows?.find(r => r.user_id === V4_USER_ID);
  if (verifyMain) {
    console.log('  main (후)    :', JSON.stringify(summarizeData(verifyMain.data)));
  } else {
    console.error('⚠ verify: main row 못 찾음.');
  }
  console.log(`\n✓ ${email} 복구 완료.`);
  console.log(`   사용자 가이드: 로그아웃 → 재로그인 → E2EE 비밀번호 재입력 → 데이터 확인.`);
  console.log(`   클라가 다음 save 에서 새 master key 로 자동 재암호화 (_encryptedBody 갱신).`);
}

// ═══════════════════════════════════════════════════════════════
// MERGE — 두 계정 데이터 합치기 (V4 사용자 명시 2026-05-18 ultrathink)
// ───────────────────────────────────────────────────────────────
// 시나리오: 사용자가 두 이메일로 가입했고 둘 다 데이터 있음. kakao 계정 (target)
// 으로 합치고 싶음. 두 main row 다 E2EE 라 서버 decrypt 불가 → backup 으로 합침.
//
// 합치는 source:
//   target (A): manual_backup [latest snapshot]
//   from   (B): manual_backup [latest] + tester_backup (me_v4_backup) + auto_backup [latest]
//                (세 소스 fold-merge — id 충돌은 dedupe)
//
// 처리:
//   1. A.me_v4 전체 → me_v4_pre_merge 로 dump (rollback 안전망)
//   2. A.me_v4 ← mergedPlain (A.source 와 B.fold 합친 결과)
//   3. B.me_v4 ← DEFAULT_STATE (빈 상태, backup row 들은 보존)
// ═══════════════════════════════════════════════════════════════

const ARRAY_BY_ID_KEYS = [
  'entries', 'chatArchive', 'pearls', 'missions', 'shellCollection',
  'archive', 'decisions', 'predictionFollowups',
  'tasks', 'projects', 'areas', 'memoryVault', 'dayPlan', 'starts', 'insights',
  'topicCards', 'reflectionQuestions', 'diagnoses', 'quarterlyReviews', 'annualReviews',
  'miniReviews', 'godongDiary', 'godongDiaryQueue', 'askedHooks'
];
// _shownInlineTips = array<string> (코드: state._shownInlineTips.push(key))
const ARRAY_STRING_KEYS = ['traits', 'values', 'patterns', 'activeStrategies', '_shownInlineTips'];
const ARRAY_BY_PERIOD_KEYS = { weeklyReviews: 'weekKey', monthlyReviews: 'monthKey' };
const COUNTER_MAX_KEYS = ['newUserExtractTriggers', 'chapterCompletedCount', 'chatPairsCount'];
const TS_MAX_KEYS = [
  'lastSync', 'lastForceAnalyzeAt', 'lastDailyChapterExtractAt',
  'lastWeeklyAnalyzeAt', 'lastMonthlyAnalyzeAt', 'lastQuarterlyAnalyzeAt',
  'lastYearlyAnalyzeAt', 'lastAbsenceAcknowledgedAt',
  '_chatChapterEndedAt', 'periodStart'
];
const BOOL_OR_KEYS = ['hasSeenV3Tour', 'hasSeenWelcomeTutorial'];
// tutorialShown = object<key, bool> (코드: state.tutorialShown.diaryLib = true)
const OBJECT_DEEP_MERGE_KEYS = [
  'caseFormulation', 'userDeepProfile', 'preferences', 'rotatingCardState',
  'modes', 'modeActiveSince', 'questionPreferences', 'unlocked', 'todaysShell',
  'tutorialShown'
];
const STRING_A_FIRST = ['profile', 'userName', 'apiKey'];

const DEFAULT_STATE_SHAPE = {
  isGuest: false, entries: [], chatMessages: [], traits: [], values: [], patterns: [],
  caseFormulation: { version: 0, lastUpdated: null, problems: [], mechanisms: [], strengths: [], goals: [], growth: [], unverified: { problems: [], mechanisms: [], strengths: [], goals: [], growth: [] } },
  archive: [], activeStrategies: [], modes: { exam: false, travel: false, sick: false, rest: false, period: false },
  periodStart: null, apiKey: '', profile: '', userName: '', lastSync: null,
  missions: [], shellCollection: [], decisions: [], weeklyReviews: [], monthlyReviews: [],
  miniReviews: [], godongDiary: [], godongDiaryQueue: [], askedHooks: [],
  lastAbsenceAcknowledgedAt: null, predictionFollowups: [], questionHistory: [],
  questionPreferences: { dismissed: [], favorites: [], customQuestions: [] },
  tasks: [], projects: [], areas: [], memoryVault: [], dayPlan: [], starts: [], insights: [], pearls: [], topicCards: [],
  todaysShell: { date: null, content: null, generatedAt: null },
  hasSeenV3Tour: false, hasSeenWelcomeTutorial: false,
  unlocked: { core1: false, core2: false, core3: false, core4: false, core5: false, core6: false, core8: false },
  modeActiveSince: {}, preferences: {},
  chatArchive: [], intakeWorry: [], reflectionQuestions: [], todaySchedule: [], diagnoses: [],
  quarterlyReviews: [], annualReviews: [], lastForceAnalyzeAt: null,
  lastDailyChapterExtractAt: null, lastWeeklyAnalyzeAt: null, lastMonthlyAnalyzeAt: null,
  lastQuarterlyAnalyzeAt: null, lastYearlyAnalyzeAt: null,
  dailyChatCount: { date: null, count: 0 }, chatPairsCount: 0, newUserExtractTriggers: 0,
  chapterCompletedCount: 0, _chatChapterEndedAt: null,
  userDeepProfile: { version: 0, lastUpdated: null, development: {}, relationships: [], selfNarrative: {} },
  rotatingCardState: { pearlWindowStart: null, pearlCurrentId: null, lastPearlShownDate: null, unseenInsights: [], unseenInsightsHistory: [], lastMiniReviewAt: null, miniReviewContentId: null, quizDay: null, quizProgress: null, quizDeniedCooldown: {}, quizSkippedCooldown: {}, quizScoreBefore: null, history: [] },
  version: 7
};

function _idOfItem(item) {
  if (!item || typeof item !== 'object') return null;
  return item.id ?? item.date ?? item.day ?? item.weekKey ?? item.monthKey ?? item.quarterKey ?? item.year ?? null;
}

// 모든 merge fn type-guard. 옛 schema 잔재 (array 가 아닌 다른 type) 들어와도 안전.
function _arr(x) { return Array.isArray(x) ? x : []; }

function mergeArrayById(a, b, keyName, report) {
  const aArr = _arr(a);
  const bArr = _arr(b);
  const out = [];
  const seenIds = new Map();
  const addItems = (arr, src) => {
    for (const item of arr) {
      if (!item) continue;
      const id = _idOfItem(item);
      if (id !== null && seenIds.has(id)) {
        report.conflicts.push({ key: keyName, id, kept: seenIds.get(id), dropped: src });
        continue;
      }
      if (id !== null) seenIds.set(id, src);
      out.push(item);
    }
  };
  addItems(aArr, 'A');
  addItems(bArr, 'B');
  report.summary[keyName] = { A: aArr.length, B: bArr.length, total: out.length, conflicts: report.conflicts.filter(c => c.key === keyName).length };
  return out;
}

function mergeChatMsgs(a, b, keyName, report) {
  const aArr = _arr(a);
  const bArr = _arr(b);
  const all = [...aArr, ...bArr];
  const seen = new Set();
  const out = [];
  for (const m of all) {
    if (!m) continue;
    const key = `${m.ts || ''}|${m.role || ''}|${(m.content || '').slice(0, 60)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(m);
  }
  out.sort((x, y) => (x.ts || '').localeCompare(y.ts || ''));
  report.summary[keyName] = { A: aArr.length, B: bArr.length, total: out.length };
  return out;
}

function mergeStringArray(a, b, keyName, report) {
  const aArr = _arr(a);
  const bArr = _arr(b);
  const out = [...new Set([...aArr, ...bArr])];
  report.summary[keyName] = { A: aArr.length, B: bArr.length, total: out.length };
  return out;
}

function mergeByPeriod(a, b, keyName, periodField, report) {
  const aArr = _arr(a);
  const bArr = _arr(b);
  const out = [];
  const seen = new Set();
  const all = [...aArr, ...bArr];
  for (const item of all) {
    if (!item) continue;
    const k = item[periodField] || _idOfItem(item);
    if (k && seen.has(k)) continue;
    if (k) seen.add(k);
    out.push(item);
  }
  report.summary[keyName] = { A: aArr.length, B: bArr.length, total: out.length };
  return out;
}

function deepMergeObject(a, b, keyName) {
  if (a === undefined || a === null) return b == null ? null : JSON.parse(JSON.stringify(b));
  if (b === undefined || b === null) return JSON.parse(JSON.stringify(a));
  if (typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) || Array.isArray(b)) {
    // 한쪽이 객체 아니면 A 우선
    return a !== undefined && a !== null && a !== '' ? a : b;
  }
  const out = {};
  const allKeys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of allKeys) {
    const aVal = a[k];
    const bVal = b[k];
    if (Array.isArray(aVal) || Array.isArray(bVal)) {
      const aArr = Array.isArray(aVal) ? aVal : [];
      const bArr = Array.isArray(bVal) ? bVal : [];
      if ([...aArr, ...bArr].every(x => typeof x === 'string')) {
        out[k] = [...new Set([...aArr, ...bArr])];
      } else {
        // obj array — dedupe by id
        const seen = new Set();
        out[k] = [];
        for (const item of [...aArr, ...bArr]) {
          if (!item) continue;
          const id = _idOfItem(item) ?? JSON.stringify(item).slice(0, 40);
          if (seen.has(id)) continue;
          seen.add(id);
          out[k].push(item);
        }
      }
    } else if (typeof aVal === 'object' && aVal !== null && typeof bVal === 'object' && bVal !== null) {
      out[k] = deepMergeObject(aVal, bVal, `${keyName}.${k}`);
    } else {
      // scalar: A 우선 (값 있으면)
      if (aVal === undefined || aVal === null || aVal === '') out[k] = bVal;
      else out[k] = aVal;
    }
  }
  return out;
}

function maxIso(a, b) {
  if (a == null) return b ?? null;
  if (b == null) return a;
  return a > b ? a : b;
}

function mergeStates(A, B) {
  const report = { summary: {}, conflicts: [], unknown_keys: [] };
  A = A || {};
  B = B || {};
  const allKeys = new Set([...Object.keys(A), ...Object.keys(B), ...Object.keys(DEFAULT_STATE_SHAPE)]);
  const out = {};
  for (const key of allKeys) {
    const aVal = A[key];
    const bVal = B[key];
    if (ARRAY_BY_ID_KEYS.includes(key)) {
      out[key] = mergeArrayById(aVal, bVal, key, report);
    } else if (Object.prototype.hasOwnProperty.call(ARRAY_BY_PERIOD_KEYS, key)) {
      out[key] = mergeByPeriod(aVal, bVal, key, ARRAY_BY_PERIOD_KEYS[key], report);
    } else if (ARRAY_STRING_KEYS.includes(key)) {
      out[key] = mergeStringArray(aVal, bVal, key, report);
    } else if (key === 'chatMessages' || key === 'intakeWorry' || key === 'todaySchedule' || key === 'questionHistory') {
      out[key] = mergeChatMsgs(aVal, bVal, key, report);
    } else if (COUNTER_MAX_KEYS.includes(key)) {
      out[key] = Math.max(Number(aVal) || 0, Number(bVal) || 0);
    } else if (TS_MAX_KEYS.includes(key)) {
      out[key] = maxIso(aVal, bVal);
    } else if (BOOL_OR_KEYS.includes(key)) {
      out[key] = !!(aVal || bVal);
    } else if (OBJECT_DEEP_MERGE_KEYS.includes(key)) {
      out[key] = deepMergeObject(aVal, bVal, key);
      if (key === 'preferences' && out[key]) out[key].testerMode = false;
    } else if (STRING_A_FIRST.includes(key)) {
      let v = (aVal && String(aVal).trim()) ? aVal : bVal;
      if (key === 'profile' && aVal && bVal && bVal !== aVal && String(bVal).trim().length > 20 && String(aVal).trim().length > 0) {
        v = String(aVal) + '\n\n— 이전 계정에서 옮긴 메모:\n' + String(bVal);
      }
      out[key] = v !== undefined ? v : '';
    } else if (key === 'version') {
      out[key] = 7;
    } else if (key === 'isGuest') {
      out[key] = false;
    } else if (key === 'dailyChatCount' || key === '_dailyDeeperCount') {
      // 일일 카운터들 — reset to today fresh
      out[key] = { date: null, count: 0 };
    } else if (key === '_backup_meta' || key === '_encryptedBody' || key === '_e2eeEnabled' || key === '_e2eeVersion' || key === '_e2eeRecovery' || key === '_compressed' || key === '_format' || key === '_payload') {
      // backup 데이터에 있을 수 없는 키들 (plain backup) — skip
      continue;
    } else if (aVal !== undefined || bVal !== undefined) {
      // 알 수 없는 키 — A 우선, 없으면 B
      if (aVal !== undefined) out[key] = aVal;
      else out[key] = bVal;
      if (aVal !== undefined && bVal !== undefined && JSON.stringify(aVal) !== JSON.stringify(bVal)) {
        report.unknown_keys.push({ key, a_type: typeof aVal, b_type: typeof bVal });
      }
    }
  }
  return { merged: out, report };
}

// 한 row 에서 state object 추출. row type 별 분기.
// 반환: { ok: true, data, kind } | { ok: false, reason }
function extractFromRow(row) {
  if (!row || !row.data) return { ok: false, reason: 'row 또는 data 없음' };
  const d = row.data;
  // E2EE main — 서버 decrypt 불가
  if (d._encryptedBody && d._encryptedBody._e2ee) {
    return { ok: false, reason: 'E2EE 본문 — 서버에서 decrypt 불가' };
  }
  // Compressed plain main
  if (d._compressed && d._format && typeof d._payload === 'string') {
    const decompressed = tryDecompress(d);
    if (!decompressed || decompressed._decompress_error) {
      return { ok: false, reason: 'gzip 복원 실패: ' + (decompressed?._decompress_error || 'unknown') };
    }
    return { ok: true, data: decompressed, kind: 'compressed_main' };
  }
  // Snapshots wrapper (manual_backup / auto_backup)
  if (Array.isArray(d.snapshots)) {
    if (d.snapshots.length === 0) return { ok: false, reason: 'snapshots[] 비어있음' };
    const last = d.snapshots[d.snapshots.length - 1];
    if (!last || !last.data) return { ok: false, reason: 'snapshots[last].data 없음' };
    return { ok: true, data: JSON.parse(JSON.stringify(last.data)), kind: 'snapshot_latest', meta: { ts: last.ts, reason: last.reason } };
  }
  // Raw state (tester_backup, v6_pre_v7, legacy V3 plain main 등)
  const clone = JSON.parse(JSON.stringify(d));
  delete clone._backup_meta;
  return { ok: true, data: clone, kind: 'raw' };
}

async function mergeAccounts(targetEmail, fromEmail) {
  console.log(`\n━━━━━━ MERGE: ${fromEmail} → ${targetEmail} ━━━━━━`);
  console.log(`  dry-run: ${DRY_RUN}`);

  // 1. auth 조회
  const aAuth = await findAuthUserByEmail(targetEmail);
  if (aAuth.error) { console.error('❌ target auth:', aAuth.error); process.exit(2); }
  const bAuth = await findAuthUserByEmail(fromEmail);
  if (bAuth.error) { console.error('❌ from auth:', bAuth.error); process.exit(2); }
  console.log(`  target (A) auth_user_id: ${aAuth.user.id}`);
  console.log(`  from   (B) auth_user_id: ${bAuth.user.id}`);

  // 2. 양쪽 rows fetch
  const aRowsRes = await getDataRows(aAuth.user.id);
  if (aRowsRes.error) { console.error('❌ A rows:', aRowsRes.error); process.exit(2); }
  const bRowsRes = await getDataRows(bAuth.user.id);
  if (bRowsRes.error) { console.error('❌ B rows:', bRowsRes.error); process.exit(2); }
  const aRows = aRowsRes.rows;
  const bRows = bRowsRes.rows;

  // 3. A source 결정 — main (plain/compressed 가능 시 우선) 또는 manual_backup latest
  // E2EE main 이면 backup 으로 fallback.
  let aSource = null;
  let aSourceLabel = '';
  const aMainRow = aRows.find(r => r.user_id === V4_USER_ID);
  if (aMainRow) {
    const e = extractFromRow(aMainRow);
    if (e.ok && e.kind !== 'raw') {
      // plain main / compressed main 둘 다 사용 가능 — 가장 최신 데이터
      aSource = e.data;
      aSourceLabel = `main (${e.kind})`;
    } else if (e.ok && e.kind === 'raw') {
      // raw plain main
      aSource = e.data;
      aSourceLabel = 'main (raw plain)';
    }
  }
  if (!aSource) {
    // fallback: manual_backup latest
    const aManual = aRows.find(r => r.user_id === 'me_v4_manual_backup');
    if (aManual) {
      const e = extractFromRow(aManual);
      if (e.ok) { aSource = e.data; aSourceLabel = 'manual_backup [latest]'; }
    }
  }
  if (!aSource) { console.error('❌ A 의 사용 가능한 source 없음 (main = E2EE/없음, manual_backup 도 없음).'); process.exit(3); }
  console.log(`  A source [${aSourceLabel}]: fields ${JSON.stringify(describeFields(aSource))}`);

  // 4. B sources = main (plain 가능시) + manual + tester(me_v4_backup) + auto(latest) + pre_guest_merge + legacy
  // 모두 합쳐서 fold-merge. id dedupe 가 중복 처리. E2EE main 은 skip.
  const bSourceCandidates = [
    { uid: V4_USER_ID, label: 'main' },
    { uid: 'me_v4_manual_backup', label: 'manual_backup [latest]' },
    { uid: 'me_v4_backup', label: 'tester_backup' },
    { uid: 'me_v4_auto_backup', label: 'auto_backup [latest]' },
    { uid: 'me_v4_pre_guest_merge', label: 'pre_guest_merge' },
    { uid: 'backup_v6_pre_v7', label: 'v6_pre_v7 (V3→V4 마이그)' },
  ];
  // legacy email row (V3 era)
  for (const r of bRows) {
    if (r.user_id !== V4_USER_ID && !r.user_id.startsWith('me_v4_') && !r.user_id.startsWith('backup_')) {
      bSourceCandidates.push({ uid: r.user_id, label: `legacy(${r.user_id})` });
    }
  }
  const bSources = [];
  for (const { uid, label } of bSourceCandidates) {
    const row = bRows.find(r => r.user_id === uid);
    if (!row) continue;
    const e = extractFromRow(row);
    if (!e.ok) {
      console.log(`  B source ${label}: skip (${e.reason})`);
      continue;
    }
    console.log(`  B source ${label} [${e.kind}]: fields ${JSON.stringify(describeFields(e.data))}`);
    bSources.push({ uid, label, data: e.data });
  }
  if (bSources.length === 0) { console.error('❌ B 의 사용 가능한 source 0개.'); process.exit(3); }

  // 5. B fold-merge (A 빈 객체와 각 B source 순차 합치기 → bCombined)
  let bCombined = {};
  for (const { uid, data } of bSources) {
    const { merged } = mergeStates(bCombined, data);
    bCombined = merged;
  }
  console.log(`  B combined: fields ${JSON.stringify(describeFields(bCombined))}`);

  // 6. 최종 merge: A + bCombined
  const { merged, report } = mergeStates(aSource, bCombined);

  // 7. report 출력
  console.log('\n━━━ MERGE 결과 ━━━');
  const items = Object.entries(report.summary).sort((x, y) => y[1].total - x[1].total);
  for (const [k, s] of items) {
    if (s.total === 0 && s.A === 0 && s.B === 0) continue;
    const conf = s.conflicts ? ` · 충돌 ${s.conflicts}` : '';
    console.log(`  ${k.padEnd(28)}: A=${String(s.A).padStart(3)} + B=${String(s.B).padStart(3)} → ${String(s.total).padStart(3)}${conf}`);
  }
  if (report.unknown_keys.length > 0) {
    console.log('\n⚠ 알 수 없는 키 (A 우선 fallback):');
    for (const k of report.unknown_keys) console.log(`  · ${k.key} (A:${k.a_type} / B:${k.b_type})`);
  }
  if (report.conflicts.length > 0) {
    console.log(`\n총 id 충돌: ${report.conflicts.length}건 (A 우선 유지)`);
  }

  // merged 크기
  const mergedJson = JSON.stringify(merged);
  console.log(`\n  merged 크기: ${(mergedJson.length / 1024).toFixed(1)}KB (plain)`);

  // 8. dry-run 종료
  if (DRY_RUN) {
    console.log('\n→ DRY-RUN 종료. 실제 PATCH X. --confirm 추가하면 적용.');
    return;
  }

  // 9. A 의 me_v4 → me_v4_pre_merge 로 dump (rollback 안전망)
  const aMain = aRows.find(r => r.user_id === V4_USER_ID);
  if (!aMain) {
    console.warn('⚠ A 의 me_v4 row 없음. pre_merge 백업 skip.');
  } else {
    console.log('\n[1/3] A 의 me_v4 전체를 me_v4_pre_merge 로 dump...');
    const dumpData = { ...aMain.data, _backup_meta: { type: 'pre_merge', createdAt: new Date().toISOString(), source_email: fromEmail } };
    // 기존 pre_merge row 있나?
    const existingPreMerge = aRows.find(r => r.user_id === 'me_v4_pre_merge');
    let preMergeResp;
    if (existingPreMerge) {
      preMergeResp = await fetch(
        `${SUPABASE_URL}/rest/v1/soragodong_data?auth_user_id=eq.${aAuth.user.id}&user_id=eq.me_v4_pre_merge`,
        { method: 'PATCH', headers: { ...SB_HEADERS, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' }, body: JSON.stringify({ data: dumpData, updated_at: new Date().toISOString() }) }
      );
    } else {
      preMergeResp = await fetch(
        `${SUPABASE_URL}/rest/v1/soragodong_data`,
        { method: 'POST', headers: { ...SB_HEADERS, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' }, body: JSON.stringify({ auth_user_id: aAuth.user.id, user_id: 'me_v4_pre_merge', data: dumpData }) }
      );
    }
    if (!preMergeResp.ok) {
      console.error(`❌ pre_merge dump 실패 ${preMergeResp.status}: ${(await preMergeResp.text()).slice(0, 500)}`);
      console.error('   PATCH 중단. main row 안 만짐.');
      process.exit(5);
    }
    console.log('   ✦ me_v4_pre_merge 저장 완료.');
  }

  // 10. A.me_v4 PATCH = merged plain
  console.log('[2/3] A 의 me_v4 ← merged plain 데이터 PATCH...');
  if (aMain) {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/soragodong_data?auth_user_id=eq.${aAuth.user.id}&user_id=eq.${V4_USER_ID}`,
      { method: 'PATCH', headers: { ...SB_HEADERS, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' }, body: JSON.stringify({ data: merged, updated_at: new Date().toISOString() }) }
    );
    if (!r.ok) { console.error(`❌ A PATCH 실패 ${r.status}: ${(await r.text()).slice(0, 500)}`); process.exit(5); }
  } else {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/soragodong_data`,
      { method: 'POST', headers: { ...SB_HEADERS, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' }, body: JSON.stringify({ auth_user_id: aAuth.user.id, user_id: V4_USER_ID, data: merged }) }
    );
    if (!r.ok) { console.error(`❌ A POST 실패 ${r.status}: ${(await r.text()).slice(0, 500)}`); process.exit(5); }
  }
  console.log('   ✦ A.me_v4 = merged data.');

  // 11. B.me_v4 reset to DEFAULT_STATE
  console.log('[3/3] B 의 me_v4 ← DEFAULT_STATE reset...');
  const bMain = bRows.find(r => r.user_id === V4_USER_ID);
  if (bMain) {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/soragodong_data?auth_user_id=eq.${bAuth.user.id}&user_id=eq.${V4_USER_ID}`,
      { method: 'PATCH', headers: { ...SB_HEADERS, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' }, body: JSON.stringify({ data: JSON.parse(JSON.stringify(DEFAULT_STATE_SHAPE)), updated_at: new Date().toISOString() }) }
    );
    if (!r.ok) {
      console.error(`⚠ B reset 실패 ${r.status} — 수동 처리 필요. A PATCH 는 끝남.`);
    } else {
      console.log('   ✦ B.me_v4 reset 완료. B 의 backup row 들은 보존됨.');
    }
  } else {
    console.log('   B.me_v4 없음 — reset skip.');
  }

  console.log(`\n✓ MERGE 완료.`);
  console.log(`  사용자 가이드:`);
  console.log(`    1. ${targetEmail} (kakao) 로 로그인`);
  console.log(`    2. E2EE 비밀번호 입력 (master key 복원)`);
  console.log(`    3. 데이터 보임 — plain merged state 로드`);
  console.log(`    4. 첫 save 시 client 가 master key 로 자동 re-encrypt`);
  console.log(`    5. ${fromEmail} (네이버) 로 로그인 시도하면 빈 상태 — 정리 의도대로.`);
  console.log(`    6. 문제 시 rollback: me_v4_pre_merge row 가 ${targetEmail} 에 보존됨.`);
}

// ─────────── LIFETIME PREMIUM ───────────
// soragodong_billing 직접 UPSERT — admin endpoint /api/admin/grant-lifetime-premium 과 동일 동작.
// 기본 check (read-only). --confirm 으로 실제 grant.

async function checkOrGrantLifetime(emails, doGrant) {
  const PREMIUM_CAP = 13;
  const EXPIRES_AT = '2099-12-31T23:59:59Z';
  const results = [];

  for (const email of emails) {
    const auth = await findAuthUserByEmail(email);
    if (auth.error) {
      console.log(`❌ ${email}: auth lookup — ${auth.error}`);
      results.push({ email, ok: false });
      continue;
    }
    const uid = auth.user.id;
    // 현재 billing 상태 조회
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/soragodong_billing?user_id=eq.${uid}&select=subscription_plan,subscription_active,subscription_expires_at,monthly_quota_usd,portone_billing_key,credit_balance_usd`,
      { headers: SB_HEADERS }
    );
    if (!r.ok) {
      console.log(`❌ ${email}: billing fetch ${r.status}`);
      results.push({ email, ok: false });
      continue;
    }
    const rows = await r.json();
    const b = rows[0] || null;
    const expIso = b?.subscription_expires_at;
    const isLifetime = expIso && new Date(expIso).getFullYear() >= 2099;
    const active = b && b.subscription_active && expIso && new Date(expIso) > new Date();
    const status = b
      ? `plan=${b.subscription_plan || 'X'} active=${active ? 'YES' : 'no'} expires=${(expIso || '').slice(0, 10)} lifetime=${isLifetime ? 'YES' : 'no'} billing_key=${b.portone_billing_key ? '있음(자동결제)' : '없음'} cred=${b.credit_balance_usd ?? 'X'}`
      : '(billing row 없음)';
    console.log(`\n━ ${email} (${uid})`);
    console.log(`  현재: ${status}`);

    if (!doGrant) {
      results.push({ email, ok: true, billing: b, isLifetime });
      continue;
    }
    if (isLifetime && active) {
      console.log(`  → 이미 lifetime premium. skip.`);
      results.push({ email, ok: true, action: 'skip', billing: b });
      continue;
    }

    // UPSERT — admin endpoint 와 동일 payload
    const payload = {
      user_id: uid,
      subscription_plan: 'premium',
      subscription_active: true,
      subscription_expires_at: EXPIRES_AT,
      monthly_quota_usd: PREMIUM_CAP,
      monthly_token_used: 0,
      monthly_period_started_at: new Date().toISOString(),
      daily_quota_used: 0,
      daily_quota_reset_at: new Date(Date.now() + 86400_000).toISOString(),
      cancel_at_period_end: false,
      scheduled_plan_change: null,
      scheduled_plan_change_at: null
    };
    const up = await fetch(`${SUPABASE_URL}/rest/v1/soragodong_billing`, {
      method: 'POST',
      headers: { ...SB_HEADERS, 'Content-Type': 'application/json', 'Prefer': 'return=minimal,resolution=merge-duplicates' },
      body: JSON.stringify(payload)
    });
    if (!up.ok) {
      console.log(`  ❌ UPSERT ${up.status}: ${(await up.text()).slice(0, 200)}`);
      results.push({ email, ok: false });
      continue;
    }
    console.log(`  ✦ lifetime premium grant 완료. expires=${EXPIRES_AT}, cap=$${PREMIUM_CAP}/월`);
    results.push({ email, ok: true, action: b ? 'update' : 'insert' });
  }

  console.log('\n━━━ 요약 ━━━');
  for (const r of results) {
    const flag = r.ok ? '✓' : '✗';
    const note = r.action ? ` (${r.action})` : (r.isLifetime ? ' (이미 lifetime)' : '');
    console.log(`  ${flag} ${r.email}${note}`);
  }
  if (!doGrant) {
    console.log('\n→ 현황 조회만. lifetime 부여하려면 --confirm 추가.');
  }
}

// ─────────── main ───────────

async function main() {
  if (argMap.lifetime) {
    let emails = [];
    if (argMap.emails) {
      emails = String(argMap.emails).split(',').map(s => s.trim()).filter(Boolean);
    } else if (argMap.email) {
      emails = [argMap.email];
    } else if (argMap['emails-file']) {
      const path = argMap['emails-file'];
      if (!existsSync(path)) { console.error(`emails-file 없음: ${path}`); process.exit(1); }
      emails = readFileSync(path, 'utf-8').split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'));
    }
    if (!emails.length) { console.error('--lifetime 시 --emails=A,B 또는 --email=X 또는 --emails-file=path 필요'); process.exit(1); }
    const doGrant = !!argMap.confirm;
    await checkOrGrantLifetime(emails, doGrant);
    return;
  }
  if (argMap.merge) {
    const t = argMap['target-email'];
    const f = argMap['from-email'];
    if (!t || !f) {
      console.error('--merge 시 --target-email=A@email --from-email=B@email 필수');
      process.exit(1);
    }
    await mergeAccounts(t, f);
    return;
  }
  if (MODE === 'apply') {
    const email = argMap.email;
    if (!email) {
      console.error('--apply 시 --email=foo@bar.com 필수');
      process.exit(1);
    }
    const sourceName = argMap.source || 'v6_pre_v7';
    const snapshotIdx = argMap['snapshot-idx'] !== undefined
      ? parseInt(argMap['snapshot-idx'], 10)
      : null;
    await applyOne(email, sourceName, snapshotIdx);
    return;
  }

  // diagnose
  let emails = [];
  if (argMap.email) {
    emails = [argMap.email];
  } else if (argMap['emails-file']) {
    const path = argMap['emails-file'];
    if (!existsSync(path)) {
      console.error(`emails-file 없음: ${path}`);
      process.exit(1);
    }
    emails = readFileSync(path, 'utf-8')
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(l => l && !l.startsWith('#'));
  } else {
    console.error('--diagnose 시 --email=foo@bar.com 또는 --emails-file=path 필요');
    process.exit(1);
  }
  if (!emails.length) {
    console.error('이메일 0개');
    process.exit(1);
  }
  console.log(`진단 모드 — ${emails.length}명 처리...`);
  await diagnoseAll(emails);
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(99);
});
