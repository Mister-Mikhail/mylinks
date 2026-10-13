-- Show availability without exposing unpublished profiles or account details.
-- The unique constraint on profiles.handle remains the final concurrency guard.
create or replace function public.is_handle_available(candidate text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and candidate = lower(trim(candidate))
    and candidate ~ '^[a-z0-9][a-z0-9._-]{1,28}[a-z0-9]$'
    and candidate not in ('admin','auth','p','assets','icons','sounds','fonts','share-image')
    and not exists (
      select 1 from public.profiles p
      where p.handle = candidate and p.id <> auth.uid()
    );
$$;

revoke all on function public.is_handle_available(text) from public, anon;
grant execute on function public.is_handle_available(text) to authenticated;
