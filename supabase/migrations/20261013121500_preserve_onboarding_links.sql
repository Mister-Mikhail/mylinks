-- Preserve links and contacts that already exist when a new owner finishes onboarding.
-- Replaces the function only; existing profile data is unchanged.
create or replace function public.complete_onboarding(payload jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  profile_handle text;
  profile_name text;
  profile_bio text;
  item jsonb;
  item_position integer := 0;
  contact_data jsonb;
begin
  if owner_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if jsonb_typeof(payload) <> 'object' then
    raise exception 'Invalid onboarding data';
  end if;

  profile_handle := lower(trim(coalesce(payload->>'handle', '')));
  profile_name := trim(coalesce(payload->>'display_name', ''));
  profile_bio := trim(coalesce(payload->>'bio', ''));

  if profile_handle !~ '^[a-z0-9][a-z0-9._-]{1,28}[a-z0-9]$'
     or profile_handle in ('admin','auth','p','assets','icons','sounds','fonts','share-image') then
    raise exception 'Имя ссылки должно содержать 3–30 допустимых символов и начинаться и заканчиваться буквой или цифрой.';
  end if;
  if char_length(profile_name) not between 1 and 80 or char_length(profile_bio) > 160 then
    raise exception 'Проверьте имя и описание профиля.';
  end if;
  if (select onboarding_completed from public.profiles where id = owner_id) then
    raise exception 'Настройка профиля уже завершена.';
  end if;

  update public.profiles
  set handle = profile_handle,
      display_name = profile_name,
      bio = profile_bio,
      background_preset = case when payload->>'background_preset' in ('midnight','mist','cobalt') then payload->>'background_preset' else 'midnight' end,
      card_preset = case when payload->>'card_preset' in ('glass','solid','outline') then payload->>'card_preset' else 'glass' end,
      is_published = case when payload->>'publish' in ('true','false') then (payload->>'publish')::boolean else false end,
      onboarding_completed = true,
      onboarding_progress = '{}'::jsonb
  where id = owner_id;

  -- A new account may already have links through another editor or an interrupted flow.
  -- Append missing wizard links; never replace the owner's existing rows.
  select coalesce(max(position), -1) + 1 into item_position
  from public.profile_links where profile_id = owner_id;
  if jsonb_typeof(payload->'links') = 'array' then
    if jsonb_array_length(payload->'links') > 3 then raise exception 'Добавьте не больше трёх ссылок на старте.'; end if;
    for item in select value from jsonb_array_elements(payload->'links') loop
      if coalesce(trim(item->>'url'), '') <> '' then
        if char_length(trim(item->>'label')) not between 1 and 80
           or char_length(trim(item->>'url')) not between 8 and 2048
           or trim(item->>'url') !~* '^https?://' then
          raise exception 'Проверьте данные ссылки.';
        end if;
        insert into public.profile_links(profile_id,label,url,icon_key,position,is_visible)
        select owner_id,trim(item->>'label'),trim(item->>'url'),coalesce(nullif(item->>'icon_key',''),'link'),item_position,true
        where not exists (
          select 1 from public.profile_links existing
          where existing.profile_id=owner_id and existing.label=trim(item->>'label')
            and existing.url=trim(item->>'url')
        );
        item_position := item_position + 1;
      end if;
    end loop;
  end if;

  contact_data := payload->'contact';
  if jsonb_typeof(contact_data) = 'object' and coalesce(trim(contact_data->>'value'),'') <> '' then
    if contact_data->>'kind' not in ('address','phone','email')
       or char_length(trim(contact_data->>'value')) not between 1 and 500
       or char_length(trim(coalesce(contact_data->>'label',''))) > 80 then
      raise exception 'Проверьте данные контакта.';
    end if;
    insert into public.profile_contacts(profile_id,kind,label,value,position,is_visible)
    select owner_id,contact_data->>'kind',trim(coalesce(contact_data->>'label','')),trim(contact_data->>'value'),
      (select coalesce(max(position), -1) + 1 from public.profile_contacts where profile_id=owner_id),
      case when contact_data->>'is_visible' in ('true','false') then (contact_data->>'is_visible')::boolean else false end
    where not exists (
      select 1 from public.profile_contacts existing
      where existing.profile_id=owner_id and existing.kind=contact_data->>'kind'
        and existing.value=trim(contact_data->>'value')
        and existing.label=trim(coalesce(contact_data->>'label',''))
    );
  end if;
end;
$$;

revoke all on function public.complete_onboarding(jsonb) from public, anon;
grant execute on function public.complete_onboarding(jsonb) to authenticated;
