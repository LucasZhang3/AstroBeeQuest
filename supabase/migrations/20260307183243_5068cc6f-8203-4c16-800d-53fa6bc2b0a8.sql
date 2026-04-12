
-- Allow upsert on email_captures by adding UPDATE policy
CREATE POLICY "Allow public update on email_captures" ON public.email_captures
  FOR UPDATE USING (true) WITH CHECK (true);
