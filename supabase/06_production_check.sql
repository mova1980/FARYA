-- FARYA: read-only production readiness check
-- This file DOES NOT change tables, policies, users, or data.
-- Run in Supabase Dashboard → SQL Editor for project mgjolkacswgouxhuqipp.

-- 1) Expected: 29 PASS and 3 INFO; there must be no FAIL rows.
select result, count(*) as checks
from public.farya_verify()
group by result
order by result;

-- 2) Data inventory. Current verified counts: 43 menu items, 113 ingredients,
--    115 price points, 328 recipe steps, 9 overheads, 26 item-overhead links,
--    and 1 app-state history row.
select 'menu_items' as table_name, count(*) as rows from public.menu_items
union all select 'ingredients', count(*) from public.ingredients
union all select 'price_points', count(*) from public.price_points
union all select 'recipe_steps', count(*) from public.recipe_steps
union all select 'overheads', count(*) from public.overheads
union all select 'item_overheads', count(*) from public.item_overheads
union all select 'app_state_history', count(*) from public.app_state_history
union all select 'active_auth_users', count(*) from auth.users where deleted_at is null
order by table_name;

-- 3) Public menu feed is read-only and restricted to seven FARYA codes.
--    Expected: anon can execute the public feed, but cannot execute save_state.
--    The feed is currently empty until the seven cost items receive their FARYA-* codes.
select has_function_privilege('anon', 'public.farya_public_menu()', 'EXECUTE') as anon_can_read_menu,
       has_function_privilege('anon', 'public.save_state(jsonb,text)', 'EXECUTE') as anon_can_write_state,
       has_function_privilege('authenticated', 'public.save_state(jsonb,text)', 'EXECUTE') as authenticated_can_write_state;
select code, price from public.farya_public_menu() order by code;

-- 4) Every application table must have RLS enabled and an authenticated-only policy.
--    Review roles in the final column; expected policy role is {authenticated}.
select c.relname as table_name,
       c.relrowsecurity as rls_enabled,
       count(p.policyname) as policy_count,
       string_agg(distinct p.roles::text, ', ' order by p.roles::text) as policy_roles
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policies p
  on p.schemaname = n.nspname and p.tablename = c.relname
where n.nspname = 'public'
  and c.relname in (
    'settings','menu_items','ingredients','price_points','recipe_steps',
    'overheads','item_overheads','app_state','app_state_history','audit_log'
  )
group by c.relname, c.relrowsecurity
order by c.relname;
