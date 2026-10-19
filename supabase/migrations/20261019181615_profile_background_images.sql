-- Expand only: existing presets and files remain unchanged.
alter table public.profiles
 add column if not exists background_image_path text,
 add column if not exists background_overlay integer not null default 45 check(background_overlay between 0 and 80);
alter table public.profiles drop constraint if exists profiles_background_style_check;
alter table public.profiles add constraint profiles_background_style_check check(background_style in ('preset','solid','gradient','image'));
do $$ begin
 if not exists(select 1 from pg_constraint where conrelid='public.profiles'::regclass and conname='profiles_background_image_owner_check') then
  alter table public.profiles add constraint profiles_background_image_owner_check check(background_image_path is null or background_image_path ~ ('^'||id::text||'/[a-f0-9-]{36}\.webp$'));
 end if;
end $$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('profile-assets','profile-assets',false,1500000,array['image/webp']) on conflict(id) do nothing;
drop policy if exists profile_assets_owner_read on storage.objects;
create policy profile_assets_owner_read on storage.objects for select to authenticated using(bucket_id='profile-assets' and split_part(name,'/',1)=auth.uid()::text and moderation.storage_not_trashed(name));
drop policy if exists profile_assets_owner_insert on storage.objects;
create policy profile_assets_owner_insert on storage.objects for insert to authenticated with check(bucket_id='profile-assets' and name ~ ('^'||auth.uid()::text||'/[a-f0-9-]{36}\.webp$') and public.account_editable());
drop policy if exists profile_assets_owner_delete on storage.objects;
create policy profile_assets_owner_delete on storage.objects for delete to authenticated using(bucket_id='profile-assets' and split_part(name,'/',1)=auth.uid()::text and public.account_editable());
-- Unused drafts can never be signed by anonymous visitors. Profiles are filtered by RLS.
drop policy if exists profile_assets_published_read on storage.objects;
create policy profile_assets_published_read on storage.objects for select to anon,authenticated using(bucket_id='profile-assets' and exists(select 1 from public.profiles p where p.is_published and p.background_style='image' and p.background_image_path=name and moderation.storage_not_trashed(name)));
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
     update public.profile_links set label=item->>'label',url=item->>'url',icon_key=item->>'icon_key',
       label_font=item->>'label_font',label_font_size=(item->>'label_font_size')::integer,label_color=item->>'label_color',
       card_preset_override=item->>'card_preset_override',card_radius_override=(item->>'card_radius_override')::integer,card_style=nullif(item->'card_style','null'::jsonb),
       is_visible=(item->>'is_visible')::boolean,is_sensitive=(item->>'is_sensitive')::boolean,position=n
     where id=item_id and profile_id=target;
   else
     insert into public.profile_links(profile_id,label,url,icon_key,label_font,label_font_size,label_color,card_preset_override,card_radius_override,card_style,is_visible,is_sensitive,position)
     values(target,item->>'label',item->>'url',item->>'icon_key',item->>'label_font',(item->>'label_font_size')::integer,item->>'label_color',item->>'card_preset_override',(item->>'card_radius_override')::integer,nullif(item->'card_style','null'::jsonb),(item->>'is_visible')::boolean,(item->>'is_sensitive')::boolean,n)
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

do $$ declare signature text; definition text; begin
 foreach signature in array array['public.trash_claim_purge_batch(text)','moderation.prepare_account_deletion(uuid,text,text,boolean)'] loop
  definition:=pg_get_functiondef(signature::regprocedure);
  definition:=replace(definition,'bucket_id = ''avatars''','bucket_id in (''avatars'',''profile-assets'')');
  definition:=replace(definition,'bucket_id=''avatars''','bucket_id in (''avatars'',''profile-assets'')');
  execute definition;
 end loop;
end $$;
