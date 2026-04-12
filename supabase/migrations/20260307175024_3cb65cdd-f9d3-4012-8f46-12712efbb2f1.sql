
CREATE TABLE public.email_captures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id)
);

ALTER TABLE public.email_captures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public insert on email_captures" ON public.email_captures
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public select on email_captures" ON public.email_captures
  FOR SELECT USING (true);
