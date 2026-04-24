CREATE INDEX IF NOT EXISTS idx_thread_messages_thread_id
ON public.thread_messages(thread_id);

CREATE INDEX IF NOT EXISTS idx_thread_messages_created_at
ON public.thread_messages(thread_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_document_chunks_document_id
ON public.document_chunks(document_id);

CREATE INDEX IF NOT EXISTS idx_case_intelligence_case_id
ON public.case_intelligence(case_id);

CREATE INDEX IF NOT EXISTS idx_case_intelligence_updated_at
ON public.case_intelligence(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_threads_case_id
ON public.threads(case_id);
