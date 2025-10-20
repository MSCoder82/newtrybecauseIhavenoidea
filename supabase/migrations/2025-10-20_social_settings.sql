-- Social API settings per team
-- Run this in Supabase SQL editor or via migrations

-- Optional: ensure needed extension(s)
-- CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.social_settings (
  team_id integer PRIMARY KEY,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT social_settings_team_fk
    FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE
);

-- Simple trigger to auto-update timestamp on modification
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_social_settings_updated_at ON public.social_settings;
CREATE TRIGGER trg_social_settings_updated_at
BEFORE UPDATE ON public.social_settings
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- RLS: enable and add policies for team scoping
ALTER TABLE public.social_settings ENABLE ROW LEVEL SECURITY;

-- Allow team members to read their team's settings
DROP POLICY IF EXISTS social_settings_read ON public.social_settings;
CREATE POLICY social_settings_read ON public.social_settings
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.team_id = social_settings.team_id
  )
);

-- Allow chiefs to insert their team's settings
DROP POLICY IF EXISTS social_settings_insert ON public.social_settings;
CREATE POLICY social_settings_insert ON public.social_settings
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.team_id = social_settings.team_id
      AND p.role = 'chief'
  )
);

-- Allow chiefs to update their team's settings
DROP POLICY IF EXISTS social_settings_update ON public.social_settings;
CREATE POLICY social_settings_update ON public.social_settings
FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.team_id = social_settings.team_id
      AND p.role = 'chief'
  )
);

-- Optional: allow delete to chiefs (rarely needed)
DROP POLICY IF EXISTS social_settings_delete ON public.social_settings;
CREATE POLICY social_settings_delete ON public.social_settings
FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.team_id = social_settings.team_id
      AND p.role = 'chief'
  )
);

-- Helpful index for JSON ops if you later query by keys
-- CREATE INDEX IF NOT EXISTS social_settings_gin ON public.social_settings USING GIN (settings);

