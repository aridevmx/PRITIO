-- ─── 0023: Stripe billing sync ─────────────────────────────────────────────
-- Extends upsert_subscription() so the Stripe webhook can sync any lifecycle
-- status (active / trialing / past_due / canceled) instead of forcing
-- 'active'. The default p_status = 'active' keeps existing callers working.

CREATE OR REPLACE FUNCTION upsert_subscription(
  p_user_id UUID,
  p_plan TEXT,
  p_period_end TIMESTAMPTZ DEFAULT NULL,
  p_supporter_tier TEXT DEFAULT NULL,
  p_status TEXT DEFAULT 'active'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row subscriptions%ROWTYPE;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  IF p_status NOT IN ('active', 'trialing', 'past_due', 'canceled') THEN
    RAISE EXCEPTION 'invalid status: %', p_status;
  END IF;

  IF p_plan = 'lifetime' THEN
    INSERT INTO subscriptions (user_id, plan, status, current_period_end, lifetime_activated_at, supporter_tier)
    VALUES (p_user_id, 'lifetime', p_status, NULL, now(), COALESCE(p_supporter_tier, 'supporter'))
    ON CONFLICT (user_id) WHERE plan = 'lifetime'
    DO UPDATE SET
      status = EXCLUDED.status,
      lifetime_activated_at = COALESCE(subscriptions.lifetime_activated_at, EXCLUDED.lifetime_activated_at),
      supporter_tier = COALESCE(EXCLUDED.supporter_tier, subscriptions.supporter_tier),
      updated_at = now()
    RETURNING * INTO v_row;
  ELSIF p_plan = 'pro' THEN
    INSERT INTO subscriptions (user_id, plan, status, current_period_end, supporter_tier)
    VALUES (p_user_id, 'pro', p_status, p_period_end, NULL)
    ON CONFLICT (user_id) WHERE plan = 'pro'
    DO UPDATE SET
      status = EXCLUDED.status,
      current_period_end = EXCLUDED.current_period_end,
      updated_at = now()
    RETURNING * INTO v_row;
  ELSE
    RAISE EXCEPTION 'invalid plan: %', p_plan;
  END IF;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'user_id', v_row.user_id,
    'plan', v_row.plan,
    'status', v_row.status,
    'current_period_end', v_row.current_period_end,
    'lifetime_activated_at', v_row.lifetime_activated_at,
    'supporter_tier', v_row.supporter_tier
  );
END;
$$;
