
-- Fix email_captures INSERT policy: change from RESTRICTIVE to PERMISSIVE
DROP POLICY IF EXISTS "Allow public insert on email_captures" ON public.email_captures;
CREATE POLICY "Allow public insert on email_captures" ON public.email_captures
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);
