\i supabase/migrations/20261019221621_background_image_position.sql
\i supabase/migrations/20261019221621_background_image_position.sql
begin;
do $$ begin
 if exists(select 1 from public.profiles where background_position_x<>50 or background_position_y<>50 or background_zoom<>100)then raise exception 'Legacy image defaults changed';end if;
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000017',false);
update public.profiles set background_position_x=25,background_position_y=75,background_zoom=180 where id=auth.uid();
do $$ begin
 if not exists(select 1 from public.profiles where id=auth.uid() and background_position_x=25 and background_position_y=75 and background_zoom=180)then raise exception 'Crop not saved';end if;
 begin update public.profiles set background_position_x=-1 where id=auth.uid();raise exception 'Invalid X accepted';exception when check_violation then null;end;
 begin update public.profiles set background_position_y=101 where id=auth.uid();raise exception 'Invalid Y accepted';exception when check_violation then null;end;
 begin update public.profiles set background_zoom=99 where id=auth.uid();raise exception 'Invalid zoom accepted';exception when check_violation then null;end;
 begin update public.profiles set background_zoom=301 where id=auth.uid();raise exception 'Invalid zoom accepted';exception when check_violation then null;end;
 update public.profiles set background_zoom=200 where id='00000000-0000-4000-8000-000000000003';
 if found then raise exception 'Cross-owner crop update accepted';end if;
end $$;
reset role;
-- The admin RPC saves crop fields and does not reset them for older payloads.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',false);
do $$ declare detail jsonb; payload jsonb; saved jsonb; begin
 detail:=moderation.detail('00000000-0000-4000-8000-000000000017');
 payload:=jsonb_build_object('profile',(detail->'profile')||jsonb_build_object('background_position_x',10,'background_position_y',90,'background_zoom',250),'links',detail->'links','contacts','[]'::jsonb);
 perform public.staff_save_profile('00000000-0000-4000-8000-000000000017',payload);
 saved:=moderation.detail('00000000-0000-4000-8000-000000000017')->'profile';
 if (saved->>'background_position_x')::integer is distinct from 10 or (saved->>'background_position_y')::integer is distinct from 90 or (saved->>'background_zoom')::integer is distinct from 250 then raise exception 'Staff crop not saved';end if;
 payload:=jsonb_set(payload,'{profile}',(payload->'profile')-'background_position_x'-'background_position_y'-'background_zoom');
 perform public.staff_save_profile('00000000-0000-4000-8000-000000000017',payload);
 saved:=moderation.detail('00000000-0000-4000-8000-000000000017')->'profile';
 if (saved->>'background_position_x')::integer is distinct from 10 or (saved->>'background_position_y')::integer is distinct from 90 or (saved->>'background_zoom')::integer is distinct from 250 then raise exception 'Legacy staff client reset crop';end if;
end $$;
reset role;
rollback;
\echo Background position replay, defaults, bounds, owner and staff preservation passed
