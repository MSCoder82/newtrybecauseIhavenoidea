-- Ensure redirect_uri is always populated and consistent for team platform configs
-- Applies to both the base table (public.social_platform_configs) and the public view
-- Safe to run multiple times.

-- 1) Constant default Redirect URI used by the app
--    Change the string below if your canonical redirect URI changes.
create or replace function public.social_redirect_uri_default()
returns text
language sql
stable
as $$
  select 'https://newtrybecause-ihavenoidea.vercel.app'::text
$$;

-- 2) Backfill existing rows that have NULL/blank redirect_uri
update public.social_platform_configs
set redirect_uri = public.social_redirect_uri_default()
where redirect_uri is null or btrim(redirect_uri) = '';

-- 3) Set a default at the column level for future inserts
alter table public.social_platform_configs
  alter column redirect_uri set default public.social_redirect_uri_default();

-- 4) Enforce non-null at the schema level
alter table public.social_platform_configs
  alter column redirect_uri set not null;

-- 5) Guardrail: trigger to enforce the constant on insert/update
create or replace function public.enforce_social_redirect_uri()
returns trigger
language plpgsql
as $$
begin
  if new.redirect_uri is distinct from public.social_redirect_uri_default() then
    new.redirect_uri := public.social_redirect_uri_default();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_social_redirect_uri on public.social_platform_configs;
create trigger trg_enforce_social_redirect_uri
before insert or update on public.social_platform_configs
for each row execute function public.enforce_social_redirect_uri();

-- 6) Ensure the public view exposes redirect_uri (recreate to be explicit)
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

-- Note: RLS policies from your existing setup remain in effect.
--       This script only enforces the redirect URI value and visibility.

