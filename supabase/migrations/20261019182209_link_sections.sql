-- Versioned layout references existing links; URLs and analytics remain authoritative in profile_links.
create or replace function public.valid_link_layout(layout jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare block jsonb; key text; value jsonb; ref text; seen text[]:='{}'; blocks text[]:='{}'; ident text;
begin
 if layout is null then return true;end if;
 if jsonb_typeof(layout)<>'object' or layout->'version' is distinct from '1'::jsonb or jsonb_typeof(layout->'blocks') is distinct from 'array' or jsonb_array_length(layout->'blocks')>100 then return false;end if;
 if exists(select 1 from jsonb_object_keys(layout) k where k not in ('version','blocks'))then return false;end if;
 for block in select * from jsonb_array_elements(layout->'blocks') loop
  if jsonb_typeof(block)<>'object' or coalesce(block->>'type','') not in ('link','heading','divider','group') then return false;end if;
  ident:=block->>'id';if ident is null or ident!~'^[a-f0-9-]{36}$' or ident=any(blocks)then return false;end if;blocks:=array_append(blocks,ident);
  for key,value in select * from jsonb_each(block) loop
   if key not in ('id','type') and not (block->>'type'='link' and key='link_id') and not (block->>'type' in ('heading','group') and key='title') and not (block->>'type'='group' and key='link_ids') then return false;end if;
  end loop;
  if block->>'type' in ('heading','group') and (jsonb_typeof(block->'title') is distinct from 'string' or length(block->>'title')>80)then return false;end if;
  if block->>'type'='link' then
   ref:=block->>'link_id';if ref is null or ref!~'^[a-f0-9-]{36}$' or ref=any(seen)then return false;end if;seen:=array_append(seen,ref);
  elsif block->>'type'='group' then
   if jsonb_typeof(block->'link_ids') is distinct from 'array' or jsonb_array_length(block->'link_ids')>500 then return false;end if;
   for value in select * from jsonb_array_elements(block->'link_ids') loop
    if jsonb_typeof(value)<>'string'then return false;end if;ref:=value#>>'{}';
    if ref!~'^[a-f0-9-]{36}$' or ref=any(seen)then return false;end if;seen:=array_append(seen,ref);
   end loop;
  end if;
 end loop;
 return true;
exception when others then return false;
end $$;
alter table public.profiles add column if not exists link_layout jsonb;
do $$ begin
 if not exists(select 1 from pg_constraint where conrelid='public.profiles'::regclass and conname='profiles_link_layout_check')then alter table public.profiles add constraint profiles_link_layout_check check(public.valid_link_layout(link_layout));end if;
end $$;
create or replace function public.check_link_layout_owner() returns trigger language plpgsql set search_path='' as $$
declare block jsonb; ref text;
begin
 if new.link_layout is null then return new;end if;
 if not public.valid_link_layout(new.link_layout)then raise exception 'Некорректная структура страницы.' using errcode='22023';end if;
 for block in select * from jsonb_array_elements(new.link_layout->'blocks') loop
  for ref in select block->>'link_id' where block->>'type'='link' union all select jsonb_array_elements_text(block->'link_ids') where block->>'type'='group' loop
   if not exists(select 1 from public.profile_links where id=ref::uuid and profile_id=new.id)then raise exception 'Ссылка блока не принадлежит профилю.' using errcode='42501';end if;
  end loop;
 end loop;
 return new;
end $$;
revoke all on function public.check_link_layout_owner() from public;
drop trigger if exists check_link_layout_owner on public.profiles;
create trigger check_link_layout_owner before insert or update of link_layout on public.profiles for each row execute function public.check_link_layout_owner();
create or replace function public.remove_deleted_layout_link() returns trigger language plpgsql set search_path='' as $$
declare current_layout jsonb; blocks jsonb:='[]'; block jsonb;
begin
 select link_layout into current_layout from public.profiles where id=old.profile_id;
 if current_layout is null then return old;end if;
 for block in select * from jsonb_array_elements(current_layout->'blocks') loop
  if block->>'type'='link' and not exists(select 1 from public.profile_links where id=(block->>'link_id')::uuid and profile_id=old.profile_id) then continue;end if;
  if block->>'type'='group' then block:=jsonb_set(block,'{link_ids}',coalesce((select jsonb_agg(value) from jsonb_array_elements(block->'link_ids') where exists(select 1 from public.profile_links where id=(value#>>'{}')::uuid and profile_id=old.profile_id)),'[]'));end if;
  blocks:=blocks||jsonb_build_array(block);
 end loop;
 update public.profiles set link_layout=jsonb_build_object('version',1,'blocks',blocks) where id=old.profile_id;
 return old;
end $$;
revoke all on function public.remove_deleted_layout_link() from public;
drop trigger if exists remove_deleted_layout_link on public.profile_links;
create trigger remove_deleted_layout_link after delete on public.profile_links for each row execute function public.remove_deleted_layout_link();

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
       image_alt=coalesce(item->>'image_alt',image_alt),image_position_x=coalesce((item->>'image_position_x')::integer,image_position_x),image_position_y=coalesce((item->>'image_position_y')::integer,image_position_y),
       label=item->>'label',url=item->>'url',icon_key=item->>'icon_key',
       label_font=item->>'label_font',label_font_size=(item->>'label_font_size')::integer,label_color=item->>'label_color',
       card_preset_override=item->>'card_preset_override',card_radius_override=(item->>'card_radius_override')::integer,card_style=nullif(item->'card_style','null'::jsonb),
       is_visible=(item->>'is_visible')::boolean,is_sensitive=(item->>'is_sensitive')::boolean,position=n
     where id=item_id and profile_id=target;
   else
     insert into public.profile_links(id,profile_id,presentation,image_path,image_alt,image_position_x,image_position_y,label,url,icon_key,label_font,label_font_size,label_color,card_preset_override,card_radius_override,card_style,is_visible,is_sensitive,position)
     values(coalesce((item->>'client_id')::uuid,gen_random_uuid()),target,coalesce(item->>'presentation','normal'),item->>'image_path',coalesce(item->>'image_alt',''),coalesce((item->>'image_position_x')::integer,50),coalesce((item->>'image_position_y')::integer,50),item->>'label',item->>'url',item->>'icon_key',item->>'label_font',(item->>'label_font_size')::integer,item->>'label_color',item->>'card_preset_override',(item->>'card_radius_override')::integer,nullif(item->'card_style','null'::jsonb),(item->>'is_visible')::boolean,(item->>'is_sensitive')::boolean,n)
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
