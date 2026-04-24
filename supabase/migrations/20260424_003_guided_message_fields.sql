ALTER TABLE IF EXISTS public.messages
  ADD COLUMN IF NOT EXISTS case_id uuid REFERENCES public.cases(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS message_metadata jsonb;

CREATE INDEX IF NOT EXISTS idx_messages_case_id
  ON public.messages(case_id, created_at DESC);
