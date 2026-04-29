-- ============================================================
-- 소라고동 V4 — 사용자 피드백 테이블
-- 사용자 요청 2026-04-30: 인앱 메시지 (settings → 피드백·문의 → 앱에서 메시지)
-- 실행: Supabase Dashboard → SQL Editor → Run (멱등)
-- ============================================================

CREATE TABLE IF NOT EXISTS soragodong_feedback (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email TEXT,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',  -- 'open' | 'reading' | 'replied' | 'closed'
  admin_reply TEXT,
  replied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feedback_status ON soragodong_feedback(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_user ON soragodong_feedback(user_id, created_at DESC);

-- RLS: 본인 메시지 + 본인이 받은 admin_reply 조회만 가능. INSERT는 service_role.
ALTER TABLE soragodong_feedback ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users read own feedback" ON soragodong_feedback;
CREATE POLICY "users read own feedback"
  ON soragodong_feedback FOR SELECT
  USING (auth.uid() = user_id);
