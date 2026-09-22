grant select on public.profiles to anon;
grant select on public.profile_links to anon;
grant select on public.profile_contacts to anon;

drop policy if exists "Published profiles are public" on public.profiles;
create policy "Published profiles are public"
on public.profiles
for select
to anon, authenticated
using (is_published = true);

drop policy if exists "Published profile links are public" on public.profile_links;
create policy "Published profile links are public"
on public.profile_links
for select
to anon, authenticated
using (
  is_visible = true
  and exists (
    select 1
    from public.profiles
    where profiles.id = profile_links.profile_id
      and profiles.is_published = true
  )
);

drop policy if exists "Published profile contacts are public" on public.profile_contacts;
create policy "Published profile contacts are public"
on public.profile_contacts
for select
to anon, authenticated
using (
  is_visible = true
  and exists (
    select 1
    from public.profiles
    where profiles.id = profile_contacts.profile_id
      and profiles.is_published = true
  )
);

drop policy if exists "Published avatar files are public" on storage.objects;
create policy "Published avatar files are public"
on storage.objects
for select
to anon, authenticated
using (
  bucket_id = 'avatars'
  and exists (
    select 1
    from public.profiles
    where profiles.id::text = (storage.foldername(name))[1]
      and profiles.is_published = true
  )
);

comment on policy "Published profiles are public" on public.profiles is
  'Only profiles explicitly published by their owners are readable without authentication.';
