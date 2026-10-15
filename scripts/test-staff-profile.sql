-- Isolated fixture: administrator editing cannot cross ownership boundaries.
insert into auth.users(id,email,raw_user_meta_data) values
 ('00000000-0000-4000-8000-000000000016','editor@example.com','{"handle":"editorpage","display_name":"Редактор"}');
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000016',false);
do $$ begin
 begin
  perform public.staff_save_profile('00000000-0000-4000-8000-000000000003','{}');
  raise exception 'user edited another profile';
 exception when insufficient_privilege then null; end;
end; $$;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',false);
do $$ declare details jsonb; payload jsonb; begin
 select to_jsonb(p) into details from public.profiles p where id='00000000-0000-4000-8000-000000000016';
 payload:=jsonb_build_object('profile',details||jsonb_build_object('show_qr',true),
  'links',jsonb_build_array(jsonb_build_object('label','Страница','url','https://example.com','icon_key','website','position',0,'is_visible',true,'is_sensitive',true,'label_font','manrope','label_font_size',11)),
  'contacts',jsonb_build_array(jsonb_build_object('kind','email','label','Почта','value','public@example.com','is_visible',true,'label_font','manrope','label_font_size',10,'value_font','manrope','value_font_size',9)));
 perform public.staff_save_profile('00000000-0000-4000-8000-000000000016',payload);
 if not exists(select 1 from public.profiles where id='00000000-0000-4000-8000-000000000016' and show_qr)
  or not exists(select 1 from public.profile_links where profile_id='00000000-0000-4000-8000-000000000016' and is_sensitive)
  or not exists(select 1 from moderation.audit where target_id='00000000-0000-4000-8000-000000000016' and action='profile_edited')
 then raise exception 'staff profile save did not persist'; end if;
 begin perform public.staff_save_profile(auth.uid(),payload); raise exception 'staff modified own account'; exception when insufficient_privilege then null; end;
end; $$;
reset role;
delete from auth.users where id='00000000-0000-4000-8000-000000000016';
