\set ON_ERROR_STOP on
reset role;
-- Backfill a legacy picture, then reapply to prove the migration is idempotent.
update public.profiles set background_position_x=25,background_position_y=75,background_zoom=180,background_image_path=id::text||'/11111111-1111-4111-8111-111111111111.webp' where id='00000000-0000-4000-8000-000000000001';
\i supabase/migrations/20261020114649_image_frame_crops.sql
\i supabase/migrations/20261020114649_image_frame_crops.sql
do $$ declare c jsonb; bad jsonb;begin
 select background_crop into c from public.profiles where id='00000000-0000-4000-8000-000000000001';
 if c->>'mode'<>'legacy' or (c->>'x')::numeric<>.25 or (c->>'y')::numeric<>.75 or (c->>'zoom')::numeric<>1.8 then raise exception 'Legacy crop changed';end if;
 if not public.valid_image_crop('{"version":1,"mode":"frame","x":0.125,"y":-0.2,"zoom":0.5,"aspect":1.7777777777777777,"sourceAspect":2,"fill":"blur","color":"#162638"}') then raise exception 'Valid crop rejected';end if;
 foreach bad in array array['{}'::jsonb,'{"version":1,"mode":"frame","x":0,"y":0,"zoom":10}'::jsonb,'{"version":1,"mode":"legacy","x":2,"y":0,"zoom":1}'::jsonb,'{"mode":"legacy","x":0,"y":0,"zoom":1}'::jsonb] loop
  if public.valid_image_crop(bad) then raise exception 'Bad crop accepted: %',bad;end if;
 end loop;
 if not exists(select 1 from pg_class where oid='public.profiles'::regclass and relrowsecurity) or not exists(select 1 from pg_class where oid='public.profile_links'::regclass and relrowsecurity) then raise exception 'RLS disabled';end if;
 if has_function_privilege('anon','moderation.save_staff_profile(uuid,jsonb)','execute') then raise exception 'Anonymous staff access';end if;
end $$;
begin;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000017',false);
do $$ declare c jsonb:='{"version":1,"mode":"frame","x":0.125,"y":-0.2,"zoom":0.5,"aspect":0.46153846153846156,"sourceAspect":2,"fill":"blur","color":"#162638"}';begin
 update public.profiles set background_crop=c where id=auth.uid();
 if not found then raise exception 'Owner crop update missing';end if;
 begin update public.profiles set background_crop='{}' where id=auth.uid();raise exception 'Invalid persisted crop accepted';exception when check_violation then null;end;
 update public.profiles set background_crop=c where id='00000000-0000-4000-8000-000000000003';
 if found then raise exception 'Cross-owner crop accepted';end if;
end $$;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',false);
do $$ declare detail jsonb; payload jsonb; c jsonb:='{"version":1,"mode":"frame","x":0.2,"y":-0.1,"zoom":0.6,"aspect":1.7777777777777777,"sourceAspect":2,"fill":"color","color":"#123456"}';saved jsonb;begin
 detail:=moderation.detail('00000000-0000-4000-8000-000000000017');
 payload:=jsonb_build_object('profile',(detail->'profile')||jsonb_build_object('background_crop',c),'links',detail->'links','contacts',detail->'contacts');
 perform public.staff_save_profile('00000000-0000-4000-8000-000000000017',payload);
 saved:=moderation.detail('00000000-0000-4000-8000-000000000017')->'profile';
 if saved->'background_crop' is distinct from c then raise exception 'Staff crop missing';end if;
 payload:=jsonb_set(payload,'{profile}',(payload->'profile')-'background_crop');
 perform public.staff_save_profile('00000000-0000-4000-8000-000000000017',payload);
 saved:=moderation.detail('00000000-0000-4000-8000-000000000017')->'profile';
 if saved->'background_crop' is distinct from c then raise exception 'Legacy staff client erased crop';end if;
end $$;
reset role;
rollback;
\echo Image crop replay, legacy rendering data, validation, RLS and staff preservation passed
