create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

create table if not exists moderation.temporary_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  login_count smallint not null default 0 check (login_count between 0 and 10),
  login_sessions uuid[] not null default '{}',
  pending_email text,
  desired_handle text,
  desired_name text,
  status text not null default 'active' check (status in ('active','claim_pending','expired','claimed')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now()+interval '30 days'),
  delete_after timestamptz
);
alter table moderation.temporary_accounts enable row level security;
revoke all on moderation.temporary_accounts from public, anon, authenticated;
create index if not exists temporary_accounts_cleanup_idx on moderation.temporary_accounts(delete_after) where delete_after is not null;

create table if not exists moderation.username_login_failures (
  id bigint generated always as identity primary key,
  handle text not null,
  ip_hash text not null,
  created_at timestamptz not null default now()
);
alter table moderation.username_login_failures enable row level security;
revoke all on moderation.username_login_failures from public, anon, authenticated;
create index if not exists username_login_failures_window_idx on moderation.username_login_failures(handle,ip_hash,created_at desc);

create table if not exists moderation.reports (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references auth.users(id) on delete set null,
  link_id uuid references public.profile_links(id) on delete set null,
  category text not null check (category in ('spam','scam','abuse','adult','copyright','other')),
  details text not null default '' check (char_length(details) <= 2000),
  reporter_email text not null,
  reporter_id uuid references auth.users(id) on delete set null,
  status text not null default 'new' check (status in ('new','reviewing','resolved','dismissed')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  staff_note text not null default ''
);
alter table moderation.reports enable row level security;
revoke all on moderation.reports from public, anon, authenticated;
create index if not exists moderation_reports_queue_idx on moderation.reports(status, created_at desc);
create index if not exists moderation_reports_email_idx on moderation.reports(lower(reporter_email), created_at desc);

create table if not exists moderation.warnings (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references auth.users(id) on delete set null,
  report_id uuid references moderation.reports(id) on delete set null,
  actor_id uuid references auth.users(id) on delete set null,
  reason text not null check (char_length(reason) between 3 and 1000),
  created_at timestamptz not null default now()
);
alter table moderation.warnings enable row level security;
revoke all on moderation.warnings from public, anon, authenticated;
create index if not exists moderation_warnings_profile_idx on moderation.warnings(profile_id, created_at desc);

create or replace function public.staff_register_temporary(target uuid, initial_handle text, initial_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  safe_handle text := lower(trim(coalesce(initial_handle,'')));
  safe_name text := trim(coalesce(initial_name,''));
begin
  if auth.uid() is null or coalesce(moderation.my_role(),'') <> 'admin' then
    raise exception 'Admin access required' using errcode='42501';
  end if;
  if not exists (select 1 from auth.users where id=target and deleted_at is null) then raise exception 'User not found'; end if;
  if safe_handle !~ '^[a-z0-9][a-z0-9._-]{1,28}[a-z0-9]$'
     or safe_handle in ('admin','auth','p','assets','icons','sounds','fonts','share-image') then
    raise exception 'Проверьте адрес страницы.';
  end if;
  if char_length(safe_name) not between 1 and 80 then raise exception 'Проверьте имя пользователя.'; end if;
  insert into moderation.temporary_accounts(user_id,created_by,desired_handle,desired_name)
  values(target,auth.uid(),safe_handle,safe_name)
  on conflict(user_id) do nothing;
  insert into moderation.audit(actor_id,target_id,action,reason)
  values(auth.uid(),target,'create_temporary_user','Temporary account created');
end;
$$;

create or replace function public.temporary_account_session()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  session_token uuid;
  temp moderation.temporary_accounts%rowtype;
  next_count integer;
begin
  if owner_id is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select (auth.jwt()->>'session_id')::uuid into session_token;
  if session_token is null then raise exception 'Session identity missing'; end if;
  select * into temp from moderation.temporary_accounts where user_id=owner_id for update;
  if not found or temp.status='claimed' then return jsonb_build_object('is_temporary',false); end if;
  if temp.status='expired' or temp.expires_at<=now() or (temp.delete_after is not null and temp.delete_after<=now()) then
    update moderation.temporary_accounts set status='expired',delete_after=coalesce(delete_after,now()) where user_id=owner_id;
    update public.profiles set is_published=false where id=owner_id;
    return jsonb_build_object('is_temporary',true,'expired',true,'remaining_logins',0);
  end if;
  if session_token=any(temp.login_sessions) then
    return jsonb_build_object('is_temporary',true,'expired',false,'login_count',temp.login_count,
      'remaining_logins',10-temp.login_count,'desired_handle',temp.desired_handle,'desired_name',temp.desired_name);
  end if;
  if temp.login_count>=10 then
    update moderation.temporary_accounts set status='expired',delete_after=now() where user_id=owner_id;
    update public.profiles set is_published=false where id=owner_id;
    return jsonb_build_object('is_temporary',true,'expired',true,'remaining_logins',0);
  end if;
  next_count := temp.login_count+1;
  update moderation.temporary_accounts
  set login_count=next_count,
      login_sessions=array_append(login_sessions,session_token),
      status=case when next_count=10 then 'claim_pending' else status end,
      delete_after=case when next_count=10 then now()+interval '24 hours' else delete_after end
  where user_id=owner_id;
  return jsonb_build_object('is_temporary',true,'expired',false,'login_count',next_count,
    'remaining_logins',10-next_count,'desired_handle',temp.desired_handle,'desired_name',temp.desired_name);
end;
$$;

create or replace function public.begin_temporary_claim(desired_handle text, desired_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  safe_handle text := lower(trim(coalesce(desired_handle,'')));
  safe_name text := trim(coalesce(desired_name,''));
begin
  if owner_id is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if safe_handle !~ '^[a-z0-9][a-z0-9._-]{1,28}[a-z0-9]$'
     or safe_handle in ('admin','auth','p','assets','icons','sounds','fonts','share-image') then
    raise exception 'Проверьте адрес страницы.';
  end if;
  if char_length(safe_name) not between 1 and 80 then raise exception 'Проверьте имя страницы.'; end if;
  if exists(select 1 from public.profiles where handle=safe_handle and id<>owner_id) then raise exception 'Этот адрес уже занят.'; end if;
  update moderation.temporary_accounts
  set desired_handle=safe_handle,desired_name=safe_name
  where user_id=owner_id and status in ('active','claim_pending') and (delete_after is null or delete_after>now());
  if not found then raise exception 'Временный доступ истёк. Обратитесь к администратору.'; end if;
end;
$$;

create or replace function public.finish_temporary_claim()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  temp_status text;
  desired_handle text;
  desired_name text;
begin
  if owner_id is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select status,temporary_accounts.desired_handle,temporary_accounts.desired_name
  into temp_status,desired_handle,desired_name
  from moderation.temporary_accounts where user_id=owner_id for update;
  if temp_status not in ('active','claim_pending') or desired_handle is null or desired_name is null then return false; end if;
  update public.profiles
  set handle=desired_handle,display_name=desired_name,onboarding_completed=false,onboarding_progress='{}'::jsonb
  where id=owner_id;
  update moderation.temporary_accounts set status='claimed',delete_after=null,pending_email=null where user_id=owner_id;
  return true;
end;
$$;

create or replace function public.username_login_allowed(target_handle text, request_ip text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists(
    select 1 from moderation.temporary_accounts t
    join public.profiles p on p.id=t.user_id
    where p.handle=lower(trim(target_handle)) and t.status='claimed'
      and (select count(*) from moderation.username_login_failures f
           where f.handle=lower(trim(target_handle)) and f.ip_hash=md5(coalesce(request_ip,'unknown'))
             and f.created_at>now()-interval '15 minutes')<10
  );
$$;

create or replace function public.username_login_failed(target_handle text, request_ip text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into moderation.username_login_failures(handle,ip_hash)
  values(lower(trim(target_handle)),md5(coalesce(request_ip,'unknown')));
  delete from moderation.username_login_failures where created_at<now()-interval '1 day';
end;
$$;

create or replace function public.submit_profile_report(
  target_handle text,
  target_link uuid,
  report_category text,
  report_details text,
  contact_email text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_profile uuid;
  new_report uuid;
  normalized_email text := lower(trim(coalesce(contact_email,'')));
begin
  if report_category not in ('spam','scam','abuse','adult','copyright','other') then raise exception 'Выберите причину обращения.'; end if;
  if normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Укажите email для связи.'; end if;
  if char_length(trim(coalesce(report_details,'')))>2000 then raise exception 'Описание слишком длинное.'; end if;
  select p.id into target_profile
  from public.profiles p
  where p.handle=lower(trim(target_handle)) and p.is_published
    and not exists(select 1 from moderation.restrictions r where r.target_id=p.id and r.kind='profile')
  limit 1;
  if target_profile is null then raise exception 'Страница не найдена или недоступна.'; end if;
  if target_link is not null and not exists(
    select 1 from public.profile_links l
    where l.id=target_link and l.profile_id=target_profile and l.is_visible
      and not exists(select 1 from moderation.restrictions r where r.target_id=l.id and r.kind='link')
  ) then raise exception 'Ссылка не найдена.'; end if;
  if (select count(*) from moderation.reports where lower(reporter_email)=normalized_email and created_at>now()-interval '24 hours')>=3 then
    raise exception 'С этого адреса уже отправлено несколько обращений. Попробуйте позже.';
  end if;
  insert into moderation.reports(profile_id,link_id,category,details,reporter_email,reporter_id)
  values(target_profile,target_link,report_category,trim(coalesce(report_details,'')),normalized_email,auth.uid())
  returning id into new_report;
  return new_report;
end;
$$;

create or replace function public.staff_reports(page integer default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or moderation.my_role() is null then raise exception 'Staff access required' using errcode='42501'; end if;
  return jsonb_build_object(
    'total',(select count(*) from moderation.reports),
    'reports',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',r.id,'profile_id',r.profile_id,'handle',p.handle,'display_name',p.display_name,
        'link_id',r.link_id,'link_label',l.label,'link_url',l.url,'category',r.category,'details',r.details,
        'reporter_email',r.reporter_email,'status',r.status,'created_at',r.created_at,'staff_note',r.staff_note
      ) order by r.created_at desc)
      from (select * from moderation.reports order by created_at desc offset greatest(page,0)*25 limit 25) r
      left join public.profiles p on p.id=r.profile_id
      left join public.profile_links l on l.id=r.link_id
    ),'[]'::jsonb)
  );
end;
$$;

create or replace function public.staff_review_report(report_id uuid, next_status text, action text, reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare report moderation.reports%rowtype;
begin
  if auth.uid() is null or moderation.my_role() is null then raise exception 'Staff access required' using errcode='42501'; end if;
  if length(trim(coalesce(reason,''))) not between 3 and 1000 then raise exception 'Укажите причину: 3–1000 символов.'; end if;
  if next_status not in ('reviewing','resolved','dismissed') then raise exception 'Invalid status'; end if;
  select * into report from moderation.reports where id=report_id for update;
  if not found then raise exception 'Report not found'; end if;
  if action='warn' then
    if report.profile_id is null then raise exception 'Профиль уже удалён.'; end if;
    insert into moderation.warnings(profile_id,report_id,actor_id,reason) values(report.profile_id,report.id,auth.uid(),trim(reason));
    insert into moderation.audit(actor_id,target_id,action,reason) values(auth.uid(),report.profile_id,'warning_issued',trim(reason));
    next_status := 'resolved';
  elsif action='restrict_profile' then
    if report.profile_id is null then raise exception 'Профиль уже удалён.'; end if;
    perform moderation.change(report.profile_id,'restrict_profile',trim(reason));
    next_status := 'resolved';
  elsif action='restrict_link' then
    if report.link_id is null then raise exception 'В этой жалобе нет ссылки.'; end if;
    perform moderation.change(report.link_id,'restrict_link',trim(reason));
    next_status := 'resolved';
  elsif action='remove_link' then
    if report.link_id is null or report.profile_id is null then raise exception 'В жалобе нет доступной ссылки.'; end if;
    delete from public.profile_links where id=report.link_id and profile_id=report.profile_id;
    if not found then raise exception 'Ссылка уже удалена или недоступна.'; end if;
    insert into moderation.warnings(profile_id,report_id,actor_id,reason)
    values(report.profile_id,report.id,auth.uid(),trim(reason));
    insert into moderation.audit(actor_id,target_id,action,reason)
    values(auth.uid(),report.link_id,'link_removed_with_warning',trim(reason));
    next_status := 'resolved';
  elsif action not in ('none','') then
    raise exception 'Invalid action';
  end if;
  update moderation.reports
  set status=next_status,reviewed_at=now(),reviewed_by=auth.uid(),staff_note=trim(reason)
  where id=report.id;
end;
$$;

create or replace function public.staff_mark_account_deactivated(target uuid, reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $
begin
  if auth.uid() is null or moderation.my_role() is null then raise exception 'Staff access required' using errcode='42501'; end if;
  if length(trim(coalesce(reason,''))) not between 3 and 1000 then raise exception 'Укажите причину: 3–1000 символов.'; end if;
  insert into moderation.audit(actor_id,target_id,action,reason)
  values(auth.uid(),target,'deactivate_account',trim(reason));
end;
$;

create or replace function moderation.cleanup_temporary_accounts()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare removed integer;
begin
  update moderation.temporary_accounts set status='expired',delete_after=now()
  where status='active' and expires_at<=now();
  delete from auth.users u
  using moderation.temporary_accounts t
  where t.user_id=u.id and t.status in ('expired','claim_pending')
    and t.delete_after is not null and t.delete_after<=now();
  get diagnostics removed = row_count;
  return removed;
end;
$$;
revoke all on function moderation.cleanup_temporary_accounts() from public, anon, authenticated;

do $$
begin
  if exists(select 1 from cron.job where jobname='mylinks-temporary-account-cleanup') then
    perform cron.unschedule(jobid) from cron.job where jobname='mylinks-temporary-account-cleanup';
  end if;
  perform cron.schedule('mylinks-temporary-account-cleanup','*/15 * * * *','select moderation.cleanup_temporary_accounts();');
end $$;

revoke all on function public.staff_register_temporary(uuid,text,text) from public, anon, authenticated;
grant execute on function public.staff_register_temporary(uuid,text,text) to authenticated;
revoke all on function public.temporary_account_session() from public, anon;
grant execute on function public.temporary_account_session() to authenticated;
revoke all on function public.begin_temporary_claim(text,text) from public, anon;
grant execute on function public.begin_temporary_claim(text,text) to authenticated;
revoke all on function public.finish_temporary_claim() from public, anon;
grant execute on function public.finish_temporary_claim() to authenticated;
revoke all on function public.username_login_allowed(text,text) from public, anon, authenticated;
grant execute on function public.username_login_allowed(text,text) to service_role;
revoke all on function public.username_login_failed(text,text) from public, anon, authenticated;
grant execute on function public.username_login_failed(text,text) to service_role;
revoke all on function public.submit_profile_report(text,uuid,text,text,text) from public;
grant execute on function public.submit_profile_report(text,uuid,text,text,text) to anon, authenticated;
revoke all on function public.staff_reports(integer) from public, anon;
grant execute on function public.staff_reports(integer) to authenticated;
revoke all on function public.staff_review_report(uuid,text,text,text) from public, anon;
grant execute on function public.staff_review_report(uuid,text,text,text) to authenticated;

revoke all on function public.staff_mark_account_deactivated(uuid,text) from public, anon;
grant execute on function public.staff_mark_account_deactivated(uuid,text) to authenticated;
