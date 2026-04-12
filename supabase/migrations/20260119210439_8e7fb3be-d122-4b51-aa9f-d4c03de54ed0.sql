-- Create results table for storing scoring engine output
CREATE TABLE public.results (
  session_id UUID NOT NULL PRIMARY KEY REFERENCES public.sessions(id) ON DELETE CASCADE,
  raw_scores JSONB NOT NULL DEFAULT '{}'::jsonb,
  normalized_scores JSONB NOT NULL DEFAULT '{}'::jsonb,
  percentages JSONB NOT NULL DEFAULT '{}'::jsonb,
  per_scene_details JSONB NOT NULL DEFAULT '[]'::jsonb,
  computed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add comment for documentation
COMMENT ON TABLE public.results IS 'Stores deterministic scoring engine results with full trace for debugging';
COMMENT ON COLUMN public.results.raw_scores IS 'Accumulated per-type contributions across all scenes';
COMMENT ON COLUMN public.results.normalized_scores IS 'Normalized scores corrected for structural bias';
COMMENT ON COLUMN public.results.percentages IS 'Final percentages summing to 100';
COMMENT ON COLUMN public.results.per_scene_details IS 'Full trace including axis contributions and caps per scene';

-- Enable Row Level Security
ALTER TABLE public.results ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (matches existing session/response policies)
CREATE POLICY "Allow public insert on results"
ON public.results
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Allow public select on results"
ON public.results
FOR SELECT
USING (true);

CREATE POLICY "Allow public update on results"
ON public.results
FOR UPDATE
USING (true);

-- Create index for faster lookups
CREATE INDEX idx_results_computed_at ON public.results(computed_at DESC);