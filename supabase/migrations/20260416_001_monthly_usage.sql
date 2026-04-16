ALTER TABLE usage_limits
  ADD COLUMN IF NOT EXISTS billing_period date;

UPDATE usage_limits
  SET billing_period = date_trunc('month', date)::date
  WHERE billing_period IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS usage_limits_user_billing_period_idx
  ON usage_limits(user_id, billing_period);
