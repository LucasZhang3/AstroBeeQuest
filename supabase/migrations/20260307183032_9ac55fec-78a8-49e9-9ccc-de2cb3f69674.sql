
-- Allow updating in_progress sessions, including transitioning to 'completed'
DROP POLICY "Scoped update on sessions" ON public.sessions;
CREATE POLICY "Scoped update on sessions" ON public.sessions
  FOR UPDATE
  USING (status = 'in_progress')
  WITH CHECK (status IN ('in_progress', 'completed'));
