-- ============================================================
-- 소라고동 V4 — 사용량 분석 dashboard RPC
-- 사용자 명시 2026-05-02 ultrathink: admin (jade6679@naver.com) 가 endpoint / model / day / user 별
-- 비용 분포 보고 절감 우선순위 결정. service_role SECURITY DEFINER (RLS 우회 — admin 전용 backend 호출만).
-- 실행 방법: Supabase Dashboard → SQL Editor → 붙여넣기 → Run
-- 멱등 (CREATE OR REPLACE — 이미 있어도 안전)
-- ============================================================

CREATE OR REPLACE FUNCTION get_usage_summary(
  p_days INT,
  p_group_by TEXT
) RETURNS JSONB AS $$
DECLARE
  v_cutoff TIMESTAMPTZ;
  v_rows JSONB;
  v_total JSONB;
BEGIN
  v_cutoff := NOW() - (p_days::TEXT || ' days')::INTERVAL;

  IF p_group_by = 'endpoint' THEN
    SELECT
      jsonb_agg(jsonb_build_object(
        'key', endpoint, 'calls', calls,
        'input_tokens', input_tokens, 'output_tokens', output_tokens,
        'cache_read_tokens', cache_read_tokens, 'cost_usd', cost_usd
      ) ORDER BY cost_usd DESC)
      , jsonb_build_object(
        'calls', SUM(calls), 'input_tokens', SUM(input_tokens),
        'output_tokens', SUM(output_tokens), 'cache_read_tokens', SUM(cache_read_tokens),
        'cost_usd', SUM(cost_usd)
      )
    INTO v_rows, v_total
    FROM (
      SELECT
        endpoint,
        COUNT(*)::BIGINT AS calls,
        SUM(input_tokens)::BIGINT AS input_tokens,
        SUM(output_tokens)::BIGINT AS output_tokens,
        SUM(cache_read_tokens)::BIGINT AS cache_read_tokens,
        SUM(cost_usd) AS cost_usd
      FROM soragodong_usage
      WHERE recorded_at >= v_cutoff
      GROUP BY endpoint
    ) t;
  ELSIF p_group_by = 'model' THEN
    SELECT
      jsonb_agg(jsonb_build_object(
        'key', model, 'calls', calls,
        'input_tokens', input_tokens, 'output_tokens', output_tokens,
        'cache_read_tokens', cache_read_tokens, 'cost_usd', cost_usd
      ) ORDER BY cost_usd DESC)
      , jsonb_build_object(
        'calls', SUM(calls), 'input_tokens', SUM(input_tokens),
        'output_tokens', SUM(output_tokens), 'cache_read_tokens', SUM(cache_read_tokens),
        'cost_usd', SUM(cost_usd)
      )
    INTO v_rows, v_total
    FROM (
      SELECT
        model,
        COUNT(*)::BIGINT AS calls,
        SUM(input_tokens)::BIGINT AS input_tokens,
        SUM(output_tokens)::BIGINT AS output_tokens,
        SUM(cache_read_tokens)::BIGINT AS cache_read_tokens,
        SUM(cost_usd) AS cost_usd
      FROM soragodong_usage
      WHERE recorded_at >= v_cutoff
      GROUP BY model
    ) t;
  ELSIF p_group_by = 'user' THEN
    SELECT
      jsonb_agg(jsonb_build_object(
        'key', user_id::TEXT, 'calls', calls,
        'input_tokens', input_tokens, 'output_tokens', output_tokens,
        'cache_read_tokens', cache_read_tokens, 'cost_usd', cost_usd
      ) ORDER BY cost_usd DESC)
      , jsonb_build_object(
        'calls', SUM(calls), 'input_tokens', SUM(input_tokens),
        'output_tokens', SUM(output_tokens), 'cache_read_tokens', SUM(cache_read_tokens),
        'cost_usd', SUM(cost_usd)
      )
    INTO v_rows, v_total
    FROM (
      SELECT
        user_id,
        COUNT(*)::BIGINT AS calls,
        SUM(input_tokens)::BIGINT AS input_tokens,
        SUM(output_tokens)::BIGINT AS output_tokens,
        SUM(cache_read_tokens)::BIGINT AS cache_read_tokens,
        SUM(cost_usd) AS cost_usd
      FROM soragodong_usage
      WHERE recorded_at >= v_cutoff
      GROUP BY user_id
    ) t;
  ELSIF p_group_by = 'day' THEN
    SELECT
      jsonb_agg(jsonb_build_object(
        'key', day, 'calls', calls,
        'input_tokens', input_tokens, 'output_tokens', output_tokens,
        'cache_read_tokens', cache_read_tokens, 'cost_usd', cost_usd
      ) ORDER BY day DESC)
      , jsonb_build_object(
        'calls', SUM(calls), 'input_tokens', SUM(input_tokens),
        'output_tokens', SUM(output_tokens), 'cache_read_tokens', SUM(cache_read_tokens),
        'cost_usd', SUM(cost_usd)
      )
    INTO v_rows, v_total
    FROM (
      SELECT
        TO_CHAR(recorded_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD') AS day,
        COUNT(*)::BIGINT AS calls,
        SUM(input_tokens)::BIGINT AS input_tokens,
        SUM(output_tokens)::BIGINT AS output_tokens,
        SUM(cache_read_tokens)::BIGINT AS cache_read_tokens,
        SUM(cost_usd) AS cost_usd
      FROM soragodong_usage
      WHERE recorded_at >= v_cutoff
      GROUP BY day
    ) t;
  ELSE
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid group_by — endpoint / model / user / day 만 허용');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'rows', COALESCE(v_rows, '[]'::jsonb),
    'total', COALESCE(v_total, jsonb_build_object(
      'calls', 0, 'input_tokens', 0, 'output_tokens', 0, 'cache_read_tokens', 0, 'cost_usd', 0
    )),
    'cutoff', v_cutoff,
    'group_by', p_group_by,
    'days', p_days
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 검증 쿼리:
-- SELECT get_usage_summary(7, 'endpoint');
-- SELECT get_usage_summary(30, 'model');
-- SELECT get_usage_summary(7, 'day');
