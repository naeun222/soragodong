// V4 (사용자 명시 2026-05-14 ultrathink): 챕터 단위 surface 가드 — 5h+ gap archive 시 호출.
//   state._strategyChapterSurfacedIds 는 transient (02-state.js _SERIALIZE_TRANSIENT_KEYS 등록) 라 cloud 페이로드 strip.
function _strategyClearChapterFlag() {
  if (typeof state !== 'undefined' && state) {
    state._strategyChapterSurfacedIds = [];
  }
}
