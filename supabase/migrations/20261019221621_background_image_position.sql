-- Preserve the current centered cover for existing profiles.
alter table public.profiles
 add column if not exists background_position_x integer not null default 50 check(background_position_x between 0 and 100),
 add column if not exists background_position_y integer not null default 50 check(background_position_y between 0 and 100),
 add column if not exists background_zoom integer not null default 100 check(background_zoom between 100 and 300);

-- Extend the current staff save implementation, retaining all guards and ACLs.
do $migration$
declare definition text; anchor text;
begin
 definition:=pg_get_functiondef('moderation.save_staff_profile(uuid,jsonb)'::regprocedure);
 if strpos(definition,'background_position_x=')=0 then
  anchor:=$anchor$background_overlay=case when p ? 'background_overlay' then (p->>'background_overlay')::integer else background_overlay end,$anchor$;
  if strpos(definition,anchor)=0 then raise exception 'Staff save background anchor missing';end if;
  definition:=replace(definition,anchor,anchor||$fields$
   background_position_x=case when p ? 'background_position_x' then (p->>'background_position_x')::integer else background_position_x end,
   background_position_y=case when p ? 'background_position_y' then (p->>'background_position_y')::integer else background_position_y end,
   background_zoom=case when p ? 'background_zoom' then (p->>'background_zoom')::integer else background_zoom end,$fields$);
  execute definition;
 end if;
end $migration$;
