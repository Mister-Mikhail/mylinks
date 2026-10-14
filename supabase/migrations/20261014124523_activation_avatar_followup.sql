-- New name limit. Existing unchanged names remain intact.
-- Validate changed identity values at the database boundary, including direct REST edits.
create or replace function public.validate_profile_identity()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.display_name is distinct from old.display_name and
    (char_length(new.display_name) not between 1 and 30 or new.display_name !~ '^[[:alpha:]]+( [[:alpha:]]+)*$') then
    raise exception 'Имя: только буквы и пробелы, от 1 до 30 символов.' using errcode='22023';
  end if;
  if new.handle is distinct from old.handle and
    (char_length(new.handle) not between 3 and 30 or new.handle !~ '^[a-z]+([._][a-z]+)?$'
     or new.handle in ('admin','auth','p','assets','icons','sounds','fonts','share-image')) then
    raise exception 'User name: 3–30 латинских букв и не более одной точки или подчёркивания между словами.' using errcode='22023';
  end if;
  return new;
end; $$;
create or replace function public.save_onboarding_identity(profile_name text, profile_handle text)
returns void language plpgsql set search_path = '' as $$
declare current_profile public.profiles;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select * into current_profile from public.profiles where id=auth.uid() for update;
  if not found then raise exception 'Профиль не найден.'; end if;
  if current_profile.onboarding_completed then raise exception 'Настройка уже завершена.'; end if;
  if char_length(profile_name) not between 1 and 30 or profile_name !~ '^[[:alpha:]]+( [[:alpha:]]+)*$' or profile_name is null then
    raise exception 'Имя: только буквы и пробелы, от 1 до 30 символов.' using errcode='22023';
  end if;
  if profile_handle is null or not public.is_handle_available(profile_handle) then
    raise exception 'User name некорректен или уже занят.' using errcode='22023';
  end if;
  update public.profiles set display_name=profile_name,handle=profile_handle where id=auth.uid();
  if not found then raise exception 'Не удалось сохранить профиль.' using errcode='42501'; end if;
end; $$;
revoke all on function public.save_onboarding_identity(text,text) from public,anon;
grant execute on function public.save_onboarding_identity(text,text) to authenticated;

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
      insert into public.profile_links(profile_id,label,url,icon_key,position,is_visible)
      values(owner_id,trim(item->>'label'),trim(item->>'url'),item->>'icon_key',item_position,true);
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
revoke all on function public.complete_onboarding(jsonb) from public,anon;
grant execute on function public.complete_onboarding(jsonb) to authenticated;


-- Keep the original animation and store a separate cropped still for previews.
alter table public.profiles
  add column avatar_media text not null default 'image',
  add column avatar_crop jsonb,
  add column avatar_poster_path text;
alter table public.profiles add constraint avatar_media_kind check (avatar_media in ('image','gif','video'));
alter table public.profiles add constraint avatar_poster_owner check (
  avatar_poster_path is null or split_part(avatar_poster_path,'/',1)=id::text
);
alter table public.profiles add constraint avatar_crop_valid check (
  avatar_crop is null or coalesce((jsonb_typeof(avatar_crop)='object'
    and jsonb_typeof(avatar_crop->'aspectRatio')='number' and (avatar_crop->>'aspectRatio')::numeric between 0.001 and 1000
    and jsonb_typeof(avatar_crop->'zoom')='number' and (avatar_crop->>'zoom')::numeric between 0.25 and 3
    and jsonb_typeof(avatar_crop->'x')='number' and abs((avatar_crop->>'x')::numeric)<=1000
    and jsonb_typeof(avatar_crop->'y')='number' and abs((avatar_crop->>'y')::numeric)<=1000),false)
);
update storage.buckets set file_size_limit=5242880,
  allowed_mime_types=array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm']
where id='avatars';
