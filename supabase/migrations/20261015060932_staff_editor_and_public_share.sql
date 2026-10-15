alter table public.profiles add column show_qr boolean not null default false;

-- Save all editor fields in one transaction, with the administrator's own JWT.
-- This function lives outside the exposed schema; the wrapper checks admin on every call.
create function moderation.save_staff_profile(target uuid, payload jsonb) returns jsonb
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
   name_font=p->>'name_font',name_font_size=(p->>'name_font_size')::integer,
   bio_font=p->>'bio_font',bio_font_size=(p->>'bio_font_size')::integer,
   handle_font=p->>'handle_font',handle_font_size=(p->>'handle_font_size')::integer,
   background_preset=p->>'background_preset',card_preset=p->>'card_preset',
   avatar_shape=p->>'avatar_shape',avatar_size=p->>'avatar_size',avatar_scale=(p->>'avatar_scale')::integer,
   is_published=(p->>'is_published')::boolean,show_qr=(p->>'show_qr')::boolean
 where id=target;
 if not found then raise exception 'Профиль не найден.'; end if;
 for item in select value from jsonb_array_elements(payload->'links') loop
   if item->>'id' is not null then
     item_id:=(item->>'id')::uuid;
     if not exists(select 1 from public.profile_links where id=item_id and profile_id=target) or item_id=any(kept_links) then raise exception 'Ссылка не принадлежит этому профилю.' using errcode='42501'; end if;
     update public.profile_links set label=item->>'label',url=item->>'url',icon_key=item->>'icon_key',
       label_font=item->>'label_font',label_font_size=(item->>'label_font_size')::integer,
       is_visible=(item->>'is_visible')::boolean,is_sensitive=(item->>'is_sensitive')::boolean,position=n
     where id=item_id and profile_id=target;
   else
     insert into public.profile_links(profile_id,label,url,icon_key,label_font,label_font_size,is_visible,is_sensitive,position)
     values(target,item->>'label',item->>'url',item->>'icon_key',item->>'label_font',(item->>'label_font_size')::integer,(item->>'is_visible')::boolean,(item->>'is_sensitive')::boolean,n)
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
       label_font=item->>'label_font',label_font_size=(item->>'label_font_size')::integer,
       value_font=item->>'value_font',value_font_size=(item->>'value_font_size')::integer,
       is_visible=(item->>'is_visible')::boolean,position=n where id=item_id and profile_id=target;
   else
     insert into public.profile_contacts(profile_id,kind,label,value,latitude,longitude,label_font,label_font_size,value_font,value_font_size,is_visible,position)
     values(target,item->>'kind',item->>'label',item->>'value',(item->>'latitude')::double precision,(item->>'longitude')::double precision,
       item->>'label_font',(item->>'label_font_size')::integer,item->>'value_font',(item->>'value_font_size')::integer,(item->>'is_visible')::boolean,n)
     returning id into item_id;
   end if;
   kept_contacts:=array_append(kept_contacts,item_id);n:=n+1;
 end loop;
 delete from public.profile_contacts where profile_id=target and not(id=any(kept_contacts));
 insert into moderation.audit(actor_id,target_id,action,reason)
 values(auth.uid(),target,'profile_edited','Администратор сохранил изменения профиля');
 return jsonb_build_object('links',cardinality(kept_links),'contacts',cardinality(kept_contacts));
end; $$;
revoke all on function moderation.save_staff_profile(uuid,jsonb) from public,anon,authenticated;
create function public.staff_save_profile(target uuid,payload jsonb) returns jsonb
language sql set search_path='' as $$ select moderation.save_staff_profile(target,payload); $$;
revoke all on function public.staff_save_profile(uuid,jsonb) from public,anon;
grant execute on function public.staff_save_profile(uuid,jsonb) to authenticated;

create function moderation.set_staff_avatar(target uuid, avatar text, media text, crop jsonb, poster text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or moderation.my_role()<>'admin' or target=auth.uid()
    or not moderation.not_trashed(target) or exists(select 1 from moderation.staff where user_id=target) then
   raise exception 'Admin access required' using errcode='42501';
 end if;
 if avatar not like target::text||'/avatar-%' or (poster is not null and poster not like target::text||'/poster-%')
    or media not in ('image','gif','video') then raise exception 'Invalid avatar' using errcode='22023'; end if;
 update public.profiles set avatar_path=avatar,avatar_url=null,avatar_media=media,avatar_crop=crop,avatar_poster_path=poster where id=target;
 if not found then raise exception 'Профиль не найден.'; end if;
 insert into moderation.audit(actor_id,target_id,action,reason)
 values(auth.uid(),target,'avatar_edited','Администратор обновил аватар профиля');
end; $$;
revoke all on function moderation.set_staff_avatar(uuid,text,text,jsonb,text) from public,anon,authenticated;
create function public.staff_set_avatar(target uuid, avatar text, media text, crop jsonb, poster text) returns void
language sql set search_path='' as $$ select moderation.set_staff_avatar(target,avatar,media,crop,poster); $$;
revoke all on function public.staff_set_avatar(uuid,text,text,jsonb,text) from public,anon;
grant execute on function public.staff_set_avatar(uuid,text,text,jsonb,text) to authenticated;

-- Wizard saves its 18+ setting alongside the first links.
create or replace function public.complete_onboarding(payload jsonb)
returns void language plpgsql set search_path = '' as $$
declare
  owner_id uuid := auth.uid(); current_profile public.profiles; item jsonb;
  contact_data jsonb; contact_value text; item_position integer; contact_position integer;
begin
  if owner_id is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if jsonb_typeof(payload) is distinct from 'object' then raise exception 'Invalid onboarding data'; end if;
  select * into current_profile from public.profiles where id=owner_id for update;
  if not found then raise exception 'Профиль не найден.'; end if;
  if current_profile.onboarding_completed then raise exception 'Настройка уже завершена.'; end if;
  -- First-step identity is authoritative; final submission cannot silently change it.
  if payload->>'handle' is distinct from current_profile.handle or payload->>'display_name' is distinct from current_profile.display_name
     or current_profile.handle like 'draft-%' or char_length(current_profile.display_name) not between 1 and 30
     or current_profile.display_name !~ '^[[:alpha:]]+( [[:alpha:]]+)*$' then
    raise exception 'Вернитесь на первый шаг и сохраните имя и user name.';
  end if;
  if char_length(coalesce(payload->>'bio',''))>160 then raise exception 'Описание: не более 160 символов.'; end if;
  if jsonb_typeof(payload->'links') is distinct from 'array' or jsonb_array_length(payload->'links')>3 then
    raise exception 'Добавьте не больше трёх ссылок на старте.';
  end if;
  select coalesce(max(position)+1,0) into item_position from public.profile_links where profile_id=owner_id;
  for item in select value from jsonb_array_elements(payload->'links') loop
    if jsonb_typeof(item) is distinct from 'object' or coalesce(char_length(trim(item->>'label')),0) not between 1 and 80
       or coalesce(char_length(trim(item->>'url')),0) not between 8 and 2048
       or trim(item->>'url') !~* '^https?://[^[:space:]/]+(/[^[:space:]]*)?$'
       or coalesce(item->>'icon_key','') not in ('link','website','instagram','youtube','telegram','tiktok','whatsapp','vk','facebook','x','onlyfans','email') then
      raise exception 'Проверьте данные ссылки.';
    end if;
    if item->>'icon_key'='whatsapp' and item->>'url' !~ '^https://wa[.]me/[1-9][0-9]{6,14}$' then raise exception 'Проверьте номер WhatsApp.'; end if;
    if not exists(select 1 from public.profile_links where profile_id=owner_id and url=trim(item->>'url')) then
      insert into public.profile_links(profile_id,label,url,icon_key,position,is_visible,is_sensitive)
      values(owner_id,trim(item->>'label'),trim(item->>'url'),item->>'icon_key',item_position,true,coalesce((item->>'is_sensitive')::boolean,false));
      item_position:=item_position+1;
    end if;
  end loop;
  contact_data:=payload->'contact'; contact_value:=trim(coalesce(contact_data->>'value',''));
  if contact_value<>'' then
    if jsonb_typeof(contact_data) is distinct from 'object' or coalesce(contact_data->>'kind','') not in ('address','phone','email')
      or char_length(contact_value)>500 or char_length(coalesce(contact_data->>'label',''))>80 then raise exception 'Проверьте контакт.'; end if;
    if contact_data->>'kind'='phone' and contact_value !~ '^\+[1-9][0-9]{6,14}$' then raise exception 'Телефон: + и 7–15 цифр.'; end if;
    if contact_data->>'kind'='email' and (char_length(contact_value)>254 or contact_value !~ '^[a-zA-Z0-9]+([.][a-zA-Z0-9]+)*@[a-zA-Z0-9]+([.][a-zA-Z0-9]+)*[.][a-zA-Z]{2,}$') then raise exception 'Проверьте формат email.'; end if;
    if contact_data->>'kind'='address' and char_length(contact_value)<3 then raise exception 'Укажите адрес.'; end if;
    select coalesce(max(position)+1,0) into contact_position from public.profile_contacts where profile_id=owner_id;
    if not exists(select 1 from public.profile_contacts where profile_id=owner_id and kind=contact_data->>'kind' and value=contact_value) then
      insert into public.profile_contacts(profile_id,kind,label,value,position,is_visible,latitude,longitude)
      values(owner_id,contact_data->>'kind',trim(coalesce(contact_data->>'label','')),contact_value,contact_position,
        coalesce((contact_data->>'is_visible')::boolean,false),(contact_data->>'latitude')::double precision,(contact_data->>'longitude')::double precision);
    end if;
  end if;
  update public.profiles set bio=trim(coalesce(payload->>'bio','')),
    background_preset=coalesce(payload->>'background_preset','midnight'),card_preset=coalesce(payload->>'card_preset','glass'),
    avatar_shape=coalesce(payload->>'avatar_shape',avatar_shape),avatar_size=coalesce(payload->>'avatar_size',avatar_size),
    avatar_scale=coalesce((payload->>'avatar_scale')::integer,avatar_scale),
    is_published=coalesce((payload->>'publish')::boolean,false),onboarding_completed=true,onboarding_progress='{}'::jsonb
  where id=owner_id;
  if not found then raise exception 'Не удалось завершить настройку.' using errcode='42501'; end if;
end; $$;
