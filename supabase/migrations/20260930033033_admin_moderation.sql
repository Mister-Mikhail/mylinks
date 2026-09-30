-- Staff data is never exposed through the Data API. Public RPCs are invoker wrappers.
create schema if not exists moderation;
revoke all on schema moderation from public, anon, authenticated;
grant usage on schema moderation to anon, authenticated;

create table moderation.staff (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'moderator')),
  created_at timestamptz not null default now()
);
create table moderation.restrictions (
  target_id uuid primary key,
  kind text not null check (kind in ('profile', 'link')),
  reason text not null check (length(reason) between 3 and 1000),
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create table moderation.audit (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  target_id uuid not null,
  action text not null,
  reason text not null,
  created_at timestamptz not null default now()
);
create index on moderation.audit (created_at desc);
alter table moderation.staff enable row level security;
alter table moderation.restrictions enable row level security;
alter table moderation.audit enable row level security;
revoke all on all tables in schema moderation from public, anon, authenticated;

create function moderation.my_role() returns text
language sql stable security definer set search_path = '' as $$
  select role from moderation.staff where user_id = auth.uid();
$$;
create function moderation.allowed(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select not exists (select 1 from moderation.restrictions where target_id = target);
$$;
revoke all on function moderation.my_role(), moderation.allowed(uuid) from public;
grant execute on function moderation.my_role() to authenticated;
grant execute on function moderation.allowed(uuid) to anon, authenticated;

-- Restrictive policies also cover authenticated visitors, without broadening owner access.
create policy "Moderation profile visibility" on public.profiles as restrictive
for select to anon, authenticated using (id = (select auth.uid()) or moderation.allowed(id));
create policy "Moderation link visibility" on public.profile_links as restrictive
for select to anon, authenticated using (profile_id = (select auth.uid()) or (moderation.allowed(profile_id) and moderation.allowed(id)));
create policy "Moderation contact visibility" on public.profile_contacts as restrictive
for select to anon, authenticated using (profile_id = (select auth.uid()) or moderation.allowed(profile_id));

create function moderation.users(q text, state text, page integer) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if auth.uid() is null or moderation.my_role() is null then raise exception 'Staff access required' using errcode = '42501'; end if;
  if state not in ('all', 'new', 'restricted', 'staff') or length(q) > 200 or page < 0 then raise exception 'Invalid filter'; end if;
  with filtered as (
    select u.id, u.email, u.created_at, u.last_sign_in_at, u.email_confirmed_at,
      p.handle, p.display_name, p.bio, coalesce(p.is_published, false) as is_published,
      coalesce(s.role, 'user') as role, r.reason as restriction_reason,
      (select count(*) from public.profile_links l where l.profile_id=u.id) as link_count
    from auth.users u left join public.profiles p on p.id=u.id
    left join moderation.staff s on s.user_id=u.id
    left join moderation.restrictions r on r.target_id=u.id and r.kind='profile'
    where u.deleted_at is null
      and (q='' or position(lower(q) in lower(coalesce(u.email,'') || ' ' || coalesce(p.handle,'') || ' ' || coalesce(p.display_name,''))) > 0)
      and (state='all' or (state='new' and u.created_at >= now()-interval '7 days') or (state='restricted' and r.target_id is not null) or (state='staff' and s.user_id is not null))
  )
  select jsonb_build_object('total', (select count(*) from filtered), 'users', coalesce((select jsonb_agg(to_jsonb(t)) from (select * from filtered order by created_at desc, id limit 25 offset least(page,100000)*25) t), '[]'::jsonb),
    'stats', jsonb_build_object('total',(select count(*) from auth.users where deleted_at is null), 'today',(select count(*) from auth.users where deleted_at is null and created_at >= date_trunc('day',now() at time zone 'Europe/Moscow') at time zone 'Europe/Moscow'), 'week',(select count(*) from auth.users where deleted_at is null and created_at >= now()-interval '7 days'), 'restricted',(select count(*) from moderation.restrictions where kind='profile')))
  into result;
  return result;
end;
$$;

create function moderation.detail(target uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or moderation.my_role() is null then raise exception 'Staff access required' using errcode = '42501'; end if;
  return jsonb_build_object('profile',(select to_jsonb(p) from public.profiles p where id=target),
    'links',coalesce((select jsonb_agg(to_jsonb(l) || jsonb_build_object('restriction_reason',r.reason) order by l.position, l.id) from public.profile_links l left join moderation.restrictions r on r.target_id=l.id where l.profile_id=target),'[]'::jsonb));
end;
$$;

create function moderation.history(page integer) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or moderation.my_role() is null then raise exception 'Staff access required' using errcode = '42501'; end if;
  if page < 0 then raise exception 'Invalid page'; end if;
  return jsonb_build_object('total',(select count(*) from moderation.audit), 'events',coalesce((select jsonb_agg(to_jsonb(t)) from (select a.*, p.handle as actor_handle from moderation.audit a left join public.profiles p on p.id=a.actor_id order by a.id desc limit 25 offset least(page,100000)*25) t),'[]'::jsonb));
end;
$$;

create function moderation.change(target uuid, action text, reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare caller_role text; target_owner uuid; previous_role text;
begin
  caller_role := moderation.my_role();
  if auth.uid() is null or caller_role is null then raise exception 'Staff access required' using errcode='42501'; end if;
  if length(trim(reason)) not between 3 and 1000 then raise exception 'Укажите причину: 3–1000 символов.'; end if;
  -- Serialize role and restriction changes, including the last-admin invariant.
  perform pg_advisory_xact_lock(734029101);
  caller_role := moderation.my_role();
  if caller_role is null then raise exception 'Staff access required' using errcode='42501'; end if;
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
$$;

revoke all on function moderation.users(text,text,integer), moderation.detail(uuid), moderation.history(integer), moderation.change(uuid,text,text) from public, anon;
grant execute on function moderation.users(text,text,integer), moderation.detail(uuid), moderation.history(integer), moderation.change(uuid,text,text) to authenticated;

create function public.staff_role() returns text language sql stable security invoker set search_path='' as $$ select moderation.my_role(); $$;
create function public.staff_users(q text default '', state text default 'all', page integer default 0) returns jsonb language sql stable security invoker set search_path='' as $$ select moderation.users(q,state,page); $$;
create function public.staff_detail(target uuid) returns jsonb language sql stable security invoker set search_path='' as $$ select moderation.detail(target); $$;
create function public.staff_history(page integer default 0) returns jsonb language sql stable security invoker set search_path='' as $$ select moderation.history(page); $$;
create function public.staff_change(target uuid, action text, reason text) returns void language sql security invoker set search_path='' as $$ select moderation.change(target,action,reason); $$;
revoke all on function public.staff_role(),public.staff_users(text,text,integer),public.staff_detail(uuid),public.staff_history(integer),public.staff_change(uuid,text,text) from public, anon;
grant execute on function public.staff_role(),public.staff_users(text,text,integer),public.staff_detail(uuid),public.staff_history(integer),public.staff_change(uuid,text,text) to authenticated;
