-- Fractional crops. Legacy mode retains CSS cover semantics without changing
-- existing pictures; opening and applying the editor opts into a fixed frame.
create or replace function public.valid_image_crop(c jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
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
-- Complete definition preserves ownership guards, audit, client IDs and existing ACL.
create or replace function moderation.save_staff_profile(target uuid, payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p jsonb; item jsonb; kept_links uuid[] := '{}'; kept_contacts uuid[] := '{}'; item_id uuid; n integer := 0;
begin
 if auth.uid() is null or moderation.my_role()<>'admin' then raise exception 'Admin access required' using errcode='42501'; end if;
 if target=auth.uid() or not moderation.not_trashed(target) or exists(select 1 from moderation.staff where user_id=target)
    or not exists(select 1 from auth.users where id=target and deleted_at is null) then
   raise exception 'Редактирование выбранного профиля недоступно.' using errcode='42501';
 end if;
 if jsonb_typeof(payload) <> 'object' or jsonb_typeof(payload->'profile') <> 'object'
    or jsonb_typeof(payload->'links') <> 'array' or jsonb_typeof(payload->'contacts') <> 'array'
    or jsonb_array_length(payload->'links')>500 or jsonb_array_length(payload->'contacts')>100 then
   raise exception 'Неверный формат профиля.' using errcode='22023';
 end if;
 p:=payload->'profile';
 perform pg_advisory_xact_lock(734029101);
 if moderation.my_role()<>'admin' or not moderation.not_trashed(target) or exists(select 1 from moderation.staff where user_id=target) then
   raise exception 'Admin access required' using errcode='42501';
 end if;
 update public.profiles set
   handle=p->>'handle',display_name=p->>'display_name',bio=p->>'bio',
   name_font=p->>'name_font',name_font_size=(p->>'name_font_size')::integer,name_color=p->>'name_color',
   bio_font=p->>'bio_font',bio_font_size=(p->>'bio_font_size')::integer,bio_color=p->>'bio_color',
   handle_font=p->>'handle_font',handle_font_size=(p->>'handle_font_size')::integer,handle_color=p->>'handle_color',
    link_font=coalesce(p->>'link_font','manrope'),link_font_size=coalesce((p->>'link_font_size')::integer,11),link_color=p->>'link_color',
   background_preset=p->>'background_preset',background_style=coalesce(p->>'background_style','preset'),
   background_image_path=case when p ? 'background_image_path' then p->>'background_image_path' else background_image_path end,
   background_overlay=case when p ? 'background_overlay' then (p->>'background_overlay')::integer else background_overlay end,
   background_position_x=case when p ? 'background_position_x' then (p->>'background_position_x')::integer else background_position_x end,
   background_position_y=case when p ? 'background_position_y' then (p->>'background_position_y')::integer else background_position_y end,
   background_zoom=case when p ? 'background_zoom' then (p->>'background_zoom')::integer else background_zoom end,
   background_crop=case when p ? 'background_crop' then nullif(p->'background_crop','null'::jsonb) else background_crop end,
   background_primary=p->>'background_primary',background_secondary=p->>'background_secondary',
   card_preset=p->>'card_preset',card_border_width=coalesce((p->>'card_border_width')::integer,1),
   card_opacity=coalesce((p->>'card_opacity')::integer,100),card_padding=coalesce((p->>'card_padding')::integer,12),
   avatar_shape=p->>'avatar_shape',avatar_size=p->>'avatar_size',avatar_scale=(p->>'avatar_scale')::integer,
   is_published=(p->>'is_published')::boolean,show_qr=(p->>'show_qr')::boolean,qr_size=coalesce((p->>'qr_size')::integer,176),card_radius=coalesce((p->>'card_radius')::integer,13)
 where id=target;
 if not found then raise exception 'Профиль не найден.'; end if;
 for item in select value from jsonb_array_elements(payload->'links') loop
   if item->>'id' is not null then
     item_id:=(item->>'id')::uuid;
     if not exists(select 1 from public.profile_links where id=item_id and profile_id=target) or item_id=any(kept_links) then raise exception 'Ссылка не принадлежит этому профилю.' using errcode='42501'; end if;
     update public.profile_links set
       presentation=case when item ? 'presentation' then item->>'presentation' else presentation end,
       image_path=case when item ? 'image_path' then item->>'image_path' else image_path end,
       image_crop=case when item ? 'image_crop' then nullif(item->'image_crop','null'::jsonb) else image_crop end,
       image_alt=coalesce(item->>'image_alt',image_alt),image_position_x=coalesce((item->>'image_position_x')::integer,image_position_x),image_position_y=coalesce((item->>'image_position_y')::integer,image_position_y),
       label=item->>'label',url=item->>'url',icon_key=item->>'icon_key',
       label_font=item->>'label_font',label_font_size=(item->>'label_font_size')::integer,label_color=item->>'label_color',
       card_preset_override=item->>'card_preset_override',card_radius_override=(item->>'card_radius_override')::integer,card_style=nullif(item->'card_style','null'::jsonb),
       is_visible=(item->>'is_visible')::boolean,is_sensitive=(item->>'is_sensitive')::boolean,position=n
     where id=item_id and profile_id=target;
   else
     insert into public.profile_links(id,profile_id,presentation,image_path,image_crop,image_alt,image_position_x,image_position_y,label,url,icon_key,label_font,label_font_size,label_color,card_preset_override,card_radius_override,card_style,is_visible,is_sensitive,position)
     values(coalesce((item->>'client_id')::uuid,gen_random_uuid()),target,coalesce(item->>'presentation','normal'),item->>'image_path',nullif(item->'image_crop','null'::jsonb),coalesce(item->>'image_alt',''),coalesce((item->>'image_position_x')::integer,50),coalesce((item->>'image_position_y')::integer,50),item->>'label',item->>'url',item->>'icon_key',item->>'label_font',(item->>'label_font_size')::integer,item->>'label_color',item->>'card_preset_override',(item->>'card_radius_override')::integer,nullif(item->'card_style','null'::jsonb),(item->>'is_visible')::boolean,(item->>'is_sensitive')::boolean,n)
     returning id into item_id;
   end if;
   kept_links:=array_append(kept_links,item_id);n:=n+1;
 end loop;
 delete from public.profile_links where profile_id=target and not(id=any(kept_links));
 n:=0;
 for item in select value from jsonb_array_elements(payload->'contacts') loop
   if item->>'id' is not null then
     item_id:=(item->>'id')::uuid;
     if not exists(select 1 from public.profile_contacts where id=item_id and profile_id=target) or item_id=any(kept_contacts) then raise exception 'Контакт не принадлежит этому профилю.' using errcode='42501'; end if;
     update public.profile_contacts set kind=item->>'kind',label=item->>'label',value=item->>'value',
       latitude=(item->>'latitude')::double precision,longitude=(item->>'longitude')::double precision,
       label_font=item->>'label_font',label_font_size=(item->>'label_font_size')::integer,label_color=item->>'label_color',
       value_font=item->>'value_font',value_font_size=(item->>'value_font_size')::integer,value_color=item->>'value_color',
       is_visible=(item->>'is_visible')::boolean,position=n where id=item_id and profile_id=target;
   else
     insert into public.profile_contacts(profile_id,kind,label,value,latitude,longitude,label_font,label_font_size,label_color,value_font,value_font_size,value_color,is_visible,position)
     values(target,item->>'kind',item->>'label',item->>'value',(item->>'latitude')::double precision,(item->>'longitude')::double precision,
       item->>'label_font',(item->>'label_font_size')::integer,item->>'label_color',item->>'value_font',(item->>'value_font_size')::integer,item->>'value_color',(item->>'is_visible')::boolean,n)
     returning id into item_id;
   end if;
   kept_contacts:=array_append(kept_contacts,item_id);n:=n+1;
 end loop;
 delete from public.profile_contacts where profile_id=target and not(id=any(kept_contacts));
 if p ? 'link_layout' then update public.profiles set link_layout=nullif(p->'link_layout','null'::jsonb) where id=target;end if;
 insert into moderation.audit(actor_id,target_id,action,reason)
 values(auth.uid(),target,'profile_edited','Администратор сохранил изменения профиля');
 return jsonb_build_object('links',cardinality(kept_links),'contacts',cardinality(kept_contacts));
end; $$;

comment on column public.profiles.background_crop is 'v1: fractional x/y relative to viewport; 9:19.5 is only the editor reference frame, zoom 0.25–3; legacy retains cover positioning until Apply';
comment on column public.profile_links.image_crop is 'v1: fractional x/y relative to 16:9 frame with zoom and blur/color fill; original image_path is preserved';
