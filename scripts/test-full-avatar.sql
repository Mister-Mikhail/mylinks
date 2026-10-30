begin;
insert into auth.users(id,email,raw_user_meta_data) values
 ('00000000-0000-4000-8000-000000000081','full-avatar@example.com','{"onboarding_version":2}');
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000081',false);
select public.save_onboarding_identity('Анна','avatar.full');
-- Owner PATCH and the final wizard submission accept full without changing the stored size.
update public.profiles set avatar_shape='full',avatar_scale=65 where id=auth.uid();
select public.complete_onboarding('{"handle":"avatar.full","display_name":"Анна","bio":"Автор","links":[],"avatar_shape":"full","avatar_scale":65,"publish":false}');
do $$ begin
 if not exists(select 1 from public.profiles where id=auth.uid() and avatar_shape='full' and avatar_scale=65 and onboarding_completed) then raise exception 'Full avatar lost during onboarding';end if;
 begin update public.profiles set avatar_shape='wide' where id=auth.uid();raise exception 'Invalid shape accepted';exception when check_violation then null;end;
 update public.profiles set avatar_shape='square' where id=auth.uid();
 update public.profiles set avatar_shape='round' where id=auth.uid();
 update public.profiles set avatar_shape='full' where id=auth.uid();
 -- RLS still rejects cross-owner edits.
 update public.profiles set avatar_shape='full' where id='00000000-0000-4000-8000-000000000003';
 if found then raise exception 'Shape migration broke RLS';end if;
end $$;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',false);
do $$ declare detail jsonb;payload jsonb;begin
 detail:=moderation.detail('00000000-0000-4000-8000-000000000081');
 payload:=jsonb_build_object('profile',detail->'profile','links',coalesce(detail->'links','[]'::jsonb),'contacts',coalesce(detail->'contacts','[]'::jsonb));
 perform public.staff_save_profile('00000000-0000-4000-8000-000000000081',payload);
 if moderation.detail('00000000-0000-4000-8000-000000000081')#>>'{profile,avatar_shape}'<>'full' then raise exception 'Staff full avatar not saved';end if;
 payload:=jsonb_set(payload,'{profile,avatar_shape}','"wide"');
 begin perform public.staff_save_profile('00000000-0000-4000-8000-000000000081',payload);raise exception 'Staff accepted unknown shape';exception when invalid_parameter_value then null;end;
end $$;
reset role;
rollback;
\echo Full avatar: owner, onboarding, staff, legacy shapes and RLS passed
