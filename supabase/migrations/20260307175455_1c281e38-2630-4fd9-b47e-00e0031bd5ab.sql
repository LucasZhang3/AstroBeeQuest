
-- 1. Drop public SELECT on email_captures (emails should only be read server-side)
DROP POLICY "Allow public select on email_captures" ON public.email_captures;

-- 2. Add explicit deny DELETE policies on all tables
CREATE POLICY "No public delete on sessions" ON public.sessions FOR DELETE USING (false);
CREATE POLICY "No public delete on responses" ON public.responses FOR DELETE USING (false);
CREATE POLICY "No public delete on results" ON public.results FOR DELETE USING (false);
CREATE POLICY "No public delete on email_captures" ON public.email_captures FOR DELETE USING (false);
