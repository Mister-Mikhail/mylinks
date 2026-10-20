\set ON_ERROR_STOP on
create schema auth;
create schema storage;
create schema moderation;
create role anon;
create role authenticated;
create role service_role;
grant usage on schema auth,storage,moderation to authenticated;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid; $$;
create function auth.role() returns text language sql stable as $$ select current_user::text; $$;
create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb,deleted_at timestamptz);
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,owner uuid,owner_id text);
alter table storage.objects enable row level security;
create function storage.foldername(text) returns text[] language sql as $$ select string_to_array($1,'/'); $$;
create table moderation.staff(user_id uuid primary key,role text);
create table moderation.temporary_accounts(user_id uuid,status text);
create table moderation.audit(id bigint generated always as identity primary key,actor_id uuid references auth.users on delete set null,target_id uuid,action text,reason text,created_at timestamptz default now());
create table moderation.restrictions(target_id uuid primary key,kind text,reason text,actor_id uuid references auth.users on delete set null);
create function moderation.my_role() returns text language sql stable security definer set search_path='' as $$ select role from moderation.staff where user_id=auth.uid(); $$;

\i supabase/migrations/20260921182000_create_private_mylinks_mvp.sql
\i supabase/migrations/20260921200131_add_profile_contacts_and_private_avatars.sql
\i supabase/migrations/20260922015321_add_avatar_scale_and_sensitive_links.sql
\i supabase/migrations/20261013102244_allow_punctuation_in_handles.sql
\i supabase/migrations/20261013102436_onboarding_wizard.sql
\i supabase/migrations/20261013123000_admin_delete_account.sql
\i supabase/migrations/20261013155000_handle_availability.sql
\i supabase/migrations/20261013165845_coherent_onboarding_and_self_delete.sql
\i supabase/migrations/20261014124523_activation_avatar_followup.sql

create policy profile_deleting on public.profiles as restrictive for update to authenticated using(public.account_editable()) with check(public.account_editable());
create policy links_deleting on public.profile_links as restrictive for insert to authenticated with check(public.account_editable());
create policy storage_deleting on storage.objects as restrictive for insert to authenticated with check(public.account_editable());
grant select,insert,update,delete on storage.objects to authenticated;

-- Email-only signup produces no email-derived public name or chosen address.
insert into auth.users(id,email,raw_user_meta_data) values
 ('00000000-0000-4000-8000-000000000001','first@example.com','{"onboarding_version":2}'),
 ('00000000-0000-4000-8000-000000000002','second@example.com','{"onboarding_version":2}'),
 ('00000000-0000-4000-8000-000000000003','admin@example.com','{"handle":"adminuser","display_name":"Администратор"}');
insert into moderation.staff values('00000000-0000-4000-8000-000000000003','admin');
do $$ begin
 if exists(select 1 from public.profiles where id in ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002') and (handle not like 'draft-%' or display_name<>'' or is_published)) then raise exception 'email leaked into identity'; end if;
 if has_function_privilege('anon','public.is_handle_available(text)','execute') then raise exception 'anonymous availability access'; end if;
end; $$;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
select public.save_onboarding_identity('Анна Мария','anna.petrova');
do $$ declare candidate text; begin
 foreach candidate in array array['..','a..b','a__b','a.b_c','a.','_anna','anna1','анна','admin'] loop
   begin perform public.save_onboarding_identity('Анна',candidate); raise exception 'bad handle accepted: %',candidate;
   exception when invalid_parameter_value then null; end;
 end loop;
 begin perform public.save_onboarding_identity('Анна 123','anna'); raise exception 'digits in name accepted'; exception when invalid_parameter_value then null; end;
 if not public.is_handle_available('anna.petrova') then raise exception 'own handle not available'; end if;
end; $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
do $$ begin
 if public.is_handle_available('anna.petrova') then raise exception 'collision not detected'; end if;
 begin perform public.save_onboarding_identity('Вторая Анна','anna.petrova'); raise exception 'collision accepted'; exception when invalid_parameter_value then null; end;
 begin perform public.staff_prepare_account_deletion('00000000-0000-4000-8000-000000000001','anna.petrova','test'); raise exception 'ordinary account deleted another'; exception when insufficient_privilege then null; end;
end; $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
insert into public.profile_links(profile_id,label,url) values(auth.uid(),'Existing','https://example.com');
insert into public.profile_contacts(profile_id,kind,value) values(auth.uid(),'email','old@example.com');
do $$ declare payload jsonb := '{"handle":"anna.petrova","display_name":"Анна Мария","bio":"Автор","links":[{"label":"VK","url":"https://vk.com/id123","icon_key":"vk"}],"contact":{"kind":"phone","value":"+79990000000","is_visible":true},"avatar_shape":"square","avatar_scale":65,"publish":true}'; begin
 begin perform public.complete_onboarding(jsonb_set(payload,'{contact,value}','"+7abc9990000000"')); raise exception 'bad phone accepted'; exception when raise_exception then if SQLERRM='bad phone accepted' then raise; end if; end;
 if (select count(*) from public.profile_links where profile_id=auth.uid())<>1 then raise exception 'failed completion changed links'; end if;
 perform public.complete_onboarding(payload);
 if (select count(*) from public.profile_links where profile_id=auth.uid())<>2 then raise exception 'existing links lost'; end if;
 if (select count(*) from public.profile_contacts where profile_id=auth.uid())<>2 then raise exception 'existing contacts lost'; end if;
 if not exists(select 1 from public.profile_contacts where profile_id=auth.uid() and value='+79990000000' and is_visible) then raise exception 'phone not saved'; end if;
 if not exists(select 1 from public.profiles where id=auth.uid() and onboarding_completed and avatar_scale=65 and avatar_shape='square' and is_published) then raise exception 'final settings lost'; end if;
end; $$;
insert into storage.objects(bucket_id,name,owner,owner_id) values('avatars',auth.uid()::text||'/photo.webp',auth.uid(),auth.uid()::text);
select public.prepare_own_account_deletion('УДАЛИТЬ');
do $$ begin
 if public.account_editable() then raise exception 'pending deletion remains editable'; end if;
 if exists(select 1 from public.profiles where id=auth.uid() and is_published) then raise exception 'deleting profile public'; end if;
 begin insert into storage.objects(bucket_id,name,owner_id) values('avatars',auth.uid()::text||'/late.webp',auth.uid()::text); raise exception 'upload after deletion allowed'; exception when insufficient_privilege then null; end;
end; $$;
-- A failed Storage request can safely retry the same preparation.
select public.prepare_own_account_deletion('УДАЛИТЬ');
reset role;
delete from storage.objects where owner_id='00000000-0000-4000-8000-000000000001';
delete from auth.users where id='00000000-0000-4000-8000-000000000001';
set role service_role;
select public.staff_record_account_deleted('00000000-0000-4000-8000-000000000001');
reset role;
do $$ begin
 if exists(select 1 from public.profiles where id='00000000-0000-4000-8000-000000000001') or exists(select 1 from public.profile_links where profile_id='00000000-0000-4000-8000-000000000001') or exists(select 1 from public.profile_contacts where profile_id='00000000-0000-4000-8000-000000000001') then raise exception 'account cascade incomplete'; end if;
 if not exists(select 1 from moderation.audit where target_id='00000000-0000-4000-8000-000000000001' and action='account_deleted') then raise exception 'audit missing'; end if;
end; $$;
set role authenticated;
do $$ begin if public.account_editable() then raise exception 'deleted JWT accepted'; end if; end; $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',false);
do $$ begin
 begin perform public.prepare_own_account_deletion('УДАЛИТЬ'); raise exception 'staff self deletion accepted'; exception when raise_exception then if SQLERRM='staff self deletion accepted' then raise; end if; end;
end; $$;
select public.staff_prepare_account_deletion('00000000-0000-4000-8000-000000000002','draft-000040008000000000000002','Test deletion');
reset role;

-- New limits and media metadata are checked at the database boundary.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',false);
do $$ begin
 begin perform public.save_onboarding_identity(repeat('А',31),'administrator'); raise exception 'long name accepted'; exception when invalid_parameter_value then null; end;
 perform public.save_onboarding_identity(repeat('А',30),'administrator');
 update public.profiles set avatar_media='gif',avatar_crop='{"aspectRatio":1.5,"zoom":0.75,"x":0.4,"y":-0.2}',avatar_poster_path=auth.uid()::text||'/poster.webp' where id=auth.uid();
 begin update public.profiles set avatar_crop='{"zoom":0}' where id=auth.uid(); raise exception 'bad crop accepted'; exception when check_violation then null; end;
 begin update public.profiles set avatar_poster_path='another-user/poster.webp' where id=auth.uid(); raise exception 'foreign poster accepted'; exception when check_violation then null; end;
end; $$;
reset role;
do $$ begin
 if not exists(select 1 from storage.buckets where id='avatars' and file_size_limit=5242880 and allowed_mime_types @> array['image/gif','video/mp4','video/webm']) then raise exception 'media bucket limits missing'; end if;
end; $$;

-- Additional Auth/analytics columns model the production tables for trash tests.
alter table auth.users add column created_at timestamptz default now(), add column last_sign_in_at timestamptz, add column email_confirmed_at timestamptz, add column banned_until timestamptz;
create unique index test_auth_email_unique on auth.users(lower(email));
create table auth.sessions(id uuid primary key default gen_random_uuid(),user_id uuid references auth.users on delete cascade);
alter table moderation.restrictions add column created_at timestamptz default now();
create function moderation.allowed(target uuid) returns boolean language sql stable security definer set search_path='' as $$ select not exists(select 1 from moderation.restrictions where target_id=target); $$;
create table public.profile_events(id uuid primary key default gen_random_uuid(),profile_id uuid references public.profiles on delete cascade);
alter table public.profile_events enable row level security;
grant select on public.profile_events to authenticated;
create policy test_events_owner on public.profile_events for select to authenticated using(profile_id=auth.uid());
grant usage on schema auth,moderation to anon;
grant select on public.profiles,public.profile_links,public.profile_contacts to anon;
create policy test_public_profile on public.profiles for select to anon using(is_published and moderation.allowed(id));
create policy test_public_links on public.profile_links for select to anon using(exists(select 1 from public.profiles where id=profile_id and is_published));
create policy test_public_contacts on public.profile_contacts for select to anon using(is_visible and exists(select 1 from public.profiles where id=profile_id and is_published));
-- Earlier typography migrations are already present in production; these columns
-- make the isolated trash/editor fixture match their current schema.
alter table public.profiles
 add column name_font text not null default 'manrope',add column name_font_size smallint not null default 21,
 add column bio_font text not null default 'manrope',add column bio_font_size smallint not null default 10,
 add column handle_font text not null default 'manrope',add column handle_font_size smallint not null default 10;
alter table public.profile_links add column label_font text not null default 'manrope',add column label_font_size smallint not null default 11;
alter table public.profile_contacts
 add column label_font text not null default 'manrope',add column label_font_size smallint not null default 10,
 add column value_font text not null default 'manrope',add column value_font_size smallint not null default 9;
\i supabase/migrations/20261014195826_admin_trash_and_sharing.sql
\i supabase/migrations/20261015060932_staff_editor_and_public_share.sql
\i scripts/test-staff-profile.sql
\i scripts/test-trash.sql
\i supabase/migrations/20261016140000_link_icon_snapshot.sql
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='profile_links' and column_name='icon_snapshot_path') then
    raise exception 'Missing generated icon snapshot path';
  end if;
end $$;
\i scripts/test-appearance-migrations.sql
\i scripts/test-background-images.sql
\i scripts/test-featured-images.sql
\i scripts/test-link-sections.sql
\i scripts/test-background-position.sql

\i scripts/test-image-crops.sql
