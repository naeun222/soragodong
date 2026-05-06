// ═══════════════════════════════════════════════════════════════
// 결제 — 사용자 명시 2026-04-30 ultrathink: 충전 plan 폐기 → 2-tier 월정액 only
// ═══════════════════════════════════════════════════════════════

// 서버 _lib/billing.ts 의 TIER_PLANS 와 동기 — 위변조 방지로 결제 검증은 서버에서 재확인.
// description: 정직 톤 — 정량 KRW 표기 X, 정성적 설명만. cap 자체는 서버 운영 용도.
const TIER_PLANS_CLIENT = {
  light:          { krw: 9900,  cap_usd: 5,    cap_krw: 7000,  label: 'Light',          tagline: '매일의 자기관찰', emoji: '🐚',
    description: '일반 대화 + 분석 풀로. 매일의 자기관찰에 충분.' },
  premium:        { krw: 25000, cap_usd: 13,   cap_krw: 18000, label: 'Premium',        tagline: '깊게 자주', emoji: '🌊',
    description: '긴 대화 / 4단 분석 / 마법고동 큰 결정 / 주간·월간 회고 풀 활용. Opus 깊은 대화 30번/일.' },
  early_light:    { krw: 0,     cap_usd: 1.1,  cap_krw: 1400,  label: '얼리 플랜',       tagline: '체험', emoji: '🐚',
    description: '신규 가입자 자동 활성화 — 충분히 써보고 마음에 들면 구독.', auto_grant_first_month: true },
  // V4 (사용자 명시 2026-05-06): 얼리버드 = 정기구독 (4,900원/월 자동 갱신). "평생" = 이 가격이 평생 lock-in (출시 후에도 동일가 유지). 1회 결제 영구 X.
  early_lifetime: { krw: 4900,  cap_usd: 3.0,  cap_krw: 4200,  label: '얼리버드',   tagline: '출시 전 한정 가격 락인', emoji: '✨',
    description: '4,900원/월 자동 갱신. 출시 전 가입자만 — 이 가격은 평생 락인 (출시 후 인상 X). Light 수준 사용량. 언제든 해지 가능.' },
  // 게스트 = anonymous 사용자 자동 부여. 가입 시 early_light 로 fresh 갱신.
  guest:          { krw: 0,     cap_usd: 0.30, cap_krw: 420,   label: '게스트',          tagline: '한 번 써보기', emoji: '🌱',
    description: '계정 없이 ~15턴. 데이터는 이 기기에만. 로그인하면 종단간 암호화로 영구 보관.', is_guest: true }
};
// 사용자 명시 2026-05-02 ultrathink: light_pack 제거 — Premium 전용. Light/얼리는 Premium 전환 또는 다음 달 대기.
// V4 (사용자 명시 2026-05-04 ultrathink — v2 갱신): 추가팩 재설계 — 작은 단위 + 두 tier 다 가능. *24h 못 기다리는 사용자* trigger.
// 옛 5,000원 / +$4 (light) 와 7,000원 / +$5 (premium) 폐기.
const OVERAGE_PACKS_CLIENT = {
  light_pack:   { krw: 1500, usd: 1.0, label: 'Light 추가팩',   tier: 'light' },
  early_pack:   { krw: 1500, usd: 1.0, label: 'Light 추가팩',   tier: 'early_light' },
  premium_pack: { krw: 2500, usd: 1.5, label: 'Premium 추가팩', tier: 'premium' }
};
// V4 (사용자 명시 2026-05-04 ultrathink — v2): tier 별 일일 cap 비율 (월 cap × 비율 / 30 = 일일).
// Light /25 (마진 보호) — $5 × 1.2 / 30 = $0.20/일
// Premium /20 (여유, '마음껏 깊게' 약속) — $15 × 1.5 / 30 = $0.75/일
// Early /25 동일 (Light 와 동일 비율) — $4 × 1.2 / 30 = $0.16/일
const DAILY_CAP_RATIO = { light: 1.2, early_light: 1.2, premium: 1.5 };
function _getDailyCapUsd(plan) {
  const tier = TIER_PLANS_CLIENT[plan];
  if (!tier) return 0;
  const ratio = DAILY_CAP_RATIO[plan] || 1.2;
  return (tier.cap_usd || 0) * ratio / 30;
}
// Light → Premium 정가 결제 (사용자 명시 2026-05-02: 차액 결제 폐기 — 새 사이클 시작)
const TIER_UPGRADE_KRW = TIER_PLANS_CLIENT.premium.krw; // 25,000
// 옛 차액 변수 호환 (점진 정리 — sub_modal 의 일부 코드가 import)
const TIER_UPGRADE_DIFF_KRW = TIER_UPGRADE_KRW;

// 카톡 오픈채팅 (피드백·문의 채널, 익명 OK)
const KAKAO_OPEN_CHAT = 'https://open.kakao.com/o/sUP7kIsi';

// 사용자 명시 2026-05-06: 토스 수동 송금 폐기 → PortOne V2 카드 결제. TOSS_ACCOUNT / _generateUserMemoCode 제거.

// 사업자 정보 (전자상거래법 의무 노출). 사업자등록증·통신판매업 신고증 발급 후 빈 문자열만 채우면 자동 표시.
// 주소·연락처는 자택이라 민감 — settings UI 노출 X, 약관·환불·개인정보 마크다운에만 풀 명시 (전상법 §13 의무 자리). 사용자 명시 2026-04-30 ultrathink.
const BUSINESS_INFO = {
  name: '나은 랩(Lab)',                       // 상호
  representative: '김나은',                // 대표자
  business_no: '261-21-02592',             // 사업자등록번호 (2026-04-30, 일반과세)
  ecommerce_no: '2026-서울동작-0613',          // 통신판매업 신고번호 (2026-05-05 발급)
  address: '서울특별시 동작구 상도로47아길 14',  // 자택 — UI 노출 X, source of truth 만
  phone: '',                               // 연락처 (선택, 070 가상번호 발급 시)
  email: 'soragodongapp@gmail.com',        // 사업용 이메일 (CPO 공시용)
  cpo: '김나은'                             // 개인정보 보호책임자
};

// 사용자 명시 2026-05-06: 결제 흐름 = PortOne V2 카드 결제만. 옛 충전 / 토스 수동 송금 / V1 IMP 흐름 모두 폐기.
// 기존 charge 잔액 (credit_balance_usd > 0) 사용자: legacy 호환 — 그대로 차감, 0 도달 후 구독 안내.

