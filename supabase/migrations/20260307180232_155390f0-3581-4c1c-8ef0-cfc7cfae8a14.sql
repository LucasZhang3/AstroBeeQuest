
-- 1. Drop public UPDATE on results — only service-role (edge function) should write
DROP POLICY "Allow public update on results" ON public.results;

-- 2. Drop public INSERT on results — only service-role should insert
DROP POLICY "Allow public insert on results" ON public.results;

-- 3. Drop overly permissive UPDATE on responses — replace with scoped policy
DROP POLICY "Allow public update on responses" ON public.responses;

-- 4. Scoped UPDATE: only allow updating a response if the session_id matches an in_progress session
-- This prevents tampering with completed sessions' data
CREATE POLICY "Scoped update on responses" ON public.responses
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.sessions s
      WHERE s.id = responses.session_id
      AND s.status = 'in_progress'
    )
  );

-- 5. Drop overly permissive UPDATE on sessions — replace with scoped policy
DROP POLICY "Allow public update on sessions" ON public.sessions;

-- 6. Only allow updating sessions that are still in_progress
CREATE POLICY "Scoped update on sessions" ON public.sessions
  FOR UPDATE USING (status = 'in_progress');
