-- Expand the existing font keys without changing saved choices.
alter table public.profiles drop constraint profiles_name_font_check;
alter table public.profiles add constraint profiles_name_font_check check (name_font in ('manrope','arial','verdana','trebuchet','georgia','mono','oswald','cormorant','caveat','marck','lobster','pacifico','ruslan','rubik-mono','pixel'));
alter table public.profiles drop constraint profiles_bio_font_check;
alter table public.profiles add constraint profiles_bio_font_check check (bio_font in ('manrope','arial','verdana','trebuchet','georgia','mono','oswald','cormorant','caveat','marck','lobster','pacifico','ruslan','rubik-mono','pixel'));
alter table public.profiles drop constraint profiles_handle_font_check;
alter table public.profiles add constraint profiles_handle_font_check check (handle_font in ('manrope','arial','verdana','trebuchet','georgia','mono','oswald','cormorant','caveat','marck','lobster','pacifico','ruslan','rubik-mono','pixel'));
alter table public.profile_links drop constraint profile_links_label_font_check;
alter table public.profile_links add constraint profile_links_label_font_check check (label_font in ('manrope','arial','verdana','trebuchet','georgia','mono','oswald','cormorant','caveat','marck','lobster','pacifico','ruslan','rubik-mono','pixel'));

alter table public.profile_contacts
  add column label_font text not null default 'manrope' check (label_font in ('manrope','arial','verdana','trebuchet','georgia','mono','oswald','cormorant','caveat','marck','lobster','pacifico','ruslan','rubik-mono','pixel')),
  add column label_font_size smallint not null default 10 check (label_font_size between 10 and 16),
  add column value_font text not null default 'manrope' check (value_font in ('manrope','arial','verdana','trebuchet','georgia','mono','oswald','cormorant','caveat','marck','lobster','pacifico','ruslan','rubik-mono','pixel')),
  add column value_font_size smallint not null default 9 check (value_font_size between 9 and 14);

-- Preserve clicks already collected by the earlier analytics implementation.
-- Visitor ids here are legacy event ids; they never contribute to view/visitor totals.
insert into public.profile_events(profile_id,link_id,visitor_id,created_at,minute_bucket)
select e.profile_id,e.link_id,e.event_id,e.created_at,floor(extract(epoch from e.created_at)/60)
from analytics.link_clicks e join public.profiles p on p.id=e.profile_id
where not exists (select 1 from public.profile_events n where n.visitor_id=e.event_id)
on conflict do nothing;

-- 0/NULL: since registration; -1: a calendar year (365/366 days).
-- Positive values: trailing days. Events are retained without a 90-day cap.
create or replace function public.get_profile_statistics(p_days integer default 0)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with settings as (
    select (now() at time zone 'Europe/Moscow')::date as today,
      (p.created_at at time zone 'Europe/Moscow')::date as registered_on
    from public.profiles p where p.id = (select auth.uid())
  ), bounds as (
    select today, registered_on, greatest(registered_on, case
      when coalesce(p_days,0)=0 then registered_on
      when p_days=-1 then (today - interval '1 year')::date + 1
      else today - greatest(1,p_days) + 1 end) as since
    from settings
  ), scoped as (
    select e.* from public.profile_events e, bounds b
    where e.profile_id = (select auth.uid())
      and e.created_at >= (b.since::timestamp at time zone 'Europe/Moscow')
      and e.created_at < ((b.today+1)::timestamp at time zone 'Europe/Moscow')
  ), daily_counts as (
    select (created_at at time zone 'Europe/Moscow')::date as day,
      count(*) filter (where link_id is null) as views,
      count(*) filter (where link_id is not null) as clicks
    from scoped group by 1
  ), calendar as (
    select (b.today-n)::date as day from bounds b, generate_series(0,b.today-b.since) n
  ), link_counts as (
    select link_id,count(*) as clicks from scoped where link_id is not null group by link_id
  ), link_rows as (
    select l.id,l.label,coalesce(c.clicks,0) as clicks
    from public.profile_links l left join link_counts c on c.link_id=l.id
    where l.profile_id=(select auth.uid())
    union all
    select c.link_id,'Удалённая ссылка',c.clicks from link_counts c
    where not exists (select 1 from public.profile_links l where l.id=c.link_id)
  )
  select jsonb_build_object(
    'from', (select since from bounds), 'to', (select today from bounds),
    'registered_on', (select registered_on from bounds),
    'views', (select count(*) from scoped where link_id is null),
    'clicks', (select count(*) from scoped where link_id is not null),
    'visitors', (select count(distinct visitor_id) from scoped where link_id is null),
    'daily', coalesce((select jsonb_agg(jsonb_build_object('date',k.day,'views',coalesce(d.views,0),'clicks',coalesce(d.clicks,0)) order by k.day desc)
      from calendar k left join daily_counts d on k.day=d.day),'[]'::jsonb),
    'links', coalesce((select jsonb_agg(jsonb_build_object('id',id,'label',label,'clicks',clicks) order by clicks desc,label) from link_rows),'[]'::jsonb)
  );
$$;
revoke all on function public.get_profile_statistics(integer) from public,anon;
grant execute on function public.get_profile_statistics(integer) to authenticated;
