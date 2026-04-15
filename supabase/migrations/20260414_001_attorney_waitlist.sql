CREATE TABLE IF NOT EXISTS attorney_waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  state text,
  county text,
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS attorney_waitlist_user_id_idx 
  ON attorney_waitlist(user_id);

ALTER TABLE attorney_waitlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own waitlist entry"
  ON attorney_waitlist
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
