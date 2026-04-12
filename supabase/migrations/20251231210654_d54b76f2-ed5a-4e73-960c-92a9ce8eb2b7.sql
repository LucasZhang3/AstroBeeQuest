-- Create sessions table
CREATE TABLE public.sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  current_scene INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed'))
);

-- Create responses table
CREATE TABLE public.responses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  scene_number INTEGER NOT NULL CHECK (scene_number >= 1 AND scene_number <= 12),
  user_text TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (session_id, scene_number)
);

-- Enable RLS but allow public access (no auth required per spec)
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.responses ENABLE ROW LEVEL SECURITY;

-- Public read/write policies for sessions (no auth)
CREATE POLICY "Allow public insert on sessions" ON public.sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public select on sessions" ON public.sessions FOR SELECT USING (true);
CREATE POLICY "Allow public update on sessions" ON public.sessions FOR UPDATE USING (true);

-- Public read/write policies for responses (no auth)
CREATE POLICY "Allow public insert on responses" ON public.responses FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public select on responses" ON public.responses FOR SELECT USING (true);
CREATE POLICY "Allow public update on responses" ON public.responses FOR UPDATE USING (true);