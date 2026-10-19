-- Runs only in the isolated PostgreSQL CI fixture created by the registration test.
\i supabase/migrations/20261015120547_public_qr_size_and_card_radius.sql
\i supabase/migrations/20261015213000_typography_colors.sql
\i supabase/migrations/20261016010256_custom_background_card_style.sql
\i supabase/migrations/20261016011817_per_link_card_style.sql

insert into auth.users(id,email,raw_user_meta_data) values
 ('00000000-0000-4000-8000-000000000017','appearance@example.com','{"handle":"appearancecase","display_name":"Appearance"}');
insert into public.profile_links(profile_id,label,url,label_font,label_font_size,label_color) values
 ('00000000-0000-4000-8000-000000000017','One','https://example.com/one','oswald',13,'#aabbcc'),
 ('00000000-0000-4000-8000-000000000017','Two','https://example.com/two','oswald',13,'#aabbcc'),
 ('00000000-0000-4000-8000-000000000017','Three','https://example.com/three','georgia',15,'#123456');
create temporary table appearance_before as
 select id,label_font,label_font_size,label_color from public.profile_links
 where profile_id='00000000-0000-4000-8000-000000000017';

\i supabase/migrations/20261016183000_profile_link_typography.sql
do $$ begin
 if not exists(select 1 from public.profiles where id='00000000-0000-4000-8000-000000000017'
   and link_font='oswald' and link_font_size=13 and link_color='#aabbcc') then
   raise exception 'Most common link typography was not migrated';
 end if;
 if exists(select 1 from appearance_before b join public.profile_links l using(id)
   join public.profiles p on p.id=l.profile_id
   where coalesce(l.label_font,p.link_font) is distinct from b.label_font
     or coalesce(l.label_font_size,p.link_font_size) is distinct from b.label_font_size
     or coalesce(l.label_color,p.link_color) is distinct from b.label_color) then
   raise exception 'Migration changed existing rendered typography';
 end if;
 if (select count(*) from public.profile_links where profile_id='00000000-0000-4000-8000-000000000017'
   and label_font is null and label_font_size is null and label_color is null)<>2 then
   raise exception 'Common values did not become nullable overrides';
 end if;
end $$;
insert into public.profile_links(profile_id,label,url) values
 ('00000000-0000-4000-8000-000000000017','Inherited','https://example.com/inherited');
do $$ begin
 if not exists(select 1 from public.profile_links where profile_id='00000000-0000-4000-8000-000000000017'
   and label='Inherited' and label_font is null and label_font_size is null) then
   raise exception 'New link does not inherit profile typography';
 end if;
end $$;

\i supabase/migrations/20261016190000_card_style_v1.sql
-- A repeat must not fail on an existing column or constraint.
\i supabase/migrations/20261016190000_card_style_v1.sql
do $$ declare invalid jsonb; begin
 if public.valid_card_style_v1(null) is not true
   or public.valid_card_style_v1('{"version":1,"padding":8,"borderWidth":0,"opacity":60}') is not true
   or public.valid_card_style_v1('{"version":1,"padding":24,"borderWidth":3,"opacity":100}') is not true then
   raise exception 'Valid card style rejected';
 end if;
 foreach invalid in array array[
   'null'::jsonb,'{}'::jsonb,'{"padding":12}'::jsonb,'{"version":null}'::jsonb,
   '{"version":"1"}'::jsonb,'{"version":2}'::jsonb,
   '{"version":1,"padding":7}'::jsonb,'{"version":1,"padding":25}'::jsonb,
   '{"version":1,"padding":12.5}'::jsonb,'{"version":1,"opacity":59}'::jsonb,
   '{"version":1,"opacity":101}'::jsonb,'{"version":1,"borderWidth":4}'::jsonb,
   '{"version":1,"background":"url(https://example.com)"}'::jsonb
 ] loop
   if public.valid_card_style_v1(invalid) is not false then raise exception 'Invalid style accepted: %',invalid; end if;
   begin
     update public.profile_links set card_style=invalid where profile_id='00000000-0000-4000-8000-000000000017';
     raise exception 'Card style constraint accepted invalid data';
   exception when check_violation then null; end;
 end loop;
end $$;

-- JSON null from the actual admin payload must become SQL NULL on insert/update.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',false);
do $$ declare details jsonb; payload jsonb; first_id uuid; begin
 details:=moderation.detail('00000000-0000-4000-8000-000000000017');
 first_id:=(details#>>'{links,0,id}')::uuid;
 payload:=jsonb_build_object('profile',details->'profile','links',details->'links','contacts','[]'::jsonb);
 payload:=jsonb_set(payload,'{links,0,card_style}','{"version":1,"padding":20,"borderWidth":2,"opacity":80}');
 perform public.staff_save_profile('00000000-0000-4000-8000-000000000017',payload);
 if not exists(select 1 from public.profile_links where id=first_id and card_style->>'padding'='20') then
   raise exception 'Admin did not save a custom card style';
 end if;
 payload:=jsonb_set(payload,'{links,0,card_style}','null');
 payload:=jsonb_set(payload,'{links}',(payload->'links')||jsonb_build_array(jsonb_build_object(
   'label','Admin new','url','https://example.com/admin-new','icon_key','website',
   'is_visible',true,'is_sensitive',false,'card_style',null)));
 perform public.staff_save_profile('00000000-0000-4000-8000-000000000017',payload);
 if exists(select 1 from public.profile_links where id=first_id and card_style is not null)
   or not exists(select 1 from public.profile_links where profile_id='00000000-0000-4000-8000-000000000017'
     and label='Admin new' and card_style is null and label_font is null and label_font_size is null) then
   raise exception 'Admin insert or reset did not normalize JSON null';
 end if;
end $$;
reset role;
do $$ begin
 if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relname in ('profiles','profile_links','profile_contacts') and not c.relrowsecurity) then
   raise exception 'Appearance migration disabled RLS';
 end if;
 if not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='moderation' and p.proname='save_staff_profile' and p.prosecdef
   and not has_function_privilege('anon',p.oid,'execute')) then
   raise exception 'Admin function privileges changed';
 end if;
end $$;
\echo Appearance migrations, inheritance, validation, replay, admin reset and RLS checks passed
