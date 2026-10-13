-- Permit URL-safe punctuation in user handles across UI, public routes and auth creation.
alter table public.profiles drop constraint if exists profiles_handle_format;
alter table public.profiles
  add constraint profiles_handle_format
  check (handle ~ '^[a-z0-9][a-z0-9._-]{1,28}[a-z0-9]$');

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
  safe_handle := regexp_replace(requested_handle, '[^a-z0-9._-]+', '', 'g');
  safe_handle := regexp_replace(safe_handle, '^[._-]+|[._-]+$', '', 'g');
  safe_handle := left(safe_handle, 30);

  if char_length(safe_handle) < 3
     or safe_handle !~ '^[a-z0-9][a-z0-9._-]{1,28}[a-z0-9]$'
     or safe_handle in ('admin','auth','p','assets','icons','sounds','fonts','share-image') then
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

  insert into public.account_capabilities (account_id, tier_key)
  values (new.id, 'free');

  return new;
end;
$$;
