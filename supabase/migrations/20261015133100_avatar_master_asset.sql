alter table public.profiles add column if not exists avatar_master_path text;
alter table public.profiles add constraint avatar_master_owner check (
 avatar_master_path is null or split_part(avatar_master_path,'/',1)=id::text
);

create or replace function moderation.set_staff_avatar_with_master(
 target uuid, avatar text, media text, crop jsonb, poster text, master text
) returns void language plpgsql security definer set search_path='' as $$
begin
 perform moderation.set_staff_avatar(target,avatar,media,crop,poster);
 if master is not null and master not like target::text||'/master-%'
 then raise exception 'Invalid master asset' using errcode='22023'; end if;
 update public.profiles set avatar_master_path=master where id=target;
end; $$;
revoke all on function moderation.set_staff_avatar_with_master(uuid,text,text,jsonb,text,text) from public,anon,authenticated;
grant execute on function moderation.set_staff_avatar_with_master(uuid,text,text,jsonb,text,text) to authenticated;
create or replace function public.staff_set_avatar_with_master(
 target uuid, avatar text, media text, crop jsonb, poster text, master text
) returns void language sql set search_path='' as $$
 select moderation.set_staff_avatar_with_master(target,avatar,media,crop,poster,master);
$$;
revoke all on function public.staff_set_avatar_with_master(uuid,text,text,jsonb,text,text) from public,anon;
grant execute on function public.staff_set_avatar_with_master(uuid,text,text,jsonb,text,text) to authenticated;
