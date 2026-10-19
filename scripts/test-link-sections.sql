\i supabase/migrations/20261019182209_link_sections.sql
\i supabase/migrations/20261019182209_link_sections.sql
begin;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000017',false);
do $$ declare selected_link uuid; layout jsonb; begin
 select l.id into selected_link from public.profile_links l where profile_id=auth.uid() limit 1;
 layout:=jsonb_build_object('version',1,'blocks',jsonb_build_array(jsonb_build_object('id','11111111-1111-4111-8111-111111111111','type','group','title','Проекты','link_ids',jsonb_build_array(selected_link))));
 update public.profiles set link_layout=layout where profiles.id=auth.uid();
 if not exists(select 1 from public.profile_links where profile_links.id=selected_link)then raise exception 'Grouping replaced original link';end if;
 begin update public.profiles set link_layout=jsonb_set(layout,'{blocks,0,link_ids}','["00000000-0000-4000-8000-000000000099"]')where profiles.id=auth.uid();raise exception 'Foreign or missing link accepted';exception when insufficient_privilege then null;end;
 begin update public.profiles set link_layout='{"version":2,"blocks":[]}' where profiles.id=auth.uid();raise exception 'Invalid layout accepted';exception when invalid_parameter_value or check_violation then null;end;
 delete from public.profile_links where profile_links.id=selected_link;
 if exists(select 1 from public.profiles p where p.id=auth.uid() and jsonb_array_length(p.link_layout#>'{blocks,0,link_ids}')<>0)then raise exception 'Deleted link reference retained';end if;
 update public.profiles set link_layout=null where profiles.id=auth.uid();
end $$;
reset role;
rollback;
\echo Link layout replay, preservation, cross-owner references, schema and deletion checks passed
