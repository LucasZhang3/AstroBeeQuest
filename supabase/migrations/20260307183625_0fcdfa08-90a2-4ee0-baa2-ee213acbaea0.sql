
-- Upsert is no longer used from client, so remove broad UPDATE access on PII table
DROP POLICY IF EXISTS "Allow public update on email_captures" ON public.email_captures;
