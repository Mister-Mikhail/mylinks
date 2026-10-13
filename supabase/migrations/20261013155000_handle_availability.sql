-- Availability returns only a boolean. It must see private draft handles too.
create or replace function public.is_handle_available(candidate text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select auth.uid() is not null and candidate is not null
    and candidate = lower(trim(candidate))
    and ((char_length(candidate) between 3 and 30 and candidate ~ '^[a-z]+([._][a-z]+)?$') or exists(select 1 from public.profiles where id=auth.uid() and handle=candidate and handle not like 'draft-%'))
    and candidate not in ('admin','auth','p','assets','icons','sounds','fonts','share-image')
    and not exists (select 1 from public.profiles p where p.handle = candidate and p.id is distinct from auth.uid());
$$;

revoke all on function public.is_handle_available(text) from public, anon, authenticated;
grant execute on function public.is_handle_available(text) to authenticated;

-- Email-only signups receive an opaque private draft until the wizard claims an address.
-- Other account creation paths retain their existing fallback behavior.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_handle text;
  safe_handle text;
  requested_name text;
begin
  requested_handle := lower(coalesce(new.raw_user_meta_data ->> 'handle', split_part(new.email, '@', 1), 'profile'));
  requested_name := coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1), 'New profile');

  if coalesce(new.raw_user_meta_data ->> 'onboarding_version', '') = '2' then
    safe_handle := 'draft-' || right(replace(new.id::text, '-', ''),24);
    requested_name := '';
  else
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
  end if;

  insert into public.profiles (id, handle, display_name)
  values (new.id, safe_handle, requested_name);

  insert into public.account_capabilities (account_id, tier_key)
  values (new.id, 'free');

  return new;
end;
$$;

