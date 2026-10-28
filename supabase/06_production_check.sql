-- FARYA: read-only production verification after costing reset 1405/08/04
-- This file DOES NOT change tables, policies, users, or data.
-- Project: mgjolkacswgouxhuqipp
-- Note: public.farya_verify() still contains the old 43/113/328 expectations;
-- do not use that legacy function until it is updated separately.

-- 1) Dataset baseline. Expected after reset: 8 menu rows (7 pizzas + dough),
--    99 ingredients, 58 price points, 73 recipe steps, 9 overheads,
--    56 item-overhead links, and at least 1 app-state history row (currently 2 after RPC smoke test).
select 'menu_items' as table_name, count(*) as rows from public.menu_items
union all select 'ingredients', count(*) from public.ingredients
union all select 'price_points', count(*) from public.price_points
union all select 'recipe_steps', count(*) from public.recipe_steps
union all select 'overheads', count(*) from public.overheads
union all select 'item_overheads', count(*) from public.item_overheads
union all select 'app_state_history', count(*) from public.app_state_history
union all select 'active_auth_users', count(*) from auth.users where deleted_at is null
order by table_name;

-- 2) Menu allowlist and public feed. Sale prices intentionally remain NULL
--    until confirmed; a NULL price is not a failure of this costing reset.
select id, code, name, category, active, price
from public.menu_items
order by sort_order;
select code, price from public.farya_public_menu() order by code;

-- 3) Monthly overheads. Expected fixed monthly sum = 269,000,000 Toman;
--    fixed portion at 1,000 pizzas/month = 269,000 Toman each; box = 26,000;
--    waste = 3.5% (temporary midpoint of the user's 2–5% estimate).
select id, name, amount, volume, active, note
from public.overheads
order by id;
select sum(amount) as fixed_monthly_total_toman,
       sum(amount / nullif(volume, 0)) as fixed_share_per_pizza_toman
from public.overheads
where id in ('ovh-002','ovh-003','ovh-004','ovh-006','ovh-007','ovh-008');

-- 4) Current BOM and incomplete price coverage. Missing prices are intentional
--    where purchase unit, recipe, yield, or product identity remains unresolved.
select m.code, m.name, count(rs.ingredient_id) as bom_rows,
       count(*) filter (where pp.price is null) as missing_price_rows
from public.menu_items m
join public.recipe_steps rs on rs.item_id = m.id
left join lateral (
  select p.price
  from public.price_points p
  where p.ingredient_id = rs.ingredient_id
  order by p.jdate desc, p.id desc
  limit 1
) pp on true
where m.category = 'پیتزا'
group by m.code, m.name
order by min(m.sort_order);

-- 5) Current cost engine output; totals are partial until missing BOM prices
--    are confirmed. Sale price remains NULL, so no margin is asserted here.
select code, name,
       round(material::numeric, 0) as priced_material_subtotal_toman,
       round(overhead::numeric, 0) as overhead_and_box_and_waste_toman,
       round(total::numeric, 0) as partial_total_toman,
       price as sale_price_toman
from public.cost_all()
where category = 'پیتزا'
order by code;

-- 6) Security checks: RLS must be enabled on application tables; anonymous
--    access may read the public menu feed but must not write application state.
select has_function_privilege('anon', 'public.farya_public_menu()', 'EXECUTE') as anon_can_read_menu,
       has_function_privilege('anon', 'public.save_state(jsonb,text)', 'EXECUTE') as anon_can_write_state,
       has_function_privilege('authenticated', 'public.save_state(jsonb,text)', 'EXECUTE') as authenticated_can_write_state;
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
