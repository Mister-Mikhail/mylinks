\i supabase/migrations/20261019181615_profile_background_images.sql
\i supabase/migrations/20261019181615_profile_background_images.sql
begin;
-- Fixture adds the production published-profile read path; Storage must still restrict references.
grant select on public.profiles to anon;
create policy media_test_published on public.profiles for select to anon using(is_published);
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000017',false);
update public.profiles set background_style='image',background_image_path=auth.uid()::text||'/11111111-1111-4111-8111-111111111111.webp',is_published=true where id=auth.uid();
insert into storage.objects(bucket_id,name) values('profile-assets',auth.uid()::text||'/11111111-1111-4111-8111-111111111111.webp'),('profile-assets',auth.uid()::text||'/22222222-2222-4222-8222-222222222222.webp');
do $$ begin
 begin insert into storage.objects(bucket_id,name) values('profile-assets','00000000-0000-4000-8000-000000000001/33333333-3333-4333-8333-333333333333.webp');raise exception 'Cross-owner upload accepted';exception when insufficient_privilege then null;end;
 begin update public.profiles set background_image_path='00000000-0000-4000-8000-000000000001/33333333-3333-4333-8333-333333333333.webp' where id=auth.uid();raise exception 'Cross-owner image assignment';exception when check_violation then null;end;
 begin update public.profiles set background_overlay=81 where id=auth.uid();raise exception 'Invalid overlay accepted';exception when check_violation then null;end;
 if (select count(*) from storage.objects where bucket_id='profile-assets')<>2 then raise exception 'Owner cannot read private draft';end if;
end $$;
reset role;
grant usage on schema storage to anon;
grant select on storage.objects to anon;
set role anon;
do $$ begin
 if(select count(*) from storage.objects where bucket_id='profile-assets')<>1 then raise exception 'Public access includes draft image';end if;
end $$;
reset role;
-- RLS-denied profile must also deny public images, regardless of its publication flag.
create policy media_test_denied on public.profiles as restrictive for select to anon using(false);
set role anon;
do $$ begin if exists(select 1 from storage.objects where bucket_id='profile-assets')then raise exception 'RLS-denied image public';end if;end $$;
reset role;
drop policy media_test_denied on public.profiles;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000017',false);
update public.profiles set is_published=false where id=auth.uid();
reset role;
set role anon;
do $$ begin if exists(select 1 from storage.objects where bucket_id='profile-assets')then raise exception 'Unpublished image public';end if;end $$;
reset role;
rollback;
\echo Background image ownership, draft privacy, RLS deny, replay and defaults passed
