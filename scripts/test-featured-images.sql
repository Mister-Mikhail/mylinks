\i supabase/migrations/20261019181945_featured_image_cards.sql
\i supabase/migrations/20261019181945_featured_image_cards.sql
begin;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000017',false);
do $$ declare old_id uuid; old_url text; begin
 select id,url into old_id,old_url from public.profile_links where profile_id=auth.uid() limit 1;
 update public.profile_links set presentation='featured',image_path=auth.uid()::text||'/11111111-1111-4111-8111-111111111111.webp',image_position_x=30 where id=old_id;
 if not exists(select 1 from public.profile_links where id=old_id and url=old_url and presentation='featured')then raise exception 'Link identity changed';end if;
 begin update public.profile_links set image_path='00000000-0000-4000-8000-000000000001/11111111-1111-4111-8111-111111111111.webp' where id=old_id;raise exception 'Foreign image accepted';exception when check_violation then null;end;
 begin update public.profile_links set image_position_x=101 where id=old_id;raise exception 'Invalid crop accepted';exception when check_violation then null;end;
 update public.profile_links set presentation='normal' where id=old_id;
 if not exists(select 1 from public.profile_links where id=old_id and image_path is not null)then raise exception 'Normal mode discarded image';end if;
end $$;
reset role;
rollback;
