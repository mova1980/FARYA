-- FARYA: repair save_state() for pg_safeupdate / Supabase safe-update enforcement.
-- The previous function used unqualified full-table DELETE/UPDATE statements;
-- the current deployment reports "DELETE requires a WHERE clause" and cannot save.
-- This replacement keeps the intentional full-state-replacement behavior, but
-- supplies explicit WHERE predicates. It does not change the current app_state data.

create or replace function public.save_state(p_state jsonb, p_reason text default '')
returns bigint language plpgsql as $$
declare
  v_rev     bigint;
  v_ing     jsonb;
  v_item    jsonb;
  v_ovh     jsonb;
  v_i       integer := 0;
  v_j       integer := 0;
  v_k       integer := 0;
begin
  if p_state is null or jsonb_typeof(p_state) <> 'object' then
    raise exception 'ساختارِ وضعیت نامعتبر است' using errcode = '22023';
  end if;

  if p_state ? 'settings' then
    perform public.update_settings(p_state->'settings');
  end if;

  -- Full replacement is intentional in this app; each table is cleared in FK order.
  delete from public.item_overheads where true;
  delete from public.recipe_steps where true;
  delete from public.price_points where true;
  delete from public.ingredients where true;
  delete from public.menu_items where true;
  delete from public.overheads where true;

  v_k := 0;
  for v_ovh in select * from jsonb_array_elements(coalesce(p_state->'overheads', '[]'::jsonb))
  loop
    insert into public.overheads (id, name, kind, amount, volume, active, note, sort_order)
    values (coalesce(nullif(v_ovh->>'id', ''), 'ovh-' || replace(gen_random_uuid()::text, '-', '')),
            coalesce(v_ovh->>'name', 'سربار'),
            case when v_ovh->>'kind' in ('per-portion', 'monthly', 'percent')
                 then v_ovh->>'kind' else 'monthly' end,
            coalesce((v_ovh->>'amount')::numeric, 0),
            (v_ovh->>'volume')::numeric,
            coalesce((v_ovh->>'active')::boolean, true),
            coalesce(v_ovh->>'note', ''),
            v_k);
    v_k := v_k + 1;
  end loop;

  v_i := 0;
  for v_item in select * from jsonb_array_elements(coalesce(p_state->'items', '[]'::jsonb))
  loop
    insert into public.menu_items
      (id, code, name, category, image, container_cost, coef, yield_qty, yield_unit,
       overhead_extra_coef, overhead_fixed, unit_label, old_price, price, active,
       note, sort_order)
    values (
      coalesce(nullif(v_item->>'id', ''), 'item-' || replace(gen_random_uuid()::text, '-', '')),
      coalesce(v_item->>'code', ''),
      coalesce(v_item->>'name', 'بدون نام'),
      coalesce(v_item->>'category', 'غذای اصلی'),
      coalesce(v_item->>'image', ''),
      coalesce((v_item->>'containerCost')::numeric, 0),
      case when coalesce((v_item->>'coef')::numeric, 3) > 0
           then coalesce((v_item->>'coef')::numeric, 3) else 3 end,
      (v_item->>'yieldQty')::numeric,
      nullif(v_item->>'yieldUnit', ''),
      (v_item->>'overheadExtraCoef')::numeric,
      (v_item->>'overheadFixed')::numeric,
      coalesce(nullif(v_item->>'unitLabel', ''), 'پرس'),
      (v_item->>'oldPrice')::numeric,
      (v_item->>'price')::numeric,
      coalesce((v_item->>'active')::boolean, true),
      coalesce(v_item->>'note', ''),
      v_i);
    v_i := v_i + 1;
  end loop;

  v_j := 0;
  for v_ing in select * from jsonb_array_elements(coalesce(p_state->'ingredients', '[]'::jsonb))
  loop
    insert into public.ingredients (id, name, unit, note, sub_recipe_id, created_jdate, sort_order)
    values (
      coalesce(nullif(v_ing->>'id', ''), 'ing-' || replace(gen_random_uuid()::text, '-', '')),
      coalesce(v_ing->>'name', 'بدون نام'),
      coalesce(nullif(v_ing->>'unit', ''), 'کیلو'),
      coalesce(v_ing->>'note', ''),
      nullif(v_ing->>'subRecipeId', ''),
      coalesce(nullif(btrim(coalesce(v_ing->>'createdAt', '')), ''), public.today_jalali()),
      v_j);
    v_j := v_j + 1;
  end loop;

  update public.ingredients
     set created_at = coalesce(public.jalali_to_gregorian(created_jdate), current_date)
   where id is not null;

  insert into public.price_points (ingredient_id, price, jdate, note)
  select i.id,
         coalesce((p->>'price')::numeric, 0),
         coalesce(nullif(btrim(coalesce(p->>'date', '')), ''), public.today_jalali()),
         coalesce(p->>'note', '')
    from (
      select ing.val as v, t.p as p, ing.iord as iord, t.ord as ord
        from jsonb_array_elements(coalesce(p_state->'ingredients', '[]'::jsonb))
               with ordinality as ing(val, iord),
             jsonb_array_elements(coalesce(ing.val->'prices', '[]'::jsonb))
               with ordinality as t(p, ord)
    ) s
    join public.ingredients i
      on i.id = coalesce(nullif(s.v->>'id', ''), '')
   order by s.iord, s.ord;

  insert into public.recipe_steps (item_id, ingredient_id, qty, position)
  select it->>'id', r->>'ingredientId', coalesce((r->>'qty')::numeric, 0), (t.ord - 1)::integer
    from jsonb_array_elements(coalesce(p_state->'items', '[]'::jsonb)) it,
         jsonb_array_elements(coalesce(it->'recipe', '[]'::jsonb)) with ordinality as t(r, ord)
   where exists (select 1 from public.ingredients g where g.id = r->>'ingredientId')
     and exists (select 1 from public.menu_items m where m.id = coalesce(nullif(it->>'id', ''), ''))
   on conflict (item_id, ingredient_id) do update set qty = excluded.qty;

  insert into public.item_overheads (item_id, overhead_id)
  select it->>'id', o
    from jsonb_array_elements(coalesce(p_state->'items', '[]'::jsonb)) it,
         jsonb_array_elements_text(coalesce(it->'overheadIds', '[]'::jsonb)) o
   where exists (select 1 from public.overheads g where g.id = o)
     and exists (select 1 from public.menu_items m where m.id = it->>'id')
   on conflict do nothing;

  insert into public.app_state (id, data, rev, updated_at)
  values (1, coalesce(p_state, '{}'::jsonb), 1, now())
  on conflict (id) do update
     set data = excluded.data,
         rev = public.app_state.rev + 1,
         updated_at = now()
  returning rev into v_rev;

  insert into public.app_state_history (rev, data, reason, actor)
  values (v_rev, coalesce(p_state, '{}'::jsonb), coalesce(p_reason, ''),
          coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), 'system'));

  return v_rev;
end $$;
