-- Whitelisted versioned appearance values; old scalar columns remain for legacy profiles.
create or replace function public.valid_card_style_v1(style jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare k text; v jsonb; n numeric;
begin
 if style is null then return true; end if;
 if jsonb_typeof(style) <> 'object' or style->'version' <> '1'::jsonb then return false; end if;
 for k,v in select key,value from jsonb_each(style) loop
   if k='version' then continue; end if;
   if k not in ('padding','borderWidth','opacity') or jsonb_typeof(v)<>'number' then return false; end if;
   n:=(v #>> '{}')::numeric;
   if n<>trunc(n) or (k='padding' and (n<8 or n>24))
     or (k='borderWidth' and (n<0 or n>3))
     or (k='opacity' and (n<60 or n>100)) then return false; end if;
 end loop;
 return true;
exception when others then return false;
end; $$;

alter table public.profiles add column if not exists card_style jsonb not null default '{"version":1}'::jsonb;
alter table public.profile_links add column if not exists card_style jsonb;
alter table public.profiles add constraint profiles_card_style_v1_check check (public.valid_card_style_v1(card_style));
alter table public.profile_links add constraint profile_links_card_style_v1_check check (public.valid_card_style_v1(card_style));

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
   background_preset=p->>'background_preset',background_style=coalesce(p->>'background_style','preset'),
   background_primary=p->>'background_primary',background_secondary=p->>'background_secondary',
   card_preset=p->>'card_preset',card_border_width=coalesce((p->>'card_border_width')::integer,1),
   card_opacity=coalesce((p->>'card_opacity')::integer,100),card_padding=coalesce((p->>'card_padding')::integer,12),card_style=coalesce(p->'card_style','{"version":1}'::jsonb),
   avatar_shape=p->>'avatar_shape',avatar_size=p->>'avatar_size',avatar_scale=(p->>'avatar_scale')::integer,
   is_published=(p->>'is_published')::boolean,show_qr=(p->>'show_qr')::boolean,qr_size=coalesce((p->>'qr_size')::integer,176),card_radius=coalesce((p->>'card_radius')::integer,13)
 where id=target;
 if not found then raise exception 'Профиль не найден.'; end if;
 for item in select value from jsonb_array_elements(payload->'links') loop
   if item->>'id' is not null then
     item_id:=(item->>'id')::uuid;
     if not exists(select 1 from public.profile_links where id=item_id and profile_id=target) or item_id=any(kept_links) then raise exception 'Ссылка не принадлежит этому профилю.' using errcode='42501'; end if;
     update public.profile_links set label=item->>'label',url=item->>'url',icon_key=item->>'icon_key',
       label_font=item->>'label_font',label_font_size=(item->>'label_font_size')::integer,label_color=item->>'label_color',
       card_preset_override=item->>'card_preset_override',card_radius_override=(item->>'card_radius_override')::integer,card_style=item->'card_style',
       is_visible=(item->>'is_visible')::boolean,is_sensitive=(item->>'is_sensitive')::boolean,position=n
     where id=item_id and profile_id=target;
   else
     insert into public.profile_links(profile_id,label,url,icon_key,label_font,label_font_size,label_color,card_preset_override,card_radius_override,card_style,is_visible,is_sensitive,position)
     values(target,item->>'label',item->>'url',item->>'icon_key',item->>'label_font',(item->>'label_font_size')::integer,item->>'label_color',item->>'card_preset_override',(item->>'card_radius_override')::integer,item->'card_style',(item->>'is_visible')::boolean,(item->>'is_sensitive')::boolean,n)
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
 insert into moderation.audit(actor_id,target_id,action,reason)
 values(auth.uid(),target,'profile_edited','Администратор сохранил изменения профиля');
 return jsonb_build_object('links',cardinality(kept_links),'contacts',cardinality(kept_contacts));
end; $$;
