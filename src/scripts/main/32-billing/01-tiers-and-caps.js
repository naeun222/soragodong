// ═══════════════════════════════════════════════════════════════
// 결제 — 사용자 명시 2026-04-30 ultrathink: 충전 plan 폐기 → 2-tier 월정액 only
// V4 (사용자 명시 2026-05-11 ultrathink): tier 재구성 — 3-tier 정가화 + Plus 첫 달 무료 promo.
//   결제자 0 시점에서 reposition. 옛 "얼리버드 promo + 평생 락인" 정체성 폐기.
//   - Light(4,900, key=early_lifetime) — 정가 entry tier. trial X, 즉시 결제. 매일의 자기관찰 입문.
//   - Plus(9,900, key=light)            — 첫 달 무료 trial, 30일 후 자동 결제. SaaS 통념대로 mid tier 에 trial.
//   - Premium(25,000, key=premium)      — 정가 top. anchor.
//   ⚠ key 와 label 매핑 헷갈림 주의:
//      key 'early_lifetime' = label 'Light' (legacy key 보존 — backend sync 위해)
//      key 'light'          = label 'Plus'  (trial flow 이쪽으로 이동)
//      key 'premium'        = label 'Premium' (변경 없음)
//   backend (`_lib/billing.ts`, `portone-register-trial.ts`, `cron-charge-recurring.ts`) sync 필요.
// ═══════════════════════════════════════════════════════════════

// 서버 _lib/billing.ts 의 TIER_PLANS 와 동기 — 위변조 방지로 결제 검증은 서버에서 재확인.
// description: 정직 톤 — 정량 KRW 표기 X, 정성적 설명만. cap 자체는 서버 운영 용도.
// V4 (사용자 명시 2026-05-11 — 가계약 단계): BILLING_RECURRING_ENABLED=false 일 때 일회성 1개월 이용권 — tagline/description 자동 분기.
// V4 (사용자 명시 2026-05-11 ultrathink — 정정): Plus 첫 달 무료 = 가계약/정기 양쪽 모두 활성. has_free_trial = 항상 true.
//   - 가계약: 결제 X, 카드 등록 X — backend `claim-free-trial` 흐름. 30일 후 만료 (자동 갱신 X). 1인 1회.
//   - 정기  : 카드 등록 + 30일 후 자동결제 — backend `portone-register-trial` 흐름. 1인 1회.
const _RECUR = (typeof BILLING_RECURRING_ENABLED !== 'undefined') ? BILLING_RECURRING_ENABLED : true;
const TIER_PLANS_CLIENT = {
  // Plus (9,900) — key 'light'. mid tier. 첫 달 무료 — RECUR 에 따라 카피만 분기.
  // V4 (사용자 명시 2026-05-13 ultrathink): description 재작성 — 일일 cap (정성) / 4단 심리 분석 일일 횟수 (정량) / Opus 유무.
  //   옛 카피 ('마법고동 큰 결정 / 주간·월간 회고 풀 활용') 폐기 — 두 기능 다 전 tier 공통이라 차별점 아님.
  light:          { krw: 9900,  cap_usd: 5,    cap_krw: 7000,  label: 'Plus',
    tagline: '깊게, 꾸준히 — 첫 달 무료',
    emoji: '🌊',
    description: _RECUR
      ? '일일 사용 한도 넉넉 · 4단 심리 분석 5회/일. 첫 달 무료 — 30일 후 자동 결제, 언제든 해지.'
      : '일일 사용 한도 넉넉 · 4단 심리 분석 5회/일. 첫 달 무료 — 30일 후 만료 (자동 결제 X). 1인 1회 한정.',
    has_free_trial: true },
  // Premium (25,000) — top tier anchor. 정가 결제. emoji ✨ (🐚🌊✨ 그라데이션 완성).
  premium:        { krw: 25000, cap_usd: 13,   cap_krw: 18000, label: 'Premium',        tagline: '마음껏 깊게', emoji: '✨',
    description: _RECUR
      ? '일일 사용 한도 풍부 · 4단 심리 분석 10회/일 · Opus 깊은 대화 30턴/일.'
      : '일일 사용 한도 풍부 · 4단 심리 분석 10회/일 · Opus 깊은 대화 30턴/일. 1개월 이용권 — 만료 후 재구매 (자동 갱신 X).' },
  // V4 (사용자 명시 2026-05-11 ultrathink — 정정): early_light plan 자동 활성화 폐기 → credit_balance_usd 환영 토큰 grant 으로 변경.
  //   backend `_lib/billing.ts:ensureBillingRow` = 신규 가입 시 WELCOME_TOKEN_USD ($1.1, 양 비공개) 만 grant. plan/subscription 활성화 X.
  //   funnel: 가입 → 환영 토큰 (소진까지, 시간 무관) → 사용자 명시 'Plus trial' 신청 (1인 1회, 카드 등록) → 정가 결제.
  //   이 tier 자체는 legacy 호환 보존만 (옛 plan='early_light' 자동 활성된 사용자 케이스).
  early_light:    { krw: 0,     cap_usd: 1.1,  cap_krw: 1400,  label: '얼리 플랜 (legacy)',       tagline: '레거시', emoji: '🐚',
    description: '레거시 tier. 신규 환영 토큰은 별도 grant (양 비공개) — 이 plan 은 자동 활성화 X.' },
  // Light (4,900) — key 'early_lifetime'. *정가 entry tier*. trial X, 즉시 결제.
  //   ⚠ key 명 'early_lifetime' 은 legacy — backend sync 위해 보존. 실제 정체성은 entry 'Light'.
  //   옛 "출시 전 가격 평생 락인" promo 폐기. cap_usd 도 sustainable 한 수준 ($3 → $2.2) 으로 조정.
  //   V4 (사용자 명시 2026-05-11 — 마진 조정): $1.8 → $2.2 (마진 14% — Plus 와 통일). 일일 cap $0.088.
  early_lifetime: { krw: 4900,  cap_usd: 2.2,  cap_krw: 3080,  label: 'Light',          tagline: '매일의 자기관찰', emoji: '🐚',
    description: _RECUR
      ? '일일 사용 한도 가벼움 · 4단 심리 분석 3회/일.'
      : '일일 사용 한도 가벼움 · 4단 심리 분석 3회/일. 1개월 이용권 — 만료 후 재구매 (자동 갱신 X).' },
  // 게스트 = anonymous 사용자 자동 부여. 가입 시 early_light 로 fresh 갱신.
  guest:          { krw: 0,     cap_usd: 0.30, cap_krw: 420,   label: '게스트',          tagline: '한 번 써보기', emoji: '🌱',
    description: '계정 없이 ~15턴. 데이터는 이 기기에만. 로그인하면 종단간 암호화로 영구 보관.', is_guest: true }
};
// V4 (사용자 명시 2026-05-13 ultrathink): light_pack / early_pack dead code 제거.
//   backend `_lib/billing.ts:OVERAGE_PACKS` = premium_pack only + `overage-pack.ts:isPremium` 가드 라
//   Light/Plus 사용자가 누르면 backend 가 거부함. UI 노출 자체가 dead-end 였어 — 청소.
//   Light/Plus 사용자는 cap 도달 시 다음 날 (4AM KST) 대기 또는 Premium 업그레이드.
const OVERAGE_PACKS_CLIENT = {
  premium_pack: { krw: 2500, usd: 1.5, label: 'Premium 추가팩', tier: 'premium' }
};
// V4 (사용자 명시 2026-05-04 ultrathink — v2): tier 별 일일 cap 비율 (월 cap × 비율 / 30 = 일일).
// Light(entry) /25 (마진 보호) — $2.2 × 1.2 / 30 ≈ $0.088/일
// Plus       /25 (마진 보호) — $5  × 1.2 / 30 = $0.20/일
// Premium    /20 (여유, '마음껏 깊게' 약속) — $13 × 1.5 / 30 = $0.65/일
// Early_light(legacy) /25 동일 — $1.1 × 1.2 / 30 ≈ $0.044/일
// 일일 cap reset = getDayKey() (4AM KST cutoff). 매일 새로.
const DAILY_CAP_RATIO = { early_lifetime: 1.2, light: 1.2, early_light: 1.2, premium: 1.5 };
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

// 카톡 오픈채팅 (피드백·문의 채널)
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

