\set ON_ERROR_STOP on

create schema auth;
create role anon;
create role authenticated;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
create table public.profiles (id uuid primary key, handle text not null unique, display_name text not null);
create table public.account_capabilities (account_id uuid primary key, tier_key text not null);
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);

\i supabase/migrations/20261013155000_handle_availability.sql

create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

set role anon;
do $$
begin
  if not public.is_handle_available('anna.name_01') then raise exception 'valid handle should be available'; end if;
  if public.is_handle_available('admin') or public.is_handle_available('a.') then raise exception 'invalid handle was available'; end if;
end;
$$;
reset role;

insert into auth.users values (
  '00000000-0000-4000-8000-000000000001', 'anna@example.com',
  '{"handle":"anna.name_01","display_name":"Анна Мария","handle_strict":true}'::jsonb
);

do $$
begin
  if not exists (select 1 from public.profiles where handle='anna.name_01' and display_name='Анна Мария') then
    raise exception 'registration identity was changed';
  end if;
  if public.is_handle_available('anna.name_01') then raise exception 'taken handle appears available'; end if;
end;
$$;

-- A collision must fail. The trigger must not silently append a suffix.
do $$
begin
  begin
    insert into auth.users values (
      '00000000-0000-4000-8000-000000000002', 'second@example.com',
      '{"handle":"anna.name_01","display_name":"Второй Автор","handle_strict":true}'::jsonb
    );
    raise exception 'expected collision was accepted';
  exception when unique_violation then null;
  end;
  if exists (select 1 from public.profiles where id='00000000-0000-4000-8000-000000000002') then
    raise exception 'collision created a profile';
  end if;
end;
$$;

do $$
begin
  begin
    insert into auth.users values (
      '00000000-0000-4000-8000-000000000003', 'third@example.com',
      '{"handle":"third.name_01","display_name":"Name?123","handle_strict":true}'::jsonb
    );
    raise exception 'invalid name was accepted';
  exception when invalid_parameter_value then null;
  end;
end;
$$;

-- Existing temporary/admin account flows keep the fallback behavior.
insert into auth.users values (
  '00000000-0000-4000-8000-000000000004', 'legacy@example.com',
  '{"handle":"anna.name_01","display_name":"Legacy 123"}'::jsonb
);
do $$
begin
  if not exists (select 1 from public.profiles where id='00000000-0000-4000-8000-000000000004'
    and handle='anna.name_01-00000000') then
    raise exception 'legacy account fallback changed';
  end if;
end;
$$;
