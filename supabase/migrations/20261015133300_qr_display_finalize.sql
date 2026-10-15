-- Apply only after the 80–220 px editor has reached production.
update public.profiles set qr_size=220 where qr_size>220;
alter table public.profiles drop constraint if exists profiles_qr_size_check;
alter table public.profiles add constraint profiles_qr_size_check check (qr_size between 80 and 220);
