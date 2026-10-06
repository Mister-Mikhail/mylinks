do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'avatar_scale'
  ) then
    alter table public.profiles
    add column avatar_scale smallint not null default 28;

    update public.profiles
    set avatar_scale = case avatar_size
      when 'small' then 12
      when 'large' then 40
      else 28
    end;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_avatar_scale_range'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
    add constraint profiles_avatar_scale_range
    check (avatar_scale between 10 and 100);
  end if;
end
$$;

comment on column public.profiles.avatar_scale is
  'Continuous avatar size from 10 (small) to 100 (maximum profile width).';

alter table public.profile_links
add column if not exists is_sensitive boolean not null default false;

comment on column public.profile_links.is_sensitive is
  'Owner-supplied 18+ warning; known adult hosts are additionally detected by the client.';
