-- ============================================================
-- 소라고동 V4 — 현금영수증 + 수정 영수증 자동 발급 (한국 사업자 의무)
-- 사용자 명시 2026-05-09 ultrathink (audit FAIL #8 + 사용자 명시): 부가가치세법 §32-2 자진발급 의무 충족.
-- 실행: Supabase Dashboard → SQL Editor → 붙여넣기 → Run. 멱등.
-- ============================================================

-- payments 에 영수증 URL + 현금영수증 발급 상태 컬럼 추가.
ALTER TABLE soragodong_payments
  ADD COLUMN IF NOT EXISTS receipt_url TEXT,
  ADD COLUMN IF NOT EXISTS cash_receipt_status TEXT,    -- 'ISSUED' / 'CANCELLED' / 'NONE' / null
  ADD COLUMN IF NOT EXISTS cash_receipt_type TEXT;      -- 'PERSONAL' / 'CORPORATE' / 'SELF_ISSUE'

COMMENT ON COLUMN soragodong_payments.receipt_url IS
  'PortOne V2 receipt URL — 결제·환불 시 갱신. 사용자에게 영수증 다운로드 링크 제공.';
COMMENT ON COLUMN soragodong_payments.cash_receipt_status IS
  '현금영수증 발급 상태. ISSUED=발급 완료 / CANCELLED=환불로 취소 / NONE=발급 X (카드 결제 외).';
COMMENT ON COLUMN soragodong_payments.cash_receipt_type IS
  'PERSONAL=개인 소득공제용 (사용자 휴대폰), CORPORATE=사업자 지출증빙, SELF_ISSUE=자진발급(010-000-1234, 부가세법 §32-2 의무).';
