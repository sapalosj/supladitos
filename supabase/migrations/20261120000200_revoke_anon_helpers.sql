-- 9.2 Tidy-up from the Supabase security advisor: the auth helpers and
-- last_order_number are SECURITY DEFINER and were executable by anon through
-- the default PUBLIC grant. They return nothing without a signed-in staff
-- member, but there's no reason for anon to call them.

revoke execute on function public.auth_branch_id() from public, anon;
revoke execute on function public.auth_staff_role() from public, anon;
revoke execute on function public.auth_is_manager() from public, anon;
revoke execute on function public.last_order_number(date) from public, anon;

grant execute on function public.auth_branch_id() to authenticated;
grant execute on function public.auth_staff_role() to authenticated;
grant execute on function public.auth_is_manager() to authenticated;
grant execute on function public.last_order_number(date) to authenticated;
