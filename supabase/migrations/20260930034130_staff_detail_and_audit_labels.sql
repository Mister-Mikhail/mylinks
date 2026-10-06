create or replace function moderation.detail(target uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or moderation.my_role() is null then raise exception 'Staff access required' using errcode = '42501'; end if;
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
$$;
create or replace function moderation.history(page integer) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or moderation.my_role() is null then raise exception 'Staff access required' using errcode = '42501'; end if;
  if page < 0 then raise exception 'Invalid page'; end if;
  return jsonb_build_object('total',(select count(*) from moderation.audit), 'events',coalesce((select jsonb_agg(to_jsonb(t)) from (
    select a.*, actor.handle as actor_handle, target.handle as target_handle,
      target.id as target_profile_id, l.label as target_link_label
    from moderation.audit a left join public.profiles actor on actor.id=a.actor_id
    left join public.profile_links l on l.id=a.target_id and a.action in ('restrict_link','restore_link')
    left join public.profiles target on target.id=case when a.action in ('restrict_link','restore_link') then l.profile_id else a.target_id end
    order by a.id desc limit 25 offset least(page,100000)*25
  ) t),'[]'::jsonb));
end;
$$;
alter table public.profiles add constraint profiles_handle_not_reserved check (handle not in ('admin','auth','p'));
