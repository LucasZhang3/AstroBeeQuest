
-- 1. Drop public SELECT on results — frontend uses edge function (service role) only
DROP POLICY "Allow public select on results" ON public.results;

-- 2. Scope SELECT on responses to in_progress sessions only
-- This prevents reading questionnaire answers after session completion
DROP POLICY "Allow public select on responses" ON public.responses;

CREATE POLICY "Scoped select on responses" ON public.responses
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.sessions s
      WHERE s.id = responses.session_id
      AND s.status = 'in_progress'
    )
  );
