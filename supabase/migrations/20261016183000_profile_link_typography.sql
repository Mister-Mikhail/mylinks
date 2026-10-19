-- Profile defaults and nullable per-link overrides. Keep existing appearance intact.
alter table public.profiles
  add column if not exists link_font text not null default 'manrope' check (link_font in ('manrope','arial','verdana','trebuchet','georgia','mono','oswald','cormorant','caveat','marck','lobster','pacifico','ruslan','rubik-mono','pixel')),
  add column if not exists link_font_size smallint not null default 11 check (link_font_size between 11 and 16),
  add column if not exists link_color text check (link_color is null or link_color ~ '^#[0-9a-fA-F]{6}$');

-- Pick each profile's most common existing value; ties are stable. Divergent links remain overrides.
with ranked as (
  select profile_id, label_font as value,
    row_number() over (partition by profile_id order by count(*) desc, label_font) as rank
  from public.profile_links group by profile_id, label_font
)
update public.profiles p set link_font = ranked.value
from ranked where ranked.profile_id = p.id and ranked.rank = 1 and ranked.value is not null;
with ranked as (
  select profile_id, label_font_size as value,
    row_number() over (partition by profile_id order by count(*) desc, label_font_size) as rank
  from public.profile_links group by profile_id, label_font_size
)
update public.profiles p set link_font_size = ranked.value
from ranked where ranked.profile_id = p.id and ranked.rank = 1 and ranked.value is not null;
with ranked as (
  select profile_id, label_color as value,
    row_number() over (partition by profile_id order by count(*) desc, label_color nulls first) as rank
  from public.profile_links group by profile_id, label_color
)
update public.profiles p set link_color = ranked.value
from ranked where ranked.profile_id = p.id and ranked.rank = 1;

alter table public.profile_links
  alter column label_font drop not null,
  alter column label_font drop default,
  alter column label_font_size drop not null,
  alter column label_font_size drop default;
update public.profile_links l set
  label_font = case when l.label_font is not distinct from p.link_font then null else l.label_font end,
  label_font_size = case when l.label_font_size is not distinct from p.link_font_size then null else l.label_font_size end,
  label_color = case when l.label_color is not distinct from p.link_color then null else l.label_color end
from public.profiles p where p.id = l.profile_id;

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
       card_preset_override=item->>'card_preset_override',card_radius_override=(item->>'card_radius_override')::integer,
       is_visible=(item->>'is_visible')::boolean,is_sensitive=(item->>'is_sensitive')::boolean,position=n
     where id=item_id and profile_id=target;
   else
     insert into public.profile_links(profile_id,label,url,icon_key,label_font,label_font_size,label_color,card_preset_override,card_radius_override,is_visible,is_sensitive,position)
     values(target,item->>'label',item->>'url',item->>'icon_key',item->>'label_font',(item->>'label_font_size')::integer,item->>'label_color',item->>'card_preset_override',(item->>'card_radius_override')::integer,(item->>'is_visible')::boolean,(item->>'is_sensitive')::boolean,n)
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
