-- Server-checked two-stage account deletion. The Edge Function removes Storage
-- objects through the Storage API before deleting the Auth user.
create or replace function public.staff_prepare_account_deletion(
  target uuid, expected_handle text, reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actual_handle text;
  objects jsonb;
  object_count integer;
begin
  if auth.uid() is null or coalesce(moderation.my_role(), '') <> 'admin' then
    raise exception 'Admin access required' using errcode='42501';
  end if;
  if target = auth.uid() then raise exception 'Нельзя удалить собственный аккаунт.'; end if;
  if char_length(trim(coalesce(reason,''))) not between 3 and 1000 then
    raise exception 'Укажите причину: 3–1000 символов.';
  end if;

  perform pg_advisory_xact_lock(734029101);
  select p.handle into actual_handle
  from auth.users u join public.profiles p on p.id=u.id
  where u.id=target and u.deleted_at is null
  for update of u, p;
  if not found then raise exception 'Пользователь не найден.'; end if;
  if exists(select 1 from moderation.staff where user_id=target) then
    raise exception 'Перед удалением снимите роль сотрудника.';
  end if;
  if actual_handle is distinct from trim(coalesce(expected_handle,'')) then
    raise exception 'Адрес страницы не совпадает. Обновите карточку.';
  end if;

  select count(*) into object_count from storage.objects
  where owner_id=target::text or owner=target;
  if object_count > 1000 then
    raise exception 'Слишком много файлов для автоматического удаления. Обратитесь к администратору Storage.';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('bucket', bucket_id, 'name', name)), '[]'::jsonb)
    into objects from storage.objects
  where owner_id=target::text or owner=target;

  perform moderation.change(target, 'restrict_profile', trim(reason));
  update public.profiles set is_published=false where id=target;
  insert into moderation.audit(actor_id,target_id,action,reason)
  values(auth.uid(),target,'account_delete_requested',trim(reason));
  return jsonb_build_object('objects',objects,'handle',actual_handle);
end;
$$;

revoke all on function public.staff_prepare_account_deletion(uuid,text,text) from public, anon;
grant execute on function public.staff_prepare_account_deletion(uuid,text,text) to authenticated;

-- Called by the service-role Edge Function only after Auth deletion succeeds.
create or replace function public.staff_record_account_deleted(target uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_actor uuid;
  request_reason text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required' using errcode='42501';
  end if;
  if exists(select 1 from auth.users where id=target) then
    raise exception 'Account still exists';
  end if;
  select actor_id, reason into request_actor, request_reason
  from moderation.audit
  where target_id=target and action='account_delete_requested'
  order by created_at desc, id desc limit 1;
  if not found then raise exception 'Deletion request missing'; end if;
  if not exists(select 1 from moderation.audit where target_id=target and action='account_deleted') then
    insert into moderation.audit(actor_id,target_id,action,reason)
    values(request_actor,target,'account_deleted',request_reason);
  end if;
end;
$$;

revoke all on function public.staff_record_account_deleted(uuid) from public, anon, authenticated;
grant execute on function public.staff_record_account_deleted(uuid) to service_role;
