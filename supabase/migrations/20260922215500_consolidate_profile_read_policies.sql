drop policy if exists "Published profiles are public" on public.profiles;
create policy "Published profiles are public"
on public.profiles
for select
to anon
using (is_published = true);

alter policy "Owners read their profile" on public.profiles
using (
  (select auth.uid()) = id
  or is_published = true
);

drop policy if exists "Published profile links are public" on public.profile_links;
create policy "Published profile links are public"
on public.profile_links
for select
to anon
using (
  is_visible = true
  and exists (
    select 1
    from public.profiles
    where profiles.id = profile_links.profile_id
      and profiles.is_published = true
  )
);

alter policy "Owners read their links" on public.profile_links
using (
  (select auth.uid()) = profile_id
  or (
    is_visible = true
    and exists (
      select 1
      from public.profiles
      where profiles.id = profile_links.profile_id
        and profiles.is_published = true
    )
  )
);

drop policy if exists "Published profile contacts are public" on public.profile_contacts;
create policy "Published profile contacts are public"
on public.profile_contacts
for select
to anon
using (
  is_visible = true
  and exists (
    select 1
    from public.profiles
    where profiles.id = profile_contacts.profile_id
      and profiles.is_published = true
  )
);

alter policy "Owners read their contacts" on public.profile_contacts
using (
  (select auth.uid()) = profile_id
  or (
    is_visible = true
    and exists (
      select 1
      from public.profiles
      where profiles.id = profile_contacts.profile_id
        and profiles.is_published = true
    )
  )
);

drop policy if exists "Published avatar files are public" on storage.objects;
create policy "Published avatar files are public"
on storage.objects
for select
to anon
using (
  bucket_id = 'avatars'
  and exists (
    select 1
    from public.profiles
    where profiles.id::text = (storage.foldername(name))[1]
      and profiles.is_published = true
  )
);

alter policy "Owners read their avatar files" on storage.objects
using (
  bucket_id = 'avatars'
  and (
    (storage.foldername(name))[1] = (select auth.uid()::text)
    or exists (
      select 1
      from public.profiles
      where profiles.id::text = (storage.foldername(name))[1]
        and profiles.is_published = true
    )
  )
);
