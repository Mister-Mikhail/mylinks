alter table public.profiles
add column avatar_path text;

create table public.profile_contacts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,
  label text not null default '',
  value text not null,
  position integer not null default 0,
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profile_contacts_kind check (kind in ('address', 'phone', 'email')),
  constraint profile_contacts_label_length check (char_length(label) <= 80),
  constraint profile_contacts_value_length check (char_length(value) between 1 and 500)
);

create index profile_contacts_profile_position_idx
on public.profile_contacts(profile_id, position);

create trigger profile_contacts_touch_updated_at
before update on public.profile_contacts
for each row execute function public.touch_updated_at();

alter table public.profile_contacts enable row level security;

create policy "Owners read their contacts" on public.profile_contacts
for select to authenticated
using ((select auth.uid()) = profile_id);

create policy "Owners add their contacts" on public.profile_contacts
for insert to authenticated
with check ((select auth.uid()) = profile_id);

create policy "Owners update their contacts" on public.profile_contacts
for update to authenticated
using ((select auth.uid()) = profile_id)
with check ((select auth.uid()) = profile_id);

create policy "Owners delete their contacts" on public.profile_contacts
for delete to authenticated
using ((select auth.uid()) = profile_id);

revoke all on public.profile_contacts from anon;
grant select, insert, update, delete on public.profile_contacts to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Owners read their avatar files" on storage.objects
for select to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "Owners upload their avatar files" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "Owners update their avatar files" on storage.objects
for update to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
)
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "Owners delete their avatar files" on storage.objects
for delete to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);
