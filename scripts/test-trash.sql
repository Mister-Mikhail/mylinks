-- These fixtures only run in the isolated CI PostgreSQL service.
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
 ('00000000-0000-4000-8000-000000000010','restore@example.com',now(),'{"handle":"restore.page","display_name":"Анна"}'),
 ('00000000-0000-4000-8000-000000000011','expire@example.com',null,'{"handle":"expire_page","display_name":"Ирина"}'),
 ('00000000-0000-4000-8000-000000000012','legacy@example.com',now(),'{"handle":"old-name-123","display_name":"Пётр"}');
update public.profiles set is_published=true where id in ('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000011');
insert into public.profile_links(id,profile_id,label,url) values('00000000-0000-4000-8000-000000000100','00000000-0000-4000-8000-000000000011','Site','https://example.com');
insert into public.profile_contacts(profile_id,kind,value) values('00000000-0000-4000-8000-000000000011','phone','+79990000000');
insert into public.profile_events(profile_id) values('00000000-0000-4000-8000-000000000011');
insert into storage.objects(bucket_id,name,owner_id) values('avatars','00000000-0000-4000-8000-000000000011/image.gif','00000000-0000-4000-8000-000000000011');
insert into auth.sessions(user_id) values('00000000-0000-4000-8000-000000000011');
insert into moderation.restrictions(target_id,kind,reason) values('00000000-0000-4000-8000-000000000010','profile','Restriction before trash'),('00000000-0000-4000-8000-000000000100','link','Link restriction');
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000011',false);
do $$ begin
 begin perform public.staff_trash_prepare('00000000-0000-4000-8000-000000000010'); raise exception 'ordinary user can trash'; exception when insufficient_privilege then null; end;
 begin perform public.staff_trash(); raise exception 'ordinary user reads trash'; exception when insufficient_privilege then null; end;
 if exists(select 1 from public.profiles where id='00000000-0000-4000-8000-000000000010') then raise exception 'export can read another account'; end if;
end; $$;
reset role;
insert into moderation.staff values('00000000-0000-4000-8000-000000000012','moderator');
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000012',false);
do $$ begin
 begin perform public.staff_trash_prepare('00000000-0000-4000-8000-000000000010'); raise exception 'moderator can trash'; exception when insufficient_privilege then null; end;
end; $$;
reset role;
delete from moderation.staff where user_id='00000000-0000-4000-8000-000000000012';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',false);
do $$ begin
 if (moderation.users('','all',0)#>>'{stats,restricted}')::int<>1 then raise exception 'orphan/pending restrictions counted'; end if;
 begin perform public.staff_trash_prepare(auth.uid()); raise exception 'self trash accepted'; exception when raise_exception then if SQLERRM='self trash accepted' then raise; end if; end;
 begin perform public.staff_prepare_account_deletion('00000000-0000-4000-8000-000000000010','restore.page','test'); raise exception 'legacy hard deletion still enabled'; exception when insufficient_privilege then null; end;
end; $$;
select public.staff_trash_prepare('00000000-0000-4000-8000-000000000010','',30);
select public.staff_trash_prepare('00000000-0000-4000-8000-000000000011','Test reason',7);
select public.staff_trash_prepare('00000000-0000-4000-8000-000000000012','Legacy restore',90);
do $$ begin
 if (moderation.users('','all',0)#>>'{stats,restricted}')::int<>0 then raise exception 'trashed restriction counted'; end if;
 if moderation.detail('00000000-0000-4000-8000-000000000010')->'user'<>'null'::jsonb then raise exception 'detail exposes trashed profile'; end if;
 if (public.staff_trash()->>'total')::int<>3 then raise exception 'trash list incorrect'; end if;
 begin perform moderation.change('00000000-0000-4000-8000-000000000010','moderator','Test'); raise exception 'trashed account promoted'; exception when raise_exception then if SQLERRM='trashed account promoted' then raise; end if; end;
end; $$;
reset role;
update auth.users set email='trash-'||id||'@accounts.mylinks.invalid',banned_until=now()+interval '100 years' where id in ('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000012');
set role authenticated;
select public.staff_trash_finish('00000000-0000-4000-8000-000000000010');
select public.staff_trash_finish('00000000-0000-4000-8000-000000000011');
select public.staff_trash_finish('00000000-0000-4000-8000-000000000012');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000011',false);
do $$ begin
 if public.account_editable() then raise exception 'trashed owner editable'; end if;
 if exists(select 1 from public.profiles where id=auth.uid()) or exists(select 1 from public.profile_links where profile_id=auth.uid()) or exists(select 1 from public.profile_contacts where profile_id=auth.uid()) or exists(select 1 from public.profile_events where profile_id=auth.uid()) or exists(select 1 from storage.objects where owner_id=auth.uid()::text) then raise exception 'stale JWT still reads deleted data'; end if;
 begin perform public.prepare_own_account_deletion('УДАЛИТЬ'); raise exception 'trash owner started hard deletion'; exception when insufficient_privilege then null; end;
end; $$;
reset role;
do $$ begin
 if exists(select 1 from auth.sessions where user_id='00000000-0000-4000-8000-000000000011') then raise exception 'sessions not revoked'; end if;
 if not exists(select 1 from public.profile_links where profile_id='00000000-0000-4000-8000-000000000011') then raise exception 'trash destroyed links'; end if;
end; $$;
set role anon;
do $$ begin
 if exists(select 1 from public.profiles where id='00000000-0000-4000-8000-000000000011') or exists(select 1 from public.profile_links where profile_id='00000000-0000-4000-8000-000000000011') then raise exception 'trash public'; end if;
end; $$;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',false);
select public.staff_trash_restore_prepare('00000000-0000-4000-8000-000000000010');
select public.staff_trash_restore_prepare('00000000-0000-4000-8000-000000000012');
reset role;
update auth.users set email=case when id='00000000-0000-4000-8000-000000000010' then 'restore@example.com' else 'legacy@example.com' end,banned_until=null where id in ('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000012');
set role authenticated;
select public.staff_trash_restore_finish('00000000-0000-4000-8000-000000000010');
select public.staff_trash_restore_finish('00000000-0000-4000-8000-000000000012');
do $$ begin
 if (moderation.users('','all',0)#>>'{stats,restricted}')::int<>1 then raise exception 'restored restriction lost'; end if;
 if moderation.detail('00000000-0000-4000-8000-000000000012')#>>'{profile,handle}'<>'old-name-123' then raise exception 'legacy handle changed'; end if;
end; $$;
-- Email/username reuse is remembered even after the new account is removed.
select public.staff_trash_prepare('00000000-0000-4000-8000-000000000010','',30);
select public.staff_trash_prepare('00000000-0000-4000-8000-000000000012','',30);
reset role;
update auth.users set email='trash-'||id||'@accounts.mylinks.invalid',banned_until=now()+interval '100 years' where id in ('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000012');
set role authenticated;
select public.staff_trash_finish('00000000-0000-4000-8000-000000000010');
select public.staff_trash_finish('00000000-0000-4000-8000-000000000012');
reset role;
insert into auth.users(id,email,raw_user_meta_data) values('00000000-0000-4000-8000-000000000013','restore@example.com','{"handle":"different","display_name":"Новый"}'),('00000000-0000-4000-8000-000000000014','new@example.com','{"handle":"old-name-123","display_name":"Другой"}');
delete from auth.users where id in ('00000000-0000-4000-8000-000000000013','00000000-0000-4000-8000-000000000014');
set role authenticated;
do $$ declare target uuid; begin
 foreach target in array array['00000000-0000-4000-8000-000000000010'::uuid,'00000000-0000-4000-8000-000000000012'::uuid] loop
  begin perform public.staff_trash_restore_prepare(target); raise exception 'reused identity restored'; exception when raise_exception then if SQLERRM='reused identity restored' then raise; end if; end;
 end loop;
end; $$;
reset role;
-- Expiry, one-use worker ticket and storage manifest scope.
update moderation.user_trash set expires_at=now()-interval '1 hour' where target_id='00000000-0000-4000-8000-000000000011';
insert into moderation.trash_job_tickets values(sha256(convert_to('test-ticket','UTF8')),now()+interval '1 minute');
set role service_role;
do $$ declare batch jsonb; begin
 if not public.trash_lock('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000020') then raise exception 'lock failed'; end if;
 if public.trash_lock('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000021') then raise exception 'parallel auth operation allowed'; end if;
 perform public.trash_unlock('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000020');
 batch:=public.trash_claim_purge_batch('test-ticket');
 if jsonb_array_length(batch)<>1 or batch#>>'{0,target}'<>'00000000-0000-4000-8000-000000000011' or jsonb_array_length(batch#>'{0,objects}')<>1 then raise exception 'worker scope incorrect'; end if;
 begin perform public.trash_claim_purge_batch('test-ticket'); raise exception 'ticket reused'; exception when insufficient_privilege then null; end;
 begin perform public.trash_finish_purge('00000000-0000-4000-8000-000000000011'); raise exception 'finalized existing auth'; exception when raise_exception then if SQLERRM='finalized existing auth' then raise; end if; end;
end; $$;
reset role;
delete from storage.objects where owner_id='00000000-0000-4000-8000-000000000011';
delete from auth.users where id='00000000-0000-4000-8000-000000000011';
-- Simulate worker restart after Auth removal: preserve the original link IDs.
update moderation.user_trash set updated_at=now()-interval '16 minutes' where target_id='00000000-0000-4000-8000-000000000011';
insert into moderation.trash_job_tickets values(sha256(convert_to('retry-ticket','UTF8')),now()+interval '1 minute');
set role service_role;
select public.trash_claim_purge_batch('retry-ticket');
select public.trash_finish_purge('00000000-0000-4000-8000-000000000011');
reset role;
do $$ begin
 if exists(select 1 from moderation.user_trash where target_id='00000000-0000-4000-8000-000000000011') or exists(select 1 from moderation.restrictions where target_id='00000000-0000-4000-8000-000000000100') then raise exception 'purge cleanup incomplete'; end if;
 if (select count(*) from moderation.user_trash)<>2 then raise exception 'unexpired trash removed'; end if;
 if not exists(select 1 from moderation.audit where action='account_purged' and target_id='00000000-0000-4000-8000-000000000011') then raise exception 'purge audit missing'; end if;
end; $$;
