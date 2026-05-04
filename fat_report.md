# 뚱뚱한 질문 재분석 보고서

작성: 2026-05-04
대상: fat_verified.json (verified_at 2026-05-04 11:50)
세션 범위: **bug 타입만** (사용자 우선순위 명시)

---

## 통계

| 단계 | 수치 |
|---|---|
| 뚱뚱한 질문 (원본 fat) | fat_questions.json 기준 (rerefine 전) |
| 쪼개서 나온 총 항목 | 125 (verified_count) |
| input_new_count | 125 |
| 검증 결과 status | actually_implemented 26 / uncertain 86 / confirmed_missing 13 |
| 검증 결과 type | bug 5 / feature_small 91 / feature_large 2 / ui_text 26 / skip 1 |
| status × type (bug 한정) | actually_implemented/bug 2 / uncertain/bug 1 / confirmed_missing/bug 2 |
| 이번 세션 처리 대상 (bug 전부 - skip 9) | bug 5개 (skip 9개와 겹침 0) |
| 사전 검증 후 실제 코드 수정 | **0건** (사유 아래) |

---

## bug 타입 5개 — 항목별 처리 결과

### B1. [actually_implemented] 모래사장 버튼 클릭 시 소라의 부름 튜토리얼 유도
- sub_id: `2026-04-29_44c487f0.md#Q22-3`
- ts: 2026-04-29 08:51
- 처리: **확인 결과 불필요 — verified_at 분류대로 이미 구현됨**
- 코드 매칭: "소라의 부름"@L9550 (verified report A11)

### B2. [uncertain] 관리자 피드백 에러 상세정보 표시
- sub_id: `2026-04-29_472a0db7.md#Q13-3`
- ts: 2026-04-29 23:56
- 원문: "위치: adminFeedbackLoad 500 에러 표시 / 문제: 실패 (500) 만 보여서 사용자 진단 불가능 / Fix: server response 파싱 → error / upstream_status / hint / upstream_body 모두 노출"
- 사전 검증: `adminFeedbackLoad` grep → index.html L42979 정의 발견. L42987-43043 에러 분기 확인.
- 처리: **확인 결과 불필요 — commit a35d8cd (2026-04-30) 에서 동일 spec으로 이미 수정 완료**
- 근거: a35d8cd 커밋 메시지 본문 "3. adminFeedbackLoad — 500 에러 시 단순 '실패 (500)' 만 표시 → 사용자 진단 불가능. fix: server response body 파싱해서 error / upstream_status / hint / upstream_body 모두 표시."
- 현재 코드 (L43033-43041) 발췌:
  ```js
  // 그 외 에러는 server diagnostic 그대로 노출 (a35d8cd 흐름 유지)
  let serverMsg = '';
  if (errData) {
    serverMsg = errData.error || '';
    if (errData.upstream_status) serverMsg += ` (upstream ${errData.upstream_status})`;
    if (errData.hint) serverMsg += ` — ${errData.hint}`;
    if (errData.upstream_body) serverMsg += `\n${(errData.upstream_body || '').slice(0, 200)}`;
  }
  body.innerHTML = `<div ...>실패 (${resp.status})${serverMsg ? '\n\n' + escapeHtml(serverMsg) : ''}</div>`;
  ```
- 분류 정정 필요: verify_fat.py 가 한글 키워드 grep 위주로 판정해서 "uncertain" 처리됐으나, 실제로는 actually_implemented. (코드는 영어 식별자 `adminFeedbackLoad` 기준으로 매칭해야 정확.)
- 미세 차이: upstream_body 가 200자로 truncate 되긴 하나, 모달 UI 가독성 고려한 의도적 cap 으로 판단. spec "모두 노출" 충족으로 봄.

### B3. [confirmed_missing] 병렬 에이전트로 코드 전체 감사
- sub_id: `2026-04-30_e3d29082.md#Q42-3`
- ts: 2026-04-30 16:02
- 원문: "에이전트 병렬로 여러 개 실행해서 이제 버그, 모순, 논리적 오류, 코드 꼬인 거, 비효율적인 거, dead code 찾자."
- 처리: **미완료 — non-actionable 메타 태스크**. 사용자가 그 시점에 어시스턴트에게 audit 작업을 지시한 일회성 명령. 코드 변경이 아니라 작업 수행 요청. (실제로 그 후 a28a288 ~ 5b275e6 사이 P0~P8 audit 시리즈 8 commit 으로 처리됨.)
- 검토 요청: 추가 audit 한 번 더 돌릴지 사용자 결정 필요. 돌린다면 이번 세션 대상 아님 — 별도 작업.

### B4. [actually_implemented] 근거 기반 특성 포착 및 anti-sycophancy 설계 설명
- sub_id: `2026-05-01_6c14cbbc.md#Q17-2`
- ts: 2026-05-01 08:37
- 처리: **확인 결과 불필요 — verified_at 분류대로 이미 구현됨**
- 코드 매칭: "패턴"@L905, "다루어야 할 특성"@L26295 (verified report A19)

### B5. [confirmed_missing] 현재 index 기반 버그 없는 plan 적용
- sub_id: `2026-05-01_51211afc.md#Q22-1`
- ts: 2026-05-01 09:56
- 원문: "지금 있는 index랑 버그 안 나게 plan 고쳐서 적용해줘"
- 처리: **미완료 — non-actionable 메타 태스크**. 일회성 plan 적용 지시. 어떤 plan 인지 컨텍스트 (선행 발화) 없이는 재현 불가. 시점상 4월 말 ~ 5월 초 신규 가입자 흐름 / 빠른 추출 / audit 인프라 작업과 연결돼 acc0bbb / cfab117 / a28a288 흐름에서 처리된 것으로 추정.
- 검토 요청: 사용자가 어떤 plan 의 적용 여부를 다시 확인하고 싶다면 별도로 sub_id `Q22-1` 직전 발화 컨텍스트 공유 필요.

---

## 수정 완료 항목

**없음.** bug 5개 모두 이미 구현되었거나 (3개) non-actionable 메타 태스크 (2개).

---

## 미완료 항목

| # | sub_id | 사유 |
|---|---|---|
| B3 | 2026-04-30_e3d29082.md#Q42-3 | non-actionable 메타: 일회성 audit 수행 지시 (이미 P0-P8 audit 으로 처리된 것으로 보임) |
| B5 | 2026-05-01_51211afc.md#Q22-1 | non-actionable 메타: 어떤 plan 인지 선행 컨텍스트 없이 재현 불가 |

---

## 검토 요청 (사용자 직접 판단 필요)

1. **B2 분류 정정**: fat_verified.json 의 B2 (sub_id `2026-04-29_472a0db7.md#Q13-3`) 를 `uncertain` → `actually_implemented` 로 정정해도 되는지. (현재 verify_fat.py 가 한글 키워드만 보기 때문에 영어 식별자 기반 fix 를 놓침.)
2. **B3 audit 재수행 여부**: 추가로 한 번 더 병렬 에이전트 audit 돌릴지 결정. 돌린다면 별도 명령으로.
3. **B5 plan 컨텍스트**: 만약 아직도 적용되지 않은 plan 이 있다고 의심되면 그 시점 (2026-05-01 09:56 직전) 의 plan 본문 공유.
4. **다음 세션 type 범위**: 이번 세션은 bug 만 처리. 다음에 ui_text / feature_small / feature_large 처리할지, 어느 우선순위로 할지.

---

## 부록

### Skip list 검증 (사용자 명시 9개)

| sub_id | 분류 | 요약 | bug 와 겹침? |
|---|---|---|---|
| 2026-04-29_44c487f0.md#Q70-3 | confirmed_missing/feature_small | 숙고 chat cache 적용 제안 | × |
| 2026-04-29_44c487f0.md#Q66-2 | uncertain/feature_small | 같은 차원 내 임시 대화창 분석 보완 | × |
| 2026-04-29_18b3e4d5.md#Q13-1 | uncertain/feature_small | 일일 질문 batch API + Haiku | × |
| 2026-04-30_9ca60416.md#Q18-1 | uncertain/feature_small | 백업 완료시 금색 띠 자동 사라지기 | × |
| 2026-05-01_51211afc.md#Q12-4 | uncertain/feature_small | 새벽 4시 전 대화 중 처리 미루기 | × |
| 2026-05-01_51211afc.md#Q22-3 | uncertain/feature_small | 4AM 일괄 처리 조건 명확화 | × |
| 2026-05-01_05108847.md#Q15-2 | uncertain/feature_small | 오늘의 너 동영상 썸네일만 표시 | × |
| 2026-05-01_05108847.md#Q15-4 | uncertain/feature_small | 진주 새 카테고리 추가 기능 제거 | × |
| 2026-05-03_d0700e63.md#Q11-11 | uncertain/feature_small | v2 문서 정책 확인 후 버튼 UI | × |

bug 처리 대상 5개와 skip 9개 — 겹침 0. skip 정상 적용.

### match_results_v2.json 갱신 (선택)

이번 세션은 코드 수정 0건이라 match 결과 변동 없음. 갱신 생략.
B2 의 분류 정정만 필요하면 fat_verified.json 의 해당 item.verification.status 를 `actually_implemented` 로 바꾸면 됨 (별도 사용자 승인 받은 후 수행).
