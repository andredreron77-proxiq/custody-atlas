ALTER TABLE public.cases
ADD COLUMN IF NOT EXISTS situation_type text;

CREATE INDEX IF NOT EXISTS idx_cases_situation_type
ON public.cases(situation_type)
WHERE situation_type IS NOT NULL;
