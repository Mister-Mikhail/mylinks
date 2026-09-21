revoke execute on function public.handle_new_user() from public, anon, authenticated;

alter policy "Owners read their profile" on public.profiles
using ((select auth.uid()) = id);

alter policy "Owners update their profile" on public.profiles
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

alter policy "Owners insert their profile" on public.profiles
with check ((select auth.uid()) = id);

alter policy "Owners read their links" on public.profile_links
using ((select auth.uid()) = profile_id);

alter policy "Owners add their links" on public.profile_links
with check ((select auth.uid()) = profile_id);

alter policy "Owners update their links" on public.profile_links
using ((select auth.uid()) = profile_id)
with check ((select auth.uid()) = profile_id);

alter policy "Owners delete their links" on public.profile_links
using ((select auth.uid()) = profile_id);

alter policy "Owners read their capabilities" on public.account_capabilities
using ((select auth.uid()) = account_id);
