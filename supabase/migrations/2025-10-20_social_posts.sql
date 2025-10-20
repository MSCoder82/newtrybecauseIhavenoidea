-- Social posts captured from API feeds and stored per team

CREATE TABLE IF NOT EXISTS public.social_posts (
  id bigserial PRIMARY KEY,
  team_id integer NOT NULL,
  url text NOT NULL,
  network text,
  title text,
  published_at timestamptz,
  campaign_id integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT social_posts_team_fk
    FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE,
  CONSTRAINT social_posts_campaign_fk
    FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE SET NULL,
  CONSTRAINT social_posts_team_url_uniq UNIQUE (team_id, url)
);

-- Helpful indexes
CREATE INDEX IF NOT EXISTS social_posts_team_idx ON public.social_posts (team_id);
CREATE INDEX IF NOT EXISTS social_posts_published_idx ON public.social_posts (published_at DESC NULLS LAST);

-- RLS
ALTER TABLE public.social_posts ENABLE ROW LEVEL SECURITY;

-- Read: allow members of the team to see their team's posts
DROP POLICY IF EXISTS social_posts_read ON public.social_posts;
CREATE POLICY social_posts_read ON public.social_posts
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.team_id = social_posts.team_id
  )
);

-- Insert: allow any member of the team (UI auto-saves feed items)
DROP POLICY IF EXISTS social_posts_insert ON public.social_posts;
CREATE POLICY social_posts_insert ON public.social_posts
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.team_id = social_posts.team_id
  )
);

-- Update: allow team members to update (e.g., assign campaign)
DROP POLICY IF EXISTS social_posts_update ON public.social_posts;
CREATE POLICY social_posts_update ON public.social_posts
FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.team_id = social_posts.team_id
  )
);

-- Optional: only chiefs can delete
DROP POLICY IF EXISTS social_posts_delete ON public.social_posts;
CREATE POLICY social_posts_delete ON public.social_posts
FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.team_id = social_posts.team_id
      AND p.role = 'chief'
  )
);

