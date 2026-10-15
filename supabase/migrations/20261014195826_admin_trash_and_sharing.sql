-- Reversible administrator deletion. Auth credentials and media stay in place
-- until expiry; contact identity is released through the Auth Admin API.
create table moderation.user_trash (
  target_id uuid primary key,
  original_email text not null,
  original_handle text not null,
  display_name text not null default '',
  was_published boolean not null,
  email_confirmed boolean not null,
  actor_id uuid,
  reason text not null default '',
  deleted_at timestamptz not null default now(),
  expires_at timestamptz not null,
  state text not null default 'pending' check(state in ('pending','trashed','restoring','purging')),
  updated_at timestamptz not null default now(),
  conflict_at timestamptz,
  conflict_reason text,
  link_ids uuid[] not null default '{}'
);
alter table moderation.user_trash enable row level security;
revoke all on moderation.user_trash from public,anon,authenticated;
create index user_trash_expiry on moderation.user_trash(expires_at);
create index user_trash_email on moderation.user_trash(lower(original_email));
create index user_trash_handle on moderation.user_trash(original_handle);

create function moderation.not_trashed(target uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select not exists(select 1 from moderation.user_trash where target_id=target);
$$;
revoke all on function moderation.not_trashed(uuid) from public;
grant execute on function moderation.not_trashed(uuid) to anon,authenticated;
create policy profiles_not_trashed on public.profiles as restrictive for all to anon,authenticated
 using(moderation.not_trashed(id)) with check(moderation.not_trashed(id));
create policy links_not_trashed on public.profile_links as restrictive for all to anon,authenticated
 using(moderation.not_trashed(profile_id)) with check(moderation.not_trashed(profile_id));
create policy contacts_not_trashed on public.profile_contacts as restrictive for all to anon,authenticated
 using(moderation.not_trashed(profile_id)) with check(moderation.not_trashed(profile_id));
create policy events_not_trashed on public.profile_events as restrictive for all to anon,authenticated
 using(moderation.not_trashed(profile_id)) with check(moderation.not_trashed(profile_id));
create function moderation.storage_not_trashed(path text) returns boolean
language sql stable security definer set search_path='' as $$
 select not exists(select 1 from moderation.user_trash where target_id::text=split_part(path,'/',1));
$$;
revoke all on function moderation.storage_not_trashed(text) from public;
grant execute on function moderation.storage_not_trashed(text) to anon,authenticated;
create policy avatars_not_trashed on storage.objects as restrictive for all to anon,authenticated
 using(bucket_id<>'avatars' or moderation.storage_not_trashed(name))
 with check(bucket_id<>'avatars' or moderation.storage_not_trashed(name));

create or replace function public.account_editable() returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.users where id=auth.uid() and deleted_at is null)
 and moderation.not_trashed(auth.uid())
 and not exists(select 1 from moderation.account_deletions where target_id=auth.uid())
 and not exists(select 1 from moderation.temporary_accounts where user_id=auth.uid() and status<>'claimed');
$$;

create function moderation.trash_admin() returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or coalesce(moderation.my_role(),'')<>'admin' then
  raise exception 'Admin access required' using errcode='42501';
 end if;
end; $$;
revoke all on function moderation.trash_admin() from public,anon;
grant execute on function moderation.trash_admin() to authenticated;

-- An already used identity remains non-restorable even if its new owner later leaves.
create function moderation.track_reused_identity() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if TG_TABLE_SCHEMA='auth' then
  if TG_OP='INSERT' or new.email is distinct from old.email then
   update moderation.user_trash set conflict_at=coalesce(conflict_at,now()), conflict_reason=coalesce(conflict_reason,'Email уже использован другим аккаунтом.')
   where target_id<>new.id and lower(original_email)=lower(new.email) and new.email<>'';
  end if;
 else
  if TG_OP='INSERT' or new.handle is distinct from old.handle then
   update moderation.user_trash set conflict_at=coalesce(conflict_at,now()), conflict_reason=coalesce(conflict_reason,'User name уже использован другим профилем.')
   where target_id<>new.id and original_handle=new.handle;
  end if;
 end if;
 return new;
end; $$;
revoke all on function moderation.track_reused_identity() from public,anon,authenticated;
create trigger track_trash_email after insert or update of email on auth.users for each row execute function moderation.track_reused_identity();
create trigger track_trash_handle after insert or update of handle on public.profiles for each row execute function moderation.track_reused_identity();

-- Allow a checked administrator restore to retain a legacy handle exactly.
create function moderation.restoring_handle(target uuid,candidate text) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce(moderation.my_role(),'')='admin' and exists(
 select 1 from moderation.user_trash where target_id=target and state='restoring' and original_handle=candidate and conflict_at is null);
$$;
revoke all on function moderation.restoring_handle(uuid,text) from public,anon;
grant execute on function moderation.restoring_handle(uuid,text) to authenticated;
create or replace function public.validate_profile_identity() returns trigger language plpgsql set search_path='' as $$
begin
 if new.display_name is distinct from old.display_name and
  (char_length(new.display_name) not between 1 and 30 or new.display_name !~ '^[[:alpha:]]+( [[:alpha:]]+)*$') then
  raise exception 'Имя: только буквы и пробелы, от 1 до 30 символов.' using errcode='22023';
 end if;
 if new.handle is distinct from old.handle and
  (char_length(new.handle) not between 3 and 30 or new.handle !~ '^[a-z]+([._][a-z]+)?$'
   or new.handle in ('admin','auth','p','assets','icons','sounds','fonts','share-image'))
  and not moderation.restoring_handle(new.id,new.handle) then
  raise exception 'User name: 3–30 латинских букв и не более одной точки или подчёркивания между словами.' using errcode='22023';
 end if;
 return new;
end; $$;

create function moderation.trash_prepare(target uuid,comment text,retention_days integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u auth.users; p public.profiles; t moderation.user_trash;
begin
 perform moderation.trash_admin();
 if target=auth.uid() then raise exception 'Нельзя удалить собственный аккаунт из админки.'; end if;
 if retention_days not in (7,30,90) or retention_days is null or char_length(coalesce(comment,''))>1000 then raise exception 'Проверьте срок и комментарий.'; end if;
 perform pg_advisory_xact_lock(734029101);
 perform moderation.trash_admin();
 select * into t from moderation.user_trash where target_id=target for update;
 if found then
  if t.state not in ('pending','trashed') then raise exception 'С аккаунтом уже выполняется другое действие.'; end if;
  return jsonb_build_object('target',target,'email','trash-'||target::text||'@accounts.mylinks.invalid','expires_at',t.expires_at,'state',t.state);
 end if;
 select * into u from auth.users where id=target and deleted_at is null for update;
 if not found then raise exception 'Пользователь не найден.'; end if;
 select * into p from public.profiles where id=target for update;
 if not found then raise exception 'Профиль не найден.'; end if;
 if exists(select 1 from moderation.staff where user_id=target) then raise exception 'Перед удалением снимите роль сотрудника.'; end if;
 if exists(select 1 from moderation.account_deletions where target_id=target) then raise exception 'Безвозвратное удаление уже начато.'; end if;
 insert into moderation.user_trash(target_id,original_email,original_handle,display_name,was_published,email_confirmed,actor_id,reason,expires_at)
 values(target,u.email,p.handle,p.display_name,p.is_published,u.email_confirmed_at is not null,auth.uid(),trim(coalesce(comment,'')),now()+make_interval(days=>retention_days));
 update public.profiles set is_published=false where id=target;
 insert into moderation.audit(actor_id,target_id,action,reason) values(auth.uid(),target,'account_trashed',coalesce(nullif(trim(comment),''),'Перенос в корзину'));
 return jsonb_build_object('target',target,'email','trash-'||target::text||'@accounts.mylinks.invalid','expires_at',now()+make_interval(days=>retention_days),'state','pending');
end; $$;
revoke all on function moderation.trash_prepare(uuid,text,integer) from public,anon;
grant execute on function moderation.trash_prepare(uuid,text,integer) to authenticated;
create function public.staff_trash_prepare(target uuid,comment text default '',retention_days integer default 30) returns jsonb
language sql set search_path='' as $$ select moderation.trash_prepare(target,comment,retention_days); $$;
revoke all on function public.staff_trash_prepare(uuid,text,integer) from public,anon;
grant execute on function public.staff_trash_prepare(uuid,text,integer) to authenticated;

create function moderation.trash_finish(target uuid) returns void
language plpgsql security definer set search_path='' as $$
declare t moderation.user_trash;
begin
 perform moderation.trash_admin();
 select * into t from moderation.user_trash where target_id=target for update;
 if not found or t.state not in ('pending','trashed') then raise exception 'Операция недоступна.'; end if;
 if not exists(select 1 from auth.users where id=target and email='trash-'||target::text||'@accounts.mylinks.invalid' and banned_until>now()) then raise exception 'Отключение аккаунта ещё не завершено.'; end if;
 -- Letters only keep the internal handle valid without weakening identity validation.
 update public.profiles set handle='archived'||translate(left(md5(target::text),22),'0123456789','ghijklmnop') where id=target;
 update moderation.user_trash set state='trashed',updated_at=now() where target_id=target;
 delete from auth.sessions where user_id=target;
end; $$;
revoke all on function moderation.trash_finish(uuid) from public,anon;
grant execute on function moderation.trash_finish(uuid) to authenticated;
create function public.staff_trash_finish(target uuid) returns void language sql set search_path='' as $$ select moderation.trash_finish(target); $$;
revoke all on function public.staff_trash_finish(uuid) from public,anon;
grant execute on function public.staff_trash_finish(uuid) to authenticated;

create function moderation.trash_restore_prepare(target uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare t moderation.user_trash;
begin
 perform moderation.trash_admin();
 perform pg_advisory_xact_lock(734029101);
 select * into t from moderation.user_trash where target_id=target for update;
 if not found or t.state not in ('trashed','restoring') then raise exception 'Профиль недоступен для восстановления.'; end if;
 if t.expires_at<=now() then raise exception 'Срок восстановления истёк.'; end if;
 if t.conflict_at is not null then raise exception '%',t.conflict_reason; end if;
 if exists(select 1 from auth.users where id<>target and lower(email)=lower(t.original_email) and deleted_at is null)
  or exists(select 1 from public.profiles where id<>target and handle=t.original_handle) then raise exception 'Email или user name уже заняты.'; end if;
 update moderation.user_trash set state='restoring',updated_at=now() where target_id=target;
 -- Reserve the handle before the Auth email change; unique constraints arbitrate races.
 update public.profiles set handle=t.original_handle where id=target;
 return jsonb_build_object('target',target,'email',t.original_email,'email_confirmed',t.email_confirmed);
end; $$;
revoke all on function moderation.trash_restore_prepare(uuid) from public,anon;
grant execute on function moderation.trash_restore_prepare(uuid) to authenticated;
create function public.staff_trash_restore_prepare(target uuid) returns jsonb language sql set search_path='' as $$ select moderation.trash_restore_prepare(target); $$;
revoke all on function public.staff_trash_restore_prepare(uuid) from public,anon;
grant execute on function public.staff_trash_restore_prepare(uuid) to authenticated;

create function moderation.trash_restore_finish(target uuid) returns void
language plpgsql security definer set search_path='' as $$
declare t moderation.user_trash;
begin
 perform moderation.trash_admin();
 select * into t from moderation.user_trash where target_id=target for update;
 if not found or t.state<>'restoring' then raise exception 'Восстановление не начато.'; end if;
 if t.conflict_at is not null then raise exception '%',t.conflict_reason; end if;
 if not exists(select 1 from auth.users where id=target and lower(email)=lower(t.original_email) and (banned_until is null or banned_until<=now())) then raise exception 'Восстановление входа ещё не завершено.'; end if;
 update public.profiles set is_published=t.was_published where id=target;
 delete from moderation.user_trash where target_id=target;
 insert into moderation.audit(actor_id,target_id,action,reason) values(auth.uid(),target,'account_restored','Восстановлен из корзины');
end; $$;
revoke all on function moderation.trash_restore_finish(uuid) from public,anon;
grant execute on function moderation.trash_restore_finish(uuid) to authenticated;
create function public.staff_trash_restore_finish(target uuid) returns void language sql set search_path='' as $$ select moderation.trash_restore_finish(target); $$;
revoke all on function public.staff_trash_restore_finish(uuid) from public,anon;
grant execute on function public.staff_trash_restore_finish(uuid) to authenticated;

create function moderation.trash_list(page integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 perform moderation.trash_admin();
 if page<0 or page>100000 or page is null then raise exception 'Invalid page'; end if;
 return jsonb_build_object('total',(select count(*) from moderation.user_trash),'items',coalesce((select jsonb_agg(to_jsonb(t)) from (
 select target_id as id,original_email as email,original_handle as handle,display_name,reason,deleted_at,expires_at,state,
 case when conflict_at is not null then conflict_reason when expires_at<=now() then 'Срок восстановления истёк.' when state='pending' then 'Перенос не завершён. Повторите удаление.' when state='purging' then 'Выполняется окончательное удаление.' else null end as restore_blocked
 from moderation.user_trash order by deleted_at desc,target_id limit 25 offset page*25)t),'[]'::jsonb));
end; $$;
revoke all on function moderation.trash_list(integer) from public,anon;
grant execute on function moderation.trash_list(integer) to authenticated;
create function public.staff_trash(page integer default 0) returns jsonb language sql stable set search_path='' as $$ select moderation.trash_list(page); $$;
revoke all on function public.staff_trash(integer) from public,anon;
grant execute on function public.staff_trash(integer) to authenticated;

-- Disable the legacy administrator hard-delete entry point. Self-delete stays intact.
revoke execute on function public.staff_prepare_account_deletion(uuid,text,text) from authenticated;

create function moderation.trash_restore_cancel(target uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform moderation.trash_admin();
 perform 1 from moderation.user_trash where target_id=target and state='restoring' for update;
 if not found then return; end if;
 if not exists(select 1 from auth.users where id=target and email='trash-'||target::text||'@accounts.mylinks.invalid' and banned_until>now()) then raise exception 'Не удалось вернуть аккаунт в корзину.'; end if;
 update public.profiles set handle='archived'||translate(left(md5(target::text),22),'0123456789','ghijklmnop') where id=target;
 update moderation.user_trash set state='trashed',updated_at=now() where target_id=target;
end; $$;
revoke all on function moderation.trash_restore_cancel(uuid) from public,anon;
grant execute on function moderation.trash_restore_cancel(uuid) to authenticated;
create function public.staff_trash_restore_cancel(target uuid) returns void language sql set search_path='' as $$ select moderation.trash_restore_cancel(target); $$;
revoke all on function public.staff_trash_restore_cancel(uuid) from public,anon;
grant execute on function public.staff_trash_restore_cancel(uuid) to authenticated;

-- Lease serializes Auth API changes across concurrent administrator requests.
create table moderation.trash_locks(target_id uuid primary key,token uuid not null,expires_at timestamptz not null);
alter table moderation.trash_locks enable row level security;
revoke all on moderation.trash_locks from public,anon,authenticated;
create function public.trash_lock(target uuid,lease uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 insert into moderation.trash_locks values(target,lease,now()+interval '5 minutes')
 on conflict(target_id) do update set token=excluded.token,expires_at=excluded.expires_at
 where moderation.trash_locks.expires_at<now();
 return found;
end; $$;
create function public.trash_unlock(target uuid,lease uuid) returns void
language sql security definer set search_path='' as $$ delete from moderation.trash_locks where target_id=target and token=lease; $$;
revoke all on function public.trash_lock(uuid,uuid),public.trash_unlock(uuid,uuid) from public,anon,authenticated;
grant execute on function public.trash_lock(uuid,uuid),public.trash_unlock(uuid,uuid) to service_role;

-- One-use short-lived tickets authenticate the scheduled worker without exposing
-- a service key in SQL job text, the browser, or the network request.
create table moderation.trash_job_tickets(token_hash bytea primary key,expires_at timestamptz not null);
alter table moderation.trash_job_tickets enable row level security;
revoke all on moderation.trash_job_tickets from public,anon,authenticated;
create function public.trash_claim_purge_batch(ticket text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare t moderation.user_trash; result jsonb:='[]'; objects jsonb;
begin
 if ticket is null or length(ticket)>100 then raise exception 'Invalid ticket' using errcode='42501'; end if;
 delete from moderation.trash_job_tickets where token_hash=sha256(convert_to(ticket,'UTF8')) and expires_at>now();
 if not found then raise exception 'Invalid ticket' using errcode='42501'; end if;
 for t in select * from moderation.user_trash tr where expires_at<=now()
  and not exists(select 1 from moderation.trash_locks l where l.target_id=tr.target_id and l.expires_at>now())
  and (state not in ('restoring','purging') or updated_at<now()-interval '15 minutes')
  order by expires_at limit 10 for update skip locked loop
  update moderation.user_trash set state='purging',updated_at=now(),link_ids=array(select unnest(t.link_ids) union select id from public.profile_links where profile_id=t.target_id) where target_id=t.target_id;
  select coalesce(jsonb_agg(jsonb_build_object('bucket',bucket_id,'name',name)),'[]') into objects from storage.objects
   where owner_id=t.target_id::text or owner=t.target_id or (bucket_id='avatars' and split_part(name,'/',1)=t.target_id::text);
  result:=result||jsonb_build_array(jsonb_build_object('target',t.target_id,'objects',objects));
 end loop;
 return result;
end; $$;
revoke all on function public.trash_claim_purge_batch(text) from public,anon,authenticated;
grant execute on function public.trash_claim_purge_batch(text) to service_role;
create function public.trash_finish_purge(target uuid) returns void
language plpgsql security definer set search_path='' as $$
declare t moderation.user_trash;
begin
 select * into t from moderation.user_trash where target_id=target and state='purging' for update;
 if not found then raise exception 'Purge was not claimed'; end if;
 if exists(select 1 from auth.users where id=target) then raise exception 'Auth account still exists'; end if;
 delete from moderation.restrictions where target_id=target or target_id=any(t.link_ids);
 delete from moderation.user_trash where target_id=target;
 insert into moderation.audit(actor_id,target_id,action,reason)
 values(case when exists(select 1 from auth.users where id=t.actor_id) then t.actor_id else null end,target,'account_purged','Срок хранения в корзине истёк');
end; $$;
revoke all on function public.trash_finish_purge(uuid) from public,anon,authenticated;
grant execute on function public.trash_finish_purge(uuid) to service_role;
CREATE OR REPLACE FUNCTION moderation.users(q text, state text, page integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result jsonb;
begin
  if auth.uid() is null or moderation.my_role() is null then raise exception 'Staff access required' using errcode = '42501'; end if;
  if state not in ('all', 'new', 'restricted', 'staff') or length(q) > 200 or page < 0 then raise exception 'Invalid filter'; end if;
  with active_users as (select * from auth.users where deleted_at is null and moderation.not_trashed(id)), filtered as (
    select u.id, u.email, u.created_at, u.last_sign_in_at, u.email_confirmed_at,
      p.handle, p.display_name, p.bio, coalesce(p.is_published, false) as is_published,
      coalesce(s.role, 'user') as role, r.reason as restriction_reason,
      (select count(*) from public.profile_links l where l.profile_id=u.id) as link_count
    from active_users u left join public.profiles p on p.id=u.id
    left join moderation.staff s on s.user_id=u.id
    left join moderation.restrictions r on r.target_id=u.id and r.kind='profile'
    where u.deleted_at is null
      and (q='' or position(lower(q) in lower(coalesce(u.email,'') || ' ' || coalesce(p.handle,'') || ' ' || coalesce(p.display_name,''))) > 0)
      and (state='all' or (state='new' and u.created_at >= now()-interval '7 days') or (state='restricted' and r.target_id is not null) or (state='staff' and s.user_id is not null))
  )
  select jsonb_build_object('total', (select count(*) from filtered), 'users', coalesce((select jsonb_agg(to_jsonb(t)) from (select * from filtered order by created_at desc, id limit 25 offset least(page,100000)*25) t), '[]'::jsonb),
    'stats', jsonb_build_object('total',(select count(*) from active_users where deleted_at is null), 'today',(select count(*) from active_users where deleted_at is null and created_at >= date_trunc('day',now() at time zone 'Europe/Moscow') at time zone 'Europe/Moscow'), 'week',(select count(*) from active_users where deleted_at is null and created_at >= now()-interval '7 days'), 'restricted',(select count(*) from moderation.restrictions r join active_users u on u.id=r.target_id join public.profiles p on p.id=u.id where r.kind='profile' and not exists(select 1 from moderation.account_deletions d where d.target_id=u.id))))
  into result;
  return result;
end;
$function$;

CREATE OR REPLACE FUNCTION moderation.detail(target uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is null or moderation.my_role() is null then raise exception 'Staff access required' using errcode = '42501'; end if;
  if not moderation.not_trashed(target) then return jsonb_build_object('user',null,'profile',null,'links','[]'::jsonb); end if;
  return jsonb_build_object('user',(select to_jsonb(t) from (
    select u.id, u.email, u.created_at, u.last_sign_in_at, u.email_confirmed_at,
      p.handle, p.display_name, p.bio, coalesce(p.is_published,false) as is_published,
      coalesce(s.role,'user') as role, r.reason as restriction_reason,
      (select count(*) from public.profile_links l where l.profile_id=u.id) as link_count
    from auth.users u left join public.profiles p on p.id=u.id
    left join moderation.staff s on s.user_id=u.id
    left join moderation.restrictions r on r.target_id=u.id and r.kind='profile'
    where u.id=target and u.deleted_at is null
  ) t), 'profile',(select to_jsonb(p) from public.profiles p where id=target),
  'links',coalesce((select jsonb_agg(to_jsonb(l) || jsonb_build_object('restriction_reason',r.reason) order by l.position,l.id) from public.profile_links l left join moderation.restrictions r on r.target_id=l.id where l.profile_id=target),'[]'::jsonb));
end;
$function$;

CREATE OR REPLACE FUNCTION moderation.change(target uuid, action text, reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare caller_role text; target_owner uuid; previous_role text;
begin
  caller_role := moderation.my_role();
  if auth.uid() is null or caller_role is null then raise exception 'Staff access required' using errcode='42501'; end if;
  if length(trim(reason)) not between 3 and 1000 then raise exception 'Укажите причину: 3–1000 символов.'; end if;
  -- Serialize role and restriction changes, including the last-admin invariant.
  perform pg_advisory_xact_lock(734029101);
  caller_role := moderation.my_role();
  if caller_role is null then raise exception 'Staff access required' using errcode='42501'; end if;
  if not moderation.not_trashed(target) or exists(select 1 from public.profile_links l where l.id=target and not moderation.not_trashed(l.profile_id)) then raise exception 'Профиль находится в корзине.'; end if;
  if action in ('admin','moderator','user') then
    if caller_role <> 'admin' then raise exception 'Admin access required' using errcode='42501'; end if;
    if not exists(select 1 from auth.users where id=target and deleted_at is null) then raise exception 'User not found'; end if;
    select role into previous_role from moderation.staff where user_id=target;
    if previous_role='admin' and action<>'admin' and (select count(*) from moderation.staff where role='admin') <= 1 then raise exception 'Нельзя убрать последнего администратора.'; end if;
    if not moderation.allowed(target) then raise exception 'Сначала снимите ограничение профиля.'; end if;
    if action='user' then delete from moderation.staff where user_id=target;
    else insert into moderation.staff(user_id,role) values(target,action) on conflict(user_id) do update set role=excluded.role; end if;
  elsif action in ('restrict_profile','restore_profile','restrict_link','restore_link') then
    if action like '%profile' then
      select id into target_owner from auth.users where id=target and deleted_at is null;
    else
      select profile_id into target_owner from public.profile_links where id=target;
    end if;
    if target_owner is null then raise exception 'Target not found'; end if;
    if exists(select 1 from moderation.staff where user_id=target_owner) then raise exception 'Сначала снимите роль сотрудника.'; end if;
    if action like 'restrict_%' then
      insert into moderation.restrictions(target_id,kind,reason,actor_id)
      values(target,case when action='restrict_profile' then 'profile' else 'link' end,trim(reason),auth.uid())
      on conflict(target_id) do update set reason=excluded.reason, actor_id=excluded.actor_id, created_at=now();
    else delete from moderation.restrictions where target_id=target; end if;
  else raise exception 'Invalid action'; end if;
  insert into moderation.audit(actor_id,target_id,action,reason) values(auth.uid(),target,action,trim(reason));
end;
$function$;


-- Self-service deletion stays permanent; administrators must use the reversible flow.
create or replace function moderation.prepare_account_deletion(target uuid, expected_handle text, reason text, self_service boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actual_handle text; objects jsonb; actor uuid:=auth.uid();
begin
  if actor is null or target is null or self_service is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if not self_service then raise exception 'Use the administrator trash' using errcode='42501'; end if;
  if not moderation.not_trashed(target) then raise exception 'Account is in trash' using errcode='42501'; end if;
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
