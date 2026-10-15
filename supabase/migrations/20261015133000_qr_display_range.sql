-- Existing profiles may have selected a size outside the new display range.
update public.profiles set qr_size=least(220,greatest(80,qr_size)) where qr_size not between 80 and 220;
alter table public.profiles drop constraint if exists profiles_qr_size_check;
alter table public.profiles add constraint profiles_qr_size_check check (qr_size between 80 and 220);
