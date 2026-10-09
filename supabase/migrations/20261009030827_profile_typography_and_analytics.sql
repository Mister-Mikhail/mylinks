alter table public.profiles
  add column name_font text not null default 'manrope' check (name_font in ('manrope','arial','verdana','trebuchet','georgia','mono')),
  add column name_font_size smallint not null default 21 check (name_font_size in (18,20,21,22,24,26,28)),
  add column bio_font text not null default 'manrope' check (bio_font in ('manrope','arial','verdana','trebuchet','georgia','mono')),
  add column bio_font_size smallint not null default 10 check (bio_font_size between 10 and 14),
  add column handle_font text not null default 'manrope' check (handle_font in ('manrope','arial','verdana','trebuchet','georgia','mono')),
  add column handle_font_size smallint not null default 10 check (handle_font_size between 10 and 14);
alter table public.profile_links
  add column label_font text not null default 'manrope' check (label_font in ('manrope','arial','verdana','trebuchet','georgia','mono')),
  add column label_font_size smallint not null default 11 check (label_font_size between 11 and 16);

-- Only the owner can read events. No IP, user agent, name or contact data is collected.
-- link_id intentionally survives link deletion, preserving historical totals.
create table public.profile_events (
  id bigint generated always as identity primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  link_id uuid,
  visitor_id uuid not null,
  created_at timestamptz not null default now(),
  minute_bucket bigint not null default floor(extract(epoch from now()) / 60)
);
create index profile_events_owner_date on public.profile_events(profile_id, created_at);
create unique index profile_events_dedupe on public.profile_events
  (profile_id, coalesce(link_id, '00000000-0000-0000-0000-000000000000'::uuid), visitor_id, minute_bucket);
alter table public.profile_events enable row level security;
revoke all on public.profile_events from public, anon, authenticated;
grant insert on public.profile_events to anon, authenticated;
grant select on public.profile_events to authenticated;
grant usage on sequence public.profile_events_id_seq to anon, authenticated;

create policy "Owners read statistics" on public.profile_events for select to authenticated
  using (profile_id = (select auth.uid()));
create policy "Published pages receive events" on public.profile_events for insert to anon, authenticated
  with check (
    created_at between now() - interval '5 seconds' and now()
    and minute_bucket = floor(extract(epoch from now()) / 60)
    and profile_id is distinct from (select auth.uid())
    -- These subqueries also apply the existing publication and moderation RLS rules.
    and exists (select 1 from public.profiles p where p.id = profile_id and p.is_published)
    and (link_id is null or exists (
      select 1 from public.profile_links l
      where l.id = link_id and l.profile_id = profile_events.profile_id and l.is_visible
    ))
  );

create function public.record_profile_event(p_profile_id uuid, p_visitor_id uuid, p_link_id uuid default null)
returns void language sql volatile security invoker set search_path = '' as $$
  insert into public.profile_events(profile_id, link_id, visitor_id)
  values (p_profile_id, p_link_id, p_visitor_id) on conflict do nothing;
$$;
revoke all on function public.record_profile_event(uuid,uuid,uuid) from public;
grant execute on function public.record_profile_event(uuid,uuid,uuid) to anon, authenticated;

create function public.get_profile_statistics(p_days integer default 30)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with settings as (
    select (now() at time zone 'Europe/Moscow')::date as today,
           greatest(1, least(coalesce(p_days, 30), 90)) as days
  ), scoped as (
    select e.* from public.profile_events e, settings s
    where e.profile_id = (select auth.uid())
      and e.created_at >= ((s.today - s.days + 1)::timestamp at time zone 'Europe/Moscow')
  ), daily_counts as (
    select (created_at at time zone 'Europe/Moscow')::date as day,
      count(*) filter (where link_id is null) as views,
      count(*) filter (where link_id is not null) as clicks
    from scoped group by 1
  ), calendar as (
    select (s.today - n)::date as day from settings s,
      generate_series(0, s.days - 1) n
  ), link_counts as (
    select link_id, count(*) as clicks from scoped where link_id is not null group by link_id
  ), link_rows as (
    select l.id, l.label, coalesce(c.clicks,0) as clicks
    from public.profile_links l left join link_counts c on c.link_id = l.id
    where l.profile_id = (select auth.uid())
    union all
    select c.link_id, 'Удалённая ссылка', c.clicks from link_counts c
    where not exists (select 1 from public.profile_links l where l.id = c.link_id)
  )
  select jsonb_build_object(
    'views', (select count(*) from scoped where link_id is null),
    'clicks', (select count(*) from scoped where link_id is not null),
    'visitors', (select count(distinct visitor_id) from scoped where link_id is null),
    'daily', coalesce((select jsonb_agg(jsonb_build_object('date',k.day,'views',coalesce(d.views,0),'clicks',coalesce(d.clicks,0)) order by k.day desc)
              from calendar k left join daily_counts d on k.day = d.day), '[]'::jsonb),
    'links', coalesce((select jsonb_agg(jsonb_build_object('id',id,'label',label,'clicks',clicks) order by clicks desc,label) from link_rows), '[]'::jsonb)
  );
$$;
revoke all on function public.get_profile_statistics(integer) from public, anon;
grant execute on function public.get_profile_statistics(integer) to authenticated;
