create extension if not exists pg_net;
create extension if not exists pg_cron;

create function moderation.enqueue_trash_cleanup() returns bigint
language plpgsql security definer set search_path='' as $$
declare ticket text:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-',''); request_id bigint;
begin
 delete from moderation.trash_job_tickets where expires_at<=now();
 insert into moderation.trash_job_tickets(token_hash,expires_at) values(sha256(convert_to(ticket,'UTF8')),now()+interval '5 minutes');
 select net.http_post(
  url:='https://loykiawbqdkitndqkegk.supabase.co/functions/v1/purge-user-trash',
  headers:=jsonb_build_object('Content-Type','application/json','apikey','sb_publishable_GjGkSeQ5okx58Tphh7Hfrw_6psgCioE'),
  body:=jsonb_build_object('ticket',ticket),timeout_milliseconds:=60000
 ) into request_id;
 return request_id;
end; $$;
revoke all on function moderation.enqueue_trash_cleanup() from public,anon,authenticated;
select cron.schedule('mylinks-purge-user-trash','*/15 * * * *','select moderation.enqueue_trash_cleanup();');
