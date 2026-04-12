
-- Fix: sessions INSERT policy must be PERMISSIVE to allow access
DROP POLICY "Allow public insert on sessions" ON public.sessions;
CREATE POLICY "Allow public insert on sessions" ON public.sessions
  FOR INSERT WITH CHECK (true);

-- Also fix responses and email_captures INSERT policies
DROP POLICY "Allow public insert on responses" ON public.responses;
CREATE POLICY "Allow public insert on responses" ON public.responses
  FOR INSERT WITH CHECK (true);

DROP POLICY "Allow public insert on email_captures" ON public.email_captures;
CREATE POLICY "Allow public insert on email_captures" ON public.email_captures
  FOR INSERT WITH CHECK (true);

-- Fix sessions SELECT policy
DROP POLICY "Allow public select on sessions" ON public.sessions;
CREATE POLICY "Allow public select on sessions" ON public.sessions
  FOR SELECT USING (true);

-- Fix responses SELECT policy
DROP POLICY "Scoped select on responses" ON public.responses;
CREATE POLICY "Scoped select on responses" ON public.responses
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.sessions s
      WHERE s.id = responses.session_id
      AND s.status = 'in_progress'
    )
  );

-- Fix sessions UPDATE policy
DROP POLICY "Scoped update on sessions" ON public.sessions;
CREATE POLICY "Scoped update on sessions" ON public.sessions
  FOR UPDATE USING (status = 'in_progress');

-- Fix responses UPDATE policy
DROP POLICY "Scoped update on responses" ON public.responses;
CREATE POLICY "Scoped update on responses" ON public.responses
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.sessions s
      WHERE s.id = responses.session_id
      AND s.status = 'in_progress'
    )
  );
