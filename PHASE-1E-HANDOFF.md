# Phase 1E 핸드오프 — 일기 / 소라 사진 Supabase Storage 마이그 + 일기 q=0.85

> **작성**: 2026-05-20 ultrathink 진단 직후. 이 문서 하나로 next session 이 컨텍스트 0 에서 이어갈 수 있게.

---

## 0. TL;DR

진주 사진은 이미 Supabase Storage (Phase 1D, commit `0db6a9e`, 2026-05-18). **일기/소라 사진은 여전히 dataURL 로 JSONB row 안**. 매 saveToCloud 마다 row 전체 PATCH → cap 8MB 도달 + bandwidth 비용. 진주 Phase 1A~1D 패턴을 일기/소라 에 복제하는 작업.

`PEARL_DAILY_HARD_CAP = 50` 은 이미 적용 (commit `5f95024`). **이 작업은 마이그 + 일기 quality 업이 핵심**.

---

## 1. 운영 비용 컨텍스트 (왜 하나)

| 항목 | 현재 (JSONB inline) | Storage 후 |
|---|---|---|
| 1년 누적 row size / 사용자 | 50-150MB | 50-200KB |
| 월 egress (PATCH × 30/일) | ~2-3TB / 1000 사용자 | ~10GB |
| 월 비용 (Supabase Pro) | $250+ | ~$25-45 |
| 8MB row cap 도달 | 사진 30-40장 누적 시 | 무관 |

cap 도달 = `02-state.js:660-668` + `06-backup-migration.js:281-289` 의 `_SAVE_HARD_CAP_BYTES = 8 * 1024 * 1024` 가드 작동 → cloud 차단 → CS 폭발.

진주 Phase 1D 적용 후 → 진주 미디어 row 부담 90%↓ 검증됨. 일기/소라 도 동일 패턴.

---

## 2. 이미 완료된 것

| commit | 내용 |
|---|---|
| `7288e28` | 진주 사진 화질 0.65 → 0.85, 메인 addPearl 800 → 1024px |
| `5f95024` | 진주 하루 50장 hard cap (`_canAddPearlToday` helper, 4 entry guard) |

**일기/소라 는 변경 X**. 다음 단계.

---

## 3. Phase 1E 작업 범위

### 3.1 데이터 schema 변화

**옛**
```js
entry.photo = "data:image/jpeg;base64,..."     // legacy single
entry.photos = ["data:...", "data:...", ...]   // V4 multi
shell.photoThumb = "data:..."                  // mirror of entry.photo
shell.photos = ["data:...", ...]               // mirror
```

**새**
```js
entry.photoStorageKeys = [
  { kind: 'diary_photo', path: '<authUid>/diary_<dateK>_0_photo.bin' },
  { kind: 'diary_photo', path: '<authUid>/diary_<dateK>_1_photo.bin' },
  ...
]
// entry.photos / entry.photo 옛 dataURL = 마이그 후 제거 (forward-only 면 stale 유지 가능)

shell.photoStorageKey = entry.photoStorageKeys[0]  // mirror, 첫 사진만
shell.photoThumb = null  // 폐기
```

또는 더 단순한 옵션:
```js
entry.photoStorageKeys = ['<authUid>/diary_<dateK>_0_photo.bin', '...']
```

진주 패턴 (`pearl.storageKey = { photo: '<path>', video: '<path>', videoThumbnail: '<path>' }`) 와 약간 다른 점: 일기는 사진 여러 장이라 array 필요.

### 3.2 영향 파일 (예상 9개)

| # | 파일 | 변경 내용 |
|---|---|---|
| 1 | `src/scripts/main/03-auth/15-pearl-storage.js` | `_uploadPearlMedia` / `_downloadPearlMedia` 가 generic 가 되도록 추상화 또는 별도 `_uploadDiaryMedia` helper. 'pearls' bucket 재사용 (RLS policy 동일) 또는 'diary' 신규 bucket. |
| 2 | `src/scripts/main/23-archive/06b-diary-media-edit.js` | `_diaryReplacePhoto` / `_diaryAddPhoto` 가 dataURL 대신 Storage upload 후 `entry.photoStorageKeys[]` push. |
| 3 | `src/scripts/main/17-mood-vitality-sleep.js` | 체크인 submit 시 `currentCheckin.photos` (dataURL) → upload + entry.photoStorageKeys 저장. |
| 4 | `src/scripts/main/29-music.js` | `addCheckinPhoto` 가 Storage upload 로 변경 (line 333-348). |
| 5 | `src/scripts/main/23-archive/06-day-modal.js` | day modal 사진 render 시 storageKey 우선, dataURL fallback. `<img>` 대신 `<img data-storage-key>` + hydrate helper. |
| 6 | `src/scripts/main/23-archive/14-timeline-lens.js` | timeline `ig-photo-wrap` 동일 처리. |
| 7 | `src/scripts/main/13-shell-collection/15-checkin-shell.js` | shell 저장 시 photoStorageKey 만 mirror (옛 photoThumb dataURL 폐기). `_openCheckinShellStory` 도 storageKey hydrate. |
| 8 | `src/scripts/main/13-shell-collection/13-resume-mission-shell.js` | 미션 shell 모달도 photoThumb 표시 — storageKey hydrate 추가 (단 미션 사진은 미션 path 가 별도, 일기 X). |
| 9 | **신규** `src/scripts/main/23-archive/06c-diary-photo-storage.js` | 일기 사진 storage helper (upload / download / hydrate) — pearl-storage 패턴 복제. |
| 10 | **신규** `src/scripts/main/23-archive/06d-diary-migration.js` | 옛 dataURL → Storage 마이그 스크립트 (`02-pearl-migration.js` 패턴). |

### 3.3 핵심 helper 패턴 (`pearl-storage.js` 참고)

```js
// upload
async function _uploadDiaryPhoto(dateK, idx, bytes, masterKey) {
  if (!authUserId) throw new Error('비인증');
  if (!masterKey) throw new Error('master key 없음');
  const encrypted = await _e2eeEncryptBytes(bytes, masterKey);
  const path = `${authUserId}/diary_${dateK}_${idx}_photo.bin`;
  const url = `${SUPABASE_URL}/storage/v1/object/pearls/${path}`;  // pearls bucket 재사용
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/octet-stream',
      'x-upsert': 'true'
    },
    body: encrypted
  });
  if (!resp.ok) throw new Error(`upload ${resp.status}: ${await resp.text()}`);
  return { path };
}

// hydrate (render 시점)
async function _hydrateDiaryPhoto(storageKey, masterKey) {
  const url = `${SUPABASE_URL}/storage/v1/object/pearls/${storageKey}`;
  const resp = await fetch(url, {
    headers: { 'Authorization': `Bearer ${session.access_token}` }
  });
  if (!resp.ok) return null;
  const encrypted = new Uint8Array(await resp.arrayBuffer());
  const decrypted = await _e2eeDecryptBytes(encrypted, masterKey);
  const blob = new Blob([decrypted], { type: 'image/jpeg' });
  return URL.createObjectURL(blob);
}
```

---

## 4. 권장 실행 순서 (단계별 commit)

### Step 1 — Storage helper (생성만, 호출 X)
- 새 파일 `06c-diary-photo-storage.js` — upload / hydrate / 마이그 helper.
- `_canUsePearlStorage()` 와 동일 가드 (E2EE master key + non-tester + non-guest).
- commit: "diary photo storage helper 추가 (호출 X)".

### Step 2 — 새 일기 사진 forward-only 경로
- `06b-diary-media-edit.js` 의 `_diaryReplacePhoto` / `_diaryAddPhoto` 가 upload 후 `entry.photoStorageKeys[]` 저장.
- `entry.photos` (dataURL) 도 backward compat 유지 (둘 다 저장 — 마이그 동안 ↓).
- commit: "diary edit sheet — forward-path Storage upload".

### Step 3 — Reader sweep (storageKey 우선, dataURL fallback)
- `day-modal.js` + `timeline-lens.js` + `15-checkin-shell.js` 의 `<img src="${entry.photos[i]}">` → hydrate 호출 + 첫 fallback 으로 dataURL.
- `hydratePearlMedia` 패턴 (`13-shell-collection/00-pearl-media-hydrate.js`) 참고.
- commit: "diary photo reader — storageKey 자동 분기".

### Step 4 — 체크인 사진 신규 path
- `addCheckinPhoto` (`29-music.js:333`) + `submitCheckin` 의 `entry.photos` 처리 (`17-mood-vitality-sleep.js`) → Storage upload.
- shell 도 storageKey mirror.
- commit: "checkin photo — Storage upload + shell mirror".

### Step 5 — 일기 q=0.65 → q=0.85, 800 → 1024
- `06b-diary-media-edit.js` line 147 / 196 + `17-mood-vitality-sleep.js` (체크인 path) 의 `fileToResizedDataUrl` quality 인자 추가.
- **Step 4 끝난 후** (Storage 안전망 깔린 후) 만 적용.
- commit: "diary photo quality 0.65→0.85, 800→1024".

### Step 6 — 옛 dataURL 마이그 스크립트
- 새 파일 `06d-diary-migration.js` — `02-pearl-migration.js` 의 dryRun / apply / progress modal 패턴 복제.
- Settings UI box (`refreshPearlMigrationStatus` 패턴) + button.
- `_pearlMigAutoStart` 패턴 — load 5초 후 silent 마이그.
- commit: "diary photo 마이그 — dataURL → Storage 일괄".

### Step 7 — 마이그 검증 + 옛 dataURL 폐기
- 마이그 완료 사용자의 `entry.photos` (dataURL) 가 모두 storageKey 로 대체됐는지 검증.
- 4-6 주 운영 + 100% 마이그 확인 후, fallback path 제거. backward-compat 코드 정리.
- commit: "phase 1E cleanup — legacy entry.photos dataURL path 제거".

---

## 5. 안전 가드 (반드시)

### 5.1 E2EE 마스터키 race
**리스크**: 마스터키 없을 때 평문 cloud 유출 OR 빈 state 가 cloud 덮어쓰기 (옛 사고 패턴).
- `_canUsePearlStorage()` 가드 (master key + 인증) 모든 upload 앞에.
- `window._e2eePendingRecovery` 활성 시 saveState 자체 차단 (이미 `02-state.js:666-669` 가 한다 — 그대로 신뢰).
- saveToCloudNow 안 `_e2eePendingRecovery` 가드 (`06-backup-migration.js:254-257`).

### 5.2 부분 실패 → 부분 손실 방지
- 마이그 매 5개마다 saveToCloud (`_pearlMigApply` 패턴).
- 부분 실패 시 옛 dataURL 잔존 + 새 storageKey 추가 → reader 가 양쪽 보고 잘된 것 우선.
- 실패 retry button (Settings).

### 5.3 backward compat 기간 (최소 4-6 주)
- 일기 사진 reader = `entry.photoStorageKeys[i]` 우선 → 없으면 `entry.photos[i]` → 없으면 `entry.photo` (V3 legacy).
- 마이그 안 한 사용자 데이터 100% 안 깨짐.

### 5.4 byte-identical 가드
- 매 step commit 시 `npm run build && npm run verify` 통과 확인.
- `index.html` + `public/index.html` + `src/` 같이 add.

---

## 6. 검증 명령 (각 step 후)

```bash
npm run build
npm run verify
# byte-identical 통과 확인.

# 사용자 데이터 진단 (브라우저 console)
# 마이그 전:
(state.entries || []).filter(e => Array.isArray(e.photos) && e.photos.some(p => p && p.startsWith('data:'))).length
# 마이그 후:
(state.entries || []).filter(e => Array.isArray(e.photoStorageKeys) && e.photoStorageKeys.length > 0).length

# row size 확인 (실시간)
JSON.stringify(state).length / 1024 / 1024  // MB
# 마이그 전 사용자: ~5-50MB. 후: ~0.5-2MB.
```

---

## 7. 코드 참고 (Phase 1D 모범)

| 패턴 | 파일 | 함수 |
|---|---|---|
| Storage upload | `03-auth/15-pearl-storage.js` | `_uploadPearlMedia` |
| Storage download | `03-auth/15-pearl-storage.js` | `_downloadPearlMedia` |
| E2EE bytes 암복호 | `03-auth/15-pearl-storage.js` | `_e2eeEncryptBytes` / `_e2eeDecryptBytes` |
| dataURL → bytes | `03-auth/15-pearl-storage.js` | `_dataUrlToBytes` |
| 가용성 가드 | `13-shell-collection/01-pearl-media-capture.js` | `_canUsePearlStorage` |
| Capture flow | `13-shell-collection/01-pearl-media-capture.js` | `_attachPearlPhoto` |
| Hydrate (render 시점 blob URL) | `13-shell-collection/00-pearl-media-hydrate.js` | `hydratePearlMedia`, `pearlImgHtml` |
| Auto-branch reader | `13-shell-collection/00-pearl-media-hydrate.js` | `pearlImgHtml` (옛 dataURL / 신 storageKey 자동) |
| 마이그 dryRun | `13-shell-collection/02-pearl-migration.js` | `_pearlMigDryRun` |
| 마이그 apply | `13-shell-collection/02-pearl-migration.js` | `_pearlMigApply` |
| 마이그 progress modal | `13-shell-collection/02-pearl-migration.js` | `_pearlMigShowProgressModal` |
| 마이그 auto-start | `13-shell-collection/02-pearl-migration.js` | `_pearlMigAutoStart` (load 5초 후) |
| Settings UI | `13-shell-collection/02-pearl-migration.js` | `refreshPearlMigrationStatus` |

---

## 8. Next session 시작 프롬프트 (사용자 paste 용)

```
PHASE-1E-HANDOFF.md 읽어. 일기/소라 사진 Supabase Storage 마이그 + 일기 사진 q=0.85
적용 작업 이어서 진행. Step 1 (Storage helper 생성, 호출 X) 부터 시작해. 매 step 마다
commit 분리. ultrathink.
```

또는 한 step 만:
```
PHASE-1E-HANDOFF.md 의 Step 2 (diary edit sheet — forward-path Storage upload) 만 적용해.
앞서 Step 1 (helper 생성) 끝났는지 먼저 확인. ultrathink.
```

---

## 9. 비용 / 한도 결정 (이미 합의)

- **진주 하루 50장 hard cap** (적용 완료, `5f95024`).
- **일기 사진 3장 hard cap** (이미 적용, `DIARY_PHOTOS_MAX`).
- **소라 사진 1개/일 자동** (체크인 mirror, 별도 cap X).
- 합산 일 ~15-54장 hard. ~$54/월 / 1000 사용자 Storage + bandwidth.

---

## 10. 만약 Phase 1E 진행 중 발견된 새 risk

→ 이 문서 §5 (안전 가드) 에 추가하거나 별도 `PHASE-1E-RISKS.md` 작성. 다음 세션 참고.

**이번 ultrathink 진단 시점 미확인 risk**:
- iOS PWA 의 Storage cache 동작 (blob URL revoke timing).
- 사진 hydrate 가 화면 spike 시 한 번에 여러 GET → CDN cold start 시 ~수백 ms latency.
- 마이그 도중 사용자가 사진 추가/삭제 시 race (마이그 lock 동안 edit 차단 또는 큐잉).
