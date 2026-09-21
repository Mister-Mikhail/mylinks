create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  handle text not null unique,
  display_name text not null default '',
  bio text not null default '',
  avatar_url text,
  background_preset text not null default 'midnight',
  card_preset text not null default 'glass',
  avatar_shape text not null default 'round',
  avatar_size text not null default 'medium',
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_handle_format check (handle ~ '^[a-z0-9][a-z0-9-]{2,29}$'),
  constraint profiles_background_preset check (background_preset in ('midnight','mist','cobalt')),
  constraint profiles_card_preset check (card_preset in ('glass','solid','outline')),
  constraint profiles_avatar_shape check (avatar_shape in ('round','square')),
  constraint profiles_avatar_size check (avatar_size in ('small','medium','large'))
);

create table public.profile_links (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  label text not null,
  url text not null,
  icon_key text not null default 'link',
  position integer not null default 0,
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profile_links_label_length check (char_length(label) between 1 and 80),
  constraint profile_links_url_length check (char_length(url) between 8 and 2048),
  constraint profile_links_url_protocol check (url ~* '^https?://')
);

create index profile_links_profile_position_idx on public.profile_links(profile_id, position);

create table public.account_capabilities (
  account_id uuid primary key references public.profiles(id) on delete cascade,
  tier_key text not null default 'free',
  feature_overrides jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

comment on table public.account_capabilities is
  'Internal capability boundary for future paid features. MVP accounts remain free-only.';

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at before update on public.profiles
for each row execute function public.touch_updated_at();

create trigger profile_links_touch_updated_at before update on public.profile_links
for each row execute function public.touch_updated_at();

create trigger account_capabilities_touch_updated_at before update on public.account_capabilities
for each row execute function public.touch_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_handle text;
  safe_handle text;
begin
  requested_handle := lower(coalesce(new.raw_user_meta_data ->> 'handle', split_part(new.email, '@', 1), 'profile'));
  safe_handle := regexp_replace(requested_handle, '[^a-z0-9-]+', '-', 'g');
  safe_handle := trim(both '-' from safe_handle);
  safe_handle := left(safe_handle, 30);

  if char_length(safe_handle) < 3 then
    safe_handle := 'user-' || left(new.id::text, 8);
  end if;

  if exists (select 1 from public.profiles where handle = safe_handle) then
    safe_handle := left(safe_handle, 21) || '-' || left(new.id::text, 8);
  end if;

  insert into public.profiles (id, handle, display_name)
  values (
    new.id,
    safe_handle,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1), 'New profile')
  );

  insert into public.account_capabilities (account_id, tier_key) values (new.id, 'free');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.profile_links enable row level security;
alter table public.account_capabilities enable row level security;

create policy "Owners read their profile" on public.profiles for select to authenticated
using (auth.uid() = id);

create policy "Owners update their profile" on public.profiles for update to authenticated
using (auth.uid() = id) with check (auth.uid() = id);

create policy "Owners insert their profile" on public.profiles for insert to authenticated
with check (auth.uid() = id);

create policy "Owners read their links" on public.profile_links for select to authenticated
using (auth.uid() = profile_id);

create policy "Owners add their links" on public.profile_links for insert to authenticated
with check (auth.uid() = profile_id);

create policy "Owners update their links" on public.profile_links for update to authenticated
using (auth.uid() = profile_id) with check (auth.uid() = profile_id);

create policy "Owners delete their links" on public.profile_links for delete to authenticated
using (auth.uid() = profile_id);

create policy "Owners read their capabilities" on public.account_capabilities for select to authenticated
using (auth.uid() = account_id);

revoke all on public.profiles from anon;
revoke all on public.profile_links from anon;
revoke all on public.account_capabilities from anon;

grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.profile_links to authenticated;
grant select on public.account_capabilities to authenticated;
