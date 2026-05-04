// V3.13.x: "하루"를 04:00 cutoff로 정의 (디바이스 로컬 시간 새벽 4시 전은 어제, 4시 후는 오늘).
// 새벽 작업자 자연스러움 + 잠 자기 전 일기·체크인이 그 날의 기록으로 묶임.
// 해외 출장/여행 시 디바이스 시간대 자동 변경 → 그 지역 4시 cutoff (사용자 명시 2026-05-01: 그 해외 기준 OK).
const DAY_CUTOFF_HOUR = 4;
function getDayKey(input) {
  // 사용자 요청 2026-04-28: input 없으면 서버 시간 기반 (디바이스 시계 잘못돼도 정확)
  const t = input == null
    ? (typeof getServerNowMs === 'function' ? getServerNowMs() : Date.now())
    : (typeof input === 'string' ? new Date(input).getTime()
       : (input instanceof Date ? input.getTime() : input));
  const d = new Date(t - DAY_CUTOFF_HOUR * 3600000);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
function todayKey() { return getDayKey(); }


