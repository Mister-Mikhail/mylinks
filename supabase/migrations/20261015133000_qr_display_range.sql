-- Expand first so older browser sessions can still save sizes up to 280 during rollout.
alter table public.profiles drop constraint if exists profiles_qr_size_check;
alter table public.profiles add constraint profiles_qr_size_check check (qr_size between 80 and 280);
