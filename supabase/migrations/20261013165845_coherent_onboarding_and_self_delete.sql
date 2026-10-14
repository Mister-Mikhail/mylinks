-- Validate changed identity values at the database boundary, including direct REST edits.
create or replace function public.validate_profile_identity()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.display_name is distinct from old.display_name and
    (char_length(new.display_name) not between 1 and 60 or new.display_name !~ '^[[:alpha:]]+( [[:alpha:]]+)*$') then
    raise exception 'Имя: только буквы и пробелы, от 1 до 60 символов.' using errcode='22023';
  end if;
  if new.handle is distinct from old.handle and
    (char_length(new.handle) not between 3 and 30 or new.handle !~ '^[a-z]+([._][a-z]+)?$'
     or new.handle in ('admin','auth','p','assets','icons','sounds','fonts','share-image')) then
    raise exception 'User name: 3–30 латинских букв и не более одной точки или подчёркивания между словами.' using errcode='22023';
  end if;
  return new;
end; $$;
create trigger validate_profile_identity before update on public.profiles
for each row execute function public.validate_profile_identity();

create or replace function public.save_onboarding_identity(profile_name text, profile_handle text)
returns void language plpgsql set search_path = '' as $$
declare current_profile public.profiles;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select * into current_profile from public.profiles where id=auth.uid() for update;
  if not found then raise exception 'Профиль не найден.'; end if;
  if current_profile.onboarding_completed then raise exception 'Настройка уже завершена.'; end if;
  if char_length(profile_name) not between 1 and 60 or profile_name !~ '^[[:alpha:]]+( [[:alpha:]]+)*$' or profile_name is null then
    raise exception 'Имя: только буквы и пробелы, от 1 до 60 символов.' using errcode='22023';
  end if;
  if profile_handle is null or not public.is_handle_available(profile_handle) then
    raise exception 'User name некорректен или уже занят.' using errcode='22023';
  end if;
  update public.profiles set display_name=profile_name,handle=profile_handle where id=auth.uid();
  if not found then raise exception 'Не удалось сохранить профиль.' using errcode='42501'; end if;
end; $$;
revoke all on function public.save_onboarding_identity(text,text) from public,anon;
grant execute on function public.save_onboarding_identity(text,text) to authenticated;

alter table public.profile_contacts add column latitude double precision, add column longitude double precision;
alter table public.profile_contacts add constraint contact_coordinates_valid check (
  (latitude is null and longitude is null) or
  (kind='address' and latitude is not null and longitude is not null and latitude between -90 and 90 and longitude between -180 and 180)
);

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
     or current_profile.handle like 'draft-%' or char_length(current_profile.display_name) not between 1 and 60
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

-- A durable deletion marker blocks writes even with an access token issued before deletion.
create table moderation.account_deletions (
  target_id uuid primary key, actor_id uuid, requested_at timestamptz not null default now(), completed_at timestamptz
);
alter table moderation.account_deletions enable row level security;
revoke all on moderation.account_deletions from public,anon,authenticated;

create or replace function public.account_editable()
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from auth.users where id=auth.uid() and deleted_at is null)
    and not exists(select 1 from moderation.account_deletions where target_id=auth.uid())
    and not exists(select 1 from moderation.temporary_accounts where user_id=auth.uid() and status<>'claimed');
$$;
revoke all on function public.account_editable() from public,anon;
grant execute on function public.account_editable() to authenticated;

create or replace function moderation.prepare_account_deletion(target uuid, expected_handle text, reason text, self_service boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actual_handle text; objects jsonb; actor uuid:=auth.uid();
begin
  if actor is null or target is null or self_service is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if self_service and target<>actor then raise exception 'Own account only' using errcode='42501'; end if;
  if not self_service and (coalesce(moderation.my_role(),'')<>'admin' or target=actor) then raise exception 'Admin access required' using errcode='42501'; end if;
  if char_length(trim(coalesce(reason,''))) not between 3 and 1000 then raise exception 'Укажите причину.'; end if;
  perform pg_advisory_xact_lock(734029101);
  if not self_service and coalesce(moderation.my_role(),'')<>'admin' then raise exception 'Admin access required' using errcode='42501'; end if;
  select p.handle into actual_handle from auth.users u join public.profiles p on p.id=u.id
    where u.id=target and u.deleted_at is null for update of u,p;
  if not found then raise exception 'Пользователь не найден.'; end if;
  if exists(select 1 from moderation.staff where user_id=target) then raise exception 'Перед удалением снимите роль сотрудника.'; end if;
  if not self_service and actual_handle is distinct from expected_handle then raise exception 'Адрес страницы не совпадает.'; end if;
  update public.profiles set is_published=false where id=target;
  insert into moderation.account_deletions(target_id,actor_id) values(target,actor) on conflict(target_id) do nothing;
  insert into moderation.restrictions(target_id,kind,reason,actor_id) values(target,'profile','Удаление аккаунта',actor)
    on conflict(target_id) do update set reason=excluded.reason;
  if not exists(select 1 from moderation.audit where target_id=target and action='account_delete_requested') then
    insert into moderation.audit(actor_id,target_id,action,reason) values(actor,target,'account_delete_requested',trim(reason));
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('bucket',bucket_id,'name',name)),'[]'::jsonb) into objects
    from storage.objects where owner_id=target::text or owner=target or (bucket_id='avatars' and split_part(name,'/',1)=target::text);
  return jsonb_build_object('objects',objects,'handle',actual_handle);
end; $$;
revoke all on function moderation.prepare_account_deletion(uuid,text,text,boolean) from public,anon;
grant execute on function moderation.prepare_account_deletion(uuid,text,text,boolean) to authenticated;

create or replace function public.staff_prepare_account_deletion(target uuid, expected_handle text, reason text)
returns jsonb language sql set search_path='' as $$ select moderation.prepare_account_deletion(target,expected_handle,reason,false); $$;
revoke all on function public.staff_prepare_account_deletion(uuid,text,text) from public,anon;
grant execute on function public.staff_prepare_account_deletion(uuid,text,text) to authenticated;
create or replace function public.prepare_own_account_deletion(confirmation text)
returns jsonb language plpgsql set search_path='' as $$
begin
  if confirmation is distinct from 'УДАЛИТЬ' then raise exception 'Подтвердите удаление.'; end if;
  return moderation.prepare_account_deletion(auth.uid(),null,'Удаление по запросу владельца',true);
end; $$;
revoke all on function public.prepare_own_account_deletion(text) from public,anon;
grant execute on function public.prepare_own_account_deletion(text) to authenticated;

create or replace function public.staff_record_account_deleted(target uuid)
returns void language plpgsql security definer set search_path='' as $$
declare request_actor uuid; request_reason text;
begin
  -- Execute is granted only to service_role, never browser roles.
  if exists(select 1 from auth.users where id=target) then raise exception 'Account still exists'; end if;
  select actor_id,reason into request_actor,request_reason from moderation.audit
    where target_id=target and action='account_delete_requested' order by created_at desc,id desc limit 1;
  if not found then raise exception 'Deletion request missing'; end if;
  if not exists(select 1 from moderation.audit where target_id=target and action='account_deleted') then
    insert into moderation.audit(actor_id,target_id,action,reason) values(request_actor,target,'account_deleted',request_reason);
  end if;
  update moderation.account_deletions set completed_at=now() where target_id=target;
end; $$;
revoke all on function public.staff_record_account_deleted(uuid) from public,anon,authenticated;
grant execute on function public.staff_record_account_deleted(uuid) to service_role;
