-- Fractional crops. Legacy mode retains CSS cover semantics without changing
-- existing pictures; opening and applying the editor opts into a fixed frame.
create or replace function public.valid_image_crop(c jsonb) returns boolean
language plpgsql immutable set search_path=public as $$
declare key text; v numeric;
begin
 if c is null or c='null'::jsonb then return true; end if;
 if jsonb_typeof(c)<>'object' or octet_length(c::text)>2048 or jsonb_typeof(c->'version') is distinct from 'number' or c->>'version' is distinct from '1' or coalesce(c->>'mode','') not in ('legacy','frame') then return false; end if;
 foreach key in array array['x','y','zoom'] loop
  if jsonb_typeof(c->key) is distinct from 'number' then return false; end if;
 end loop;
 if c->>'mode'='legacy' then
  return (c->>'x')::numeric between 0 and 1 and (c->>'y')::numeric between 0 and 1 and (c->>'zoom')::numeric between 1 and 3;
 end if;
 foreach key in array array['aspect','sourceAspect'] loop
  if jsonb_typeof(c->key) is distinct from 'number' then return false; end if;
 end loop;
 return coalesce((c->>'x')::numeric between -2 and 2 and (c->>'y')::numeric between -2 and 2
  and (c->>'zoom')::numeric between .25 and 3 and (c->>'aspect')::numeric between .1 and 10
  and (c->>'sourceAspect')::numeric between .0001 and 10000 and c->>'fill' in ('blur','color') and c->>'color' ~ '^#[a-fA-F0-9]{6}$',false);
end $$;
alter table public.profiles add column if not exists background_crop jsonb;
alter table public.profile_links add column if not exists image_crop jsonb;
do $$ begin
 if not exists(select 1 from pg_constraint where conrelid='public.profiles'::regclass and conname='profiles_background_crop_check') then
  alter table public.profiles add constraint profiles_background_crop_check check(public.valid_image_crop(background_crop));
 end if;
 if not exists(select 1 from pg_constraint where conrelid='public.profile_links'::regclass and conname='links_image_crop_check') then
  alter table public.profile_links add constraint links_image_crop_check check(public.valid_image_crop(image_crop));
 end if;
end $$;
update public.profiles set background_crop=jsonb_build_object('version',1,'mode','legacy','x',background_position_x/100.0,'y',background_position_y/100.0,'zoom',background_zoom/100.0) where background_crop is null and background_image_path is not null;
update public.profile_links set image_crop=jsonb_build_object('version',1,'mode','legacy','x',image_position_x/100.0,'y',image_position_y/100.0,'zoom',1) where image_crop is null and image_path is not null;
-- Preserve ownership checks, audit, ACL and all prior staff-save behavior.
do $migration$
declare definition text; anchor text;
begin
 definition:=pg_get_functiondef('moderation.save_staff_profile(uuid,jsonb)'::regprocedure);
 if strpos(definition,'background_crop=')=0 then
  anchor:=$anchor$background_zoom=case when p ? 'background_zoom' then (p->>'background_zoom')::integer else background_zoom end,$anchor$;
  if strpos(definition,anchor)=0 then raise exception 'Staff background crop anchor missing';end if;
  definition:=replace(definition,anchor,anchor||$fields$
   background_crop=case when p ? 'background_crop' then nullif(p->'background_crop','null'::jsonb) else background_crop end,$fields$);
  anchor:=$anchor$image_path=case when item ? 'image_path' then item->>'image_path' else image_path end,$anchor$;
  if strpos(definition,anchor)=0 then raise exception 'Staff image crop anchor missing';end if;
  definition:=replace(definition,anchor,anchor||$fields$
       image_crop=case when item ? 'image_crop' then nullif(item->'image_crop','null'::jsonb) else image_crop end,$fields$);
  anchor:='profile_links(id,profile_id,presentation,image_path,image_alt';
  if strpos(definition,anchor)=0 then raise exception 'Staff insert crop anchor missing';end if;
  definition:=replace(definition,anchor,'profile_links(id,profile_id,presentation,image_path,image_crop,image_alt');
  anchor:=$anchor$item->>'image_path',coalesce(item->>'image_alt','')$anchor$;
  if strpos(definition,anchor)=0 then raise exception 'Staff crop values anchor missing';end if;
  definition:=replace(definition,anchor,$fields$item->>'image_path',nullif(item->'image_crop','null'::jsonb),coalesce(item->>'image_alt','')$fields$);
  execute definition;
 end if;
end $migration$;
comment on column public.profiles.background_crop is 'v1: fractional x/y relative to fixed 9:19.5 frame, zoom 0.25–3; legacy retains cover positioning until Apply';
comment on column public.profile_links.image_crop is 'v1: fractional x/y relative to 16:9 frame with zoom and blur/color fill; original image_path is preserved';
