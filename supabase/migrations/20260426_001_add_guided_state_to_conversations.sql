ALTER TABLE IF EXISTS public.conversations
  ADD COLUMN IF NOT EXISTS guided_state jsonb DEFAULT NULL;
