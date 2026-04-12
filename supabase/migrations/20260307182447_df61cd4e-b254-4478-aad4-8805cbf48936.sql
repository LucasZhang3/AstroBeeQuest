
-- 1. Add one-time scoring flag to prevent repeated LLM calls
ALTER TABLE public.sessions ADD COLUMN scoring_requested boolean NOT NULL DEFAULT false;

-- 2. Add DB-level email format validation
ALTER TABLE public.email_captures
  ADD CONSTRAINT email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$');
