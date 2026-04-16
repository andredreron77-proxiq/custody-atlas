ALTER TABLE user_profiles 
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS subscription_status text;

CREATE INDEX IF NOT EXISTS idx_user_profiles_stripe_customer 
  ON user_profiles(stripe_customer_id);
