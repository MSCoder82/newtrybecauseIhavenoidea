-- Per-team social platform configuration (user-provided via UI)
-- Includes client_id, client_secret, endpoints, scopes, redirect_uri, and extras.

create table if not exists public.social_platform_configs (
  team_id bigint not null,
  platform text not null check (platform in ('youtube','facebook','instagram','linkedin')),
  client_id text,
  client_secret text,
  auth_url text,
  token_url text,
  scopes text,
  redirect_uri text,
  extra jsonb default '{}'::jsonb not null,
  created_by uuid,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  primary key (team_id, platform)
);

-- Optional helper to auto-update updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end; $$;

drop trigger if exists trg_social_platform_configs_updated_at on public.social_platform_configs;
create trigger trg_social_platform_configs_updated_at
before update on public.social_platform_configs
for each row execute function public.set_updated_at();

-- Public view (no secrets)
create or replace view public.social_platform_configs_public as
  select team_id,
         platform,
         client_id,
         auth_url,
         token_url,
         scopes,
         redirect_uri,
         extra,
         updated_at
    from public.social_platform_configs;

-- Enable RLS
alter table public.social_platform_configs enable row level security;

-- Policies assume you have a helper function user_belongs_to_team(team_id bigint) returning boolean
-- and that authenticated users carry team_id in metadata. Adjust as needed for your setup.

-- Allow team members to upsert their config
drop policy if exists insupd_team_configs on public.social_platform_configs;
create policy insupd_team_configs on public.social_platform_configs
  for all to authenticated
  using (public.user_belongs_to_team(team_id))
  with check (public.user_belongs_to_team(team_id));

-- Deny selecting secrets from base table by default (no explicit select policy beyond the above)
-- If you need the base table selectable by authenticated users, avoid exposing client_secret.

-- View policies (safe columns only)
alter table public.social_platform_configs_public enable row level security;
drop policy if exists sel_team_configs_public on public.social_platform_configs_public;
create policy sel_team_configs_public on public.social_platform_configs_public
  for select to authenticated
  using (public.user_belongs_to_team(team_id));

-- Note: Edge functions with service role may read client_secret from the base table server-side.

