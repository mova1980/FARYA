-- FARYA | Operational inventory, sauce/preparation costing, sales and daily P&L
-- STAGING ONLY: do not apply to production until reviewed, tested and explicitly approved.
-- Requires the existing FARYA schema, authenticated chef accounts, and save_state() repair.
-- Data prerequisite: the post-reset seven-pizza allowlist and ingredient id 'inv-pizza-box'.
-- Never rerun the one-time reset file 08 to satisfy this prerequisite.
-- Initial inventory quantities are intentionally zero: perform an opening stock count
-- with real lot expiry dates; historical notes are not treated as verified stock.

begin;

-- Allow recipe-only sauce preparations while keeping saleable products restricted to the seven pizzas.
alter table public.menu_items drop constraint if exists farya_current_menu_allowlist;
alter table public.menu_items add constraint farya_current_menu_allowlist check (
  (category='پیتزا' and code in (
    'FARYA-FLORA','FARYA-FORTUNA','FARYA-FAMA','FARYA-FIDES',
    'FARYA-FARYA','FARYA-FERONIA','FARYA-FAENNA'
  ))
  or (id='semi-dough-300g' and code='FARYA-DOUGH-300G' and category='نیمه‌ساخته')
  or (id like 'sauce-%' and code ~ '^FARYA-SAUCE-[A-Z0-9-]+$' and category='سس')
  or (id like 'prep-%' and code ~ '^FARYA-PREP-[A-Z0-9-]+$' and category='نیمه‌ساخته')
);

create table if not exists public.farya_inventory_items (
  id text primary key,
  ingredient_id text unique,
  name text not null,
  item_kind text not null check (item_kind in ('raw','prepared')),
  base_unit text not null,
  reorder_point numeric not null default 0 check (reorder_point >= 0),
  expiry_warning_days integer not null default 7 check (expiry_warning_days between 0 and 365),
  track_expiry boolean not null default true,
  active boolean not null default true,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- No FK from the operational ledger to app_state-owned catalogue rows: save_state()
-- replaces the catalogue atomically and must never cascade-delete stock or sales history.
create table if not exists public.farya_inventory_lots (
  id uuid primary key default gen_random_uuid(),
  item_id text not null references public.farya_inventory_items(id) on delete restrict,
  lot_code text not null default '',
  source_type text not null check (source_type in ('purchase','opening','preparation','adjustment')),
  received_at timestamptz not null default now(),
  expires_on date,
  received_qty numeric not null check (received_qty > 0),
  remaining_qty numeric not null check (remaining_qty >= 0 and remaining_qty <= received_qty),
  note text not null default '',
  created_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.farya_inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  item_id text not null references public.farya_inventory_items(id) on delete restrict,
  lot_id uuid references public.farya_inventory_lots(id) on delete restrict,
  txn_type text not null check (txn_type in (
    'purchase','opening','preparation_in','preparation_out','sale','waste',
    'adjustment_in','adjustment_out'
  )),
  qty_delta numeric not null check (qty_delta <> 0),
  value_delta numeric not null,
  reference_id uuid,
  reference_type text not null default '',
  occurred_at timestamptz not null default now(),
  actor uuid,
  note text not null default ''
);
create index if not exists farya_inv_txn_item_time_idx
  on public.farya_inventory_transactions(item_id, occurred_at desc);
create index if not exists farya_inv_lot_fefo_idx
  on public.farya_inventory_lots(item_id, expires_on, received_at)
  where remaining_qty > 0;

create table if not exists public.farya_item_stock_usage (
  menu_item_id text not null,
  inventory_item_id text not null references public.farya_inventory_items(id) on delete restrict,
  qty_per_sale numeric not null check (qty_per_sale > 0),
  note text not null default '',
  primary key (menu_item_id, inventory_item_id)
);

create table if not exists public.farya_sales (
  id uuid primary key default gen_random_uuid(),
  sold_at timestamptz not null default now(),
  source text not null default 'manual' check (source in ('manual','pos_import')),
  note text not null default '',
  created_by uuid,
  created_at timestamptz not null default now()
);
create table if not exists public.farya_sale_lines (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.farya_sales(id) on delete restrict,
  menu_item_id text not null,
  item_name_snapshot text not null,
  qty numeric not null check (qty > 0),
  unit_price numeric not null check (unit_price >= 0),
  discount_amount numeric not null default 0 check (discount_amount >= 0),
  net_revenue numeric not null check (net_revenue >= 0),
  cogs numeric not null check (cogs >= 0),
  created_at timestamptz not null default now()
);
create index if not exists farya_sales_sold_at_idx on public.farya_sales(sold_at desc);
create index if not exists farya_sale_lines_sale_idx on public.farya_sale_lines(sale_id);

create table if not exists public.farya_operating_expenses (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  category text not null,
  amount numeric not null check (amount >= 0),
  note text not null default '',
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists farya_expenses_time_idx on public.farya_operating_expenses(occurred_at desc);

create table if not exists public.farya_business_targets (
  singleton boolean primary key default true check (singleton),
  monthly_unit_goal numeric not null default 1000 check (monthly_unit_goal >= 0),
  daily_revenue_goal numeric check (daily_revenue_goal is null or daily_revenue_goal >= 0),
  daily_profit_goal numeric check (daily_profit_goal is null or daily_profit_goal >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
insert into public.farya_business_targets(singleton,monthly_unit_goal)
values (true, coalesce((select monthly_portions from public.settings where id=1),1000))
on conflict (singleton) do nothing;

-- All current ingredients become stock cards, but no opening quantities are fabricated.
insert into public.farya_inventory_items(id,ingredient_id,name,item_kind,base_unit,track_expiry,active)
select i.id, i.id, i.name,
       case when i.sub_recipe_id is null then 'raw' else 'prepared' end,
       i.unit, true, true
  from public.ingredients i
on conflict (id) do update set
  ingredient_id=excluded.ingredient_id,
  name=excluded.name,
  item_kind=excluded.item_kind,
  base_unit=excluded.base_unit,
  active=true,
  updated_at=now();

-- Keep stock cards in sync with the app catalogue without cascading physical stock away.
create or replace function public.farya_sync_inventory_item_from_ingredient()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if tg_op<>'DELETE' then
    if exists(select 1 from public.farya_inventory_items ii where ii.id=new.id and ii.base_unit is distinct from new.unit)
       and exists(select 1 from public.farya_inventory_transactions where item_id=new.id) then
      raise exception 'واحدِ پایه پس از شروع گردش انبار قابل تغییر نیست؛ برای تبدیل واحد از عملیات جداگانه استفاده کنید';
    end if;
  end if;
  if tg_op='DELETE' then
    update public.farya_inventory_items set active=false, updated_at=now() where id=old.id;
    return old;
  end if;
  insert into public.farya_inventory_items(id,ingredient_id,name,item_kind,base_unit,active)
  values (new.id,new.id,new.name,case when new.sub_recipe_id is null then 'raw' else 'prepared' end,new.unit,true)
  on conflict (id) do update set
    ingredient_id=excluded.ingredient_id,
    name=excluded.name,
    item_kind=excluded.item_kind,
    base_unit=excluded.base_unit,
    active=true,
    updated_at=now();
  return new;
end $$;
drop trigger if exists farya_inventory_item_sync on public.ingredients;
create trigger farya_inventory_item_sync
after insert or update or delete on public.ingredients
for each row execute function public.farya_sync_inventory_item_from_ingredient();

-- The pizza carton is tracked in stock and deducted once per pizza sold.
insert into public.farya_item_stock_usage(menu_item_id,inventory_item_id,qty_per_sale,note)
select m.id,'inv-pizza-box',1,'یک جعبه برای هر پیتزا؛ مصرف در فروش ثبت می‌شود.'
from public.menu_items m
where m.category='پیتزا'
on conflict (menu_item_id,inventory_item_id) do update
set qty_per_sale=excluded.qty_per_sale,note=excluded.note;

create or replace view public.farya_inventory_balances as
select i.id as item_id, i.ingredient_id, i.name, i.item_kind, i.base_unit,
       i.reorder_point, i.expiry_warning_days, i.track_expiry, i.active,
       coalesce(sum(t.qty_delta),0)::numeric as on_hand_qty,
       coalesce(sum(t.value_delta),0)::numeric as stock_value,
       case when coalesce(sum(t.qty_delta),0)>0
            then greatest(coalesce(sum(t.value_delta),0),0)/sum(t.qty_delta)
            else 0 end::numeric as weighted_avg_unit_cost
  from public.farya_inventory_items i
  left join public.farya_inventory_transactions t on t.item_id=i.id
 group by i.id,i.ingredient_id,i.name,i.item_kind,i.base_unit,
          i.reorder_point,i.expiry_warning_days,i.track_expiry,i.active;

create or replace view public.farya_inventory_alerts as
select 'expired'::text as alert_type, i.id as item_id, i.name, l.id as lot_id,
       l.remaining_qty as qty, i.base_unit, l.expires_on,
       ((now() at time zone 'Asia/Tehran')::date-l.expires_on)::integer as days_from_expiry,
       'محصول منقضی شده؛ از مصرف خارج و ضایعات ثبت شود.'::text as message
  from public.farya_inventory_lots l join public.farya_inventory_items i on i.id=l.item_id
 where i.track_expiry and l.remaining_qty>0 and l.expires_on<(now() at time zone 'Asia/Tehran')::date
union all
select 'expiring'::text, i.id, i.name, l.id, l.remaining_qty, i.base_unit, l.expires_on,
       (l.expires_on-(now() at time zone 'Asia/Tehran')::date)::integer,
       'نزدیک انقضا؛ برداشت بر اساس FEFO.'::text
  from public.farya_inventory_lots l join public.farya_inventory_items i on i.id=l.item_id
 where i.track_expiry and l.remaining_qty>0
   and l.expires_on between (now() at time zone 'Asia/Tehran')::date and (now() at time zone 'Asia/Tehran')::date+i.expiry_warning_days
union all
select 'reorder'::text, b.item_id, b.name, null::uuid, b.on_hand_qty, b.base_unit, null::date,
       null::integer, 'موجودی به نقطهٔ سفارش رسیده یا از آن پایین‌تر است.'::text
  from public.farya_inventory_balances b
 where b.active and b.reorder_point>0 and b.on_hand_qty<=b.reorder_point;

create or replace view public.farya_daily_pnl as
with days as (
  select (s.sold_at at time zone 'Asia/Tehran')::date as business_day from public.farya_sales s
  union select (e.occurred_at at time zone 'Asia/Tehran')::date from public.farya_operating_expenses e
  union select (t.occurred_at at time zone 'Asia/Tehran')::date from public.farya_inventory_transactions t where t.txn_type='waste'
  union select (now() at time zone 'Asia/Tehran')::date
), sales as (
  select (s.sold_at at time zone 'Asia/Tehran')::date as business_day,
         sum(l.net_revenue) as revenue, sum(l.cogs) as cogs, sum(l.qty) as units_sold
    from public.farya_sales s join public.farya_sale_lines l on l.sale_id=s.id
   group by 1
), expenses as (
  select (occurred_at at time zone 'Asia/Tehran')::date as business_day,sum(amount) as amount
    from public.farya_operating_expenses group by 1
), waste as (
  select (occurred_at at time zone 'Asia/Tehran')::date as business_day,
         sum(greatest(-value_delta,0)) as amount
    from public.farya_inventory_transactions where txn_type='waste' group by 1
), fixed as (
  select coalesce(sum(amount),0) as monthly_fixed
    from public.overheads where active and kind='monthly'
)
select d.business_day,
       coalesce(s.units_sold,0)::numeric as units_sold,
       coalesce(s.revenue,0)::numeric as net_revenue,
       coalesce(s.cogs,0)::numeric as cogs,
       coalesce(w.amount,0)::numeric as waste_cost,
       coalesce(e.amount,0)::numeric as operating_expenses,
       f.monthly_fixed,
       extract(day from (date_trunc('month',d.business_day::timestamp)+interval '1 month - 1 day'))::integer as days_in_month,
       case when coalesce(s.revenue,0)>0 then (s.revenue-s.cogs)/s.revenue else null end::numeric as gross_margin,
       (f.monthly_fixed / extract(day from (date_trunc('month',d.business_day::timestamp)+interval '1 month - 1 day')))
          ::numeric as daily_fixed_overhead,
       (coalesce(s.revenue,0)-coalesce(s.cogs,0)-coalesce(w.amount,0)-coalesce(e.amount,0)
        -(f.monthly_fixed / extract(day from (date_trunc('month',d.business_day::timestamp)+interval '1 month - 1 day'))))::numeric as net_profit,
       coalesce(t.monthly_unit_goal,0)::numeric as monthly_unit_goal,
       (coalesce(t.monthly_unit_goal,0)/extract(day from (date_trunc('month',d.business_day::timestamp)+interval '1 month - 1 day')))::numeric as daily_unit_goal,
       t.daily_revenue_goal,
       t.daily_profit_goal,
       case when t.daily_profit_goal>0 then
         ((coalesce(s.revenue,0)-coalesce(s.cogs,0)-coalesce(w.amount,0)-coalesce(e.amount,0)
          -(f.monthly_fixed / extract(day from (date_trunc('month',d.business_day::timestamp)+interval '1 month - 1 day')))) / t.daily_profit_goal)*100
         else null end::numeric as profit_goal_attainment_pct,
       case when t.daily_revenue_goal>0 then (coalesce(s.revenue,0)/t.daily_revenue_goal)*100
         else null end::numeric as revenue_goal_attainment_pct
  from days d
  left join sales s using (business_day)
  left join expenses e using (business_day)
  left join waste w using (business_day)
  cross join fixed f
  left join public.farya_business_targets t on t.singleton=true;

create or replace function public.farya_consume_inventory_item(
  p_item_id text,p_qty numeric,p_txn_type text,p_reference_id uuid,p_reference_type text,p_note text
) returns numeric language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_stock numeric;
  v_value numeric;
  v_avg numeric;
  v_left numeric;
  v_take numeric;
  v_cost numeric;
  v_ingredient_id text;
  v_latest_price numeric;
  v_latest_note text;
  r record;
begin
  if p_qty is null or p_qty<=0 then raise exception 'مقدار مصرف باید بیشتر از صفر باشد'; end if;
  if p_txn_type not in ('preparation_out','sale','waste','adjustment_out') then raise exception 'نوع گردش نامعتبر است'; end if;
  if p_txn_type in ('preparation_out','sale') then
    select ii.ingredient_id,pp.price,pp.note into v_ingredient_id,v_latest_price,v_latest_note
      from public.farya_inventory_items ii
      left join lateral (select price,note from public.price_points where ingredient_id=ii.ingredient_id order by gdate desc,seq desc limit 1) pp on true
     where ii.id=p_item_id;
    if v_ingredient_id is not null and (v_latest_price is null or (v_latest_price<=0 and coalesce(v_latest_note,'') !~* '(رایگان|بدون[[:space:]]*هزینه|free)')) then
      raise exception 'بهای میانگینِ % تأیید نشده است؛ خرید/افتتاحیهٔ دارای ارزش یا یادداشت «رایگان» را ثبت کنید',p_item_id;
    end if;
  end if;
  select coalesce(sum(qty_delta),0),coalesce(sum(value_delta),0)
    into v_stock,v_value from public.farya_inventory_transactions where item_id=p_item_id;
  if v_stock+0.000001<p_qty then
    raise exception 'موجودی کافی نیست: % % موجود است، % % لازم است',round(v_stock,3),
      coalesce((select base_unit from public.farya_inventory_items where id=p_item_id),''),round(p_qty,3),
      coalesce((select base_unit from public.farya_inventory_items where id=p_item_id),'');
  end if;
  v_avg:=case when v_stock>0 then greatest(v_value,0)/v_stock else 0 end;
  v_left:=p_qty;
  v_cost:=0;
  for r in
    select id,remaining_qty,expires_on
      from public.farya_inventory_lots
     where item_id=p_item_id and remaining_qty>0
     order by expires_on nulls last,received_at,id
     for update
  loop
    if v_left<=0.0000001 then exit; end if;
    if r.expires_on is not null and r.expires_on<(now() at time zone 'Asia/Tehran')::date and p_txn_type<>'waste' then
      raise exception 'لاتِ منقضی برای % وجود دارد؛ ابتدا آن را به‌عنوان ضایعات ثبت کنید',p_item_id;
    end if;
    v_take:=least(v_left,r.remaining_qty);
    update public.farya_inventory_lots set remaining_qty=remaining_qty-v_take where id=r.id;
    insert into public.farya_inventory_transactions
      (item_id,lot_id,txn_type,qty_delta,value_delta,reference_id,reference_type,actor,note)
    values (p_item_id,r.id,p_txn_type,-v_take,-v_take*v_avg,p_reference_id,p_reference_type,auth.uid(),coalesce(p_note,''));
    v_left:=v_left-v_take;
    v_cost:=v_cost+v_take*v_avg;
  end loop;
  if v_left>0.0000001 then
    raise exception 'گردش موجودی با لات‌های فیزیکی هم‌خوان نیست؛ شمارش انبار را بررسی کنید';
  end if;
  return v_cost;
end $$;

create or replace function public.farya_refresh_app_state_from_catalog(p_reason text)
returns bigint language plpgsql security definer set search_path=public,pg_temp as $$
declare v_rev bigint;
begin
  update public.app_state
     set data=public.load_state(),rev=rev+1,updated_at=now(),
         updated_by=coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),'system')
   where id=1
   returning rev into v_rev;
  if v_rev is not null then
    insert into public.app_state_history(rev,data,reason,actor)
    select rev,data,coalesce(p_reason,''),coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),'system')
      from public.app_state where id=1;
  end if;
  return v_rev;
end $$;

create or replace function public.farya_receive_stock(
  p_item_id text,p_base_qty numeric,p_total_cost numeric,p_received_at timestamptz,
  p_expires_on date,p_lot_code text default '',p_note text default ''
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_item public.farya_inventory_items%rowtype;
  v_lot uuid;
  v_unit_cost numeric;
  v_balance_qty numeric;
  v_balance_value numeric;
begin
  if auth.uid() is null then raise exception 'ورودِ کاربر لازم است' using errcode='42501'; end if;
  if p_base_qty is null or p_base_qty<=0 or p_total_cost is null or p_total_cost<0 then raise exception 'مقدار و مبلغ خرید نامعتبر است'; end if;
  select * into v_item from public.farya_inventory_items where id=p_item_id and active for update;
  if not found then raise exception 'کالای فعال در انبار پیدا نشد'; end if;
  if v_item.track_expiry and p_expires_on is null then raise exception 'برای این کالا تاریخ انقضا الزامی است'; end if;
  if p_expires_on is not null and p_expires_on<coalesce((p_received_at at time zone 'Asia/Tehran')::date,(now() at time zone 'Asia/Tehran')::date) then raise exception 'تاریخ انقضا از تاریخ دریافت قدیمی‌تر است'; end if;
  v_unit_cost:=p_total_cost/p_base_qty;
  insert into public.farya_inventory_lots(item_id,lot_code,source_type,received_at,expires_on,received_qty,remaining_qty,note,created_by)
  values (p_item_id,coalesce(p_lot_code,''),'purchase',coalesce(p_received_at,now()),p_expires_on,p_base_qty,p_base_qty,coalesce(p_note,''),auth.uid()) returning id into v_lot;
  insert into public.farya_inventory_transactions(item_id,lot_id,txn_type,qty_delta,value_delta,reference_type,actor,note)
  values (p_item_id,v_lot,'purchase',p_base_qty,p_total_cost,'purchase',auth.uid(),coalesce(p_note,''));
  if v_item.ingredient_id is not null then
    select coalesce(sum(qty_delta),0),coalesce(sum(value_delta),0)
      into v_balance_qty,v_balance_value
      from public.farya_inventory_transactions where item_id=p_item_id;
    v_unit_cost:=case when v_balance_qty>0 then greatest(v_balance_value,0)/v_balance_qty else 0 end;
    insert into public.price_points(ingredient_id,price,jdate,note)
    values (v_item.ingredient_id,v_unit_cost,public.today_jalali(),'بهای جاری از میانگین موزون انبار (ارزش موجودی ÷ مقدار موجودی) ثبت شد. '||coalesce(p_note,''))
    on conflict do nothing;
    perform public.farya_refresh_app_state_from_catalog('به‌روزرسانی قیمت بهای مواد از میانگین موزونِ خرید انبار');
  end if;
  return jsonb_build_object('lot_id',v_lot,'unit_cost',v_unit_cost,'base_unit',v_item.base_unit);
end $$;

create or replace function public.farya_opening_stock(
  p_item_id text,p_base_qty numeric,p_total_value numeric,p_expires_on date,p_lot_code text default '',p_note text default ''
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_item public.farya_inventory_items%rowtype;
  v_lot uuid;
  v_unit_cost numeric;
  v_balance_qty numeric;
  v_balance_value numeric;
begin
  if auth.uid() is null then raise exception 'ورودِ کاربر لازم است' using errcode='42501'; end if;
  if p_base_qty is null or p_base_qty<=0 or p_total_value is null or p_total_value<0 then
    raise exception 'مقدار و ارزش موجودی افتتاحیه نامعتبر است';
  end if;
  select * into v_item from public.farya_inventory_items where id=p_item_id and active for update;
  if not found then raise exception 'کالای فعال در انبار پیدا نشد'; end if;
  if exists(select 1 from public.farya_inventory_transactions where item_id=p_item_id and txn_type<>'opening') then
    raise exception 'لاتِ افتتاحیه فقط پیش از نخستین گردش عادی این قلم مجاز است؛ از اصلاح موجودی استفاده کنید';
  end if;
  if v_item.track_expiry and p_expires_on is null then raise exception 'برای این کالا تاریخ انقضا الزامی است'; end if;
  if p_expires_on is not null and p_expires_on<(now() at time zone 'Asia/Tehran')::date then raise exception 'تاریخ انقضای موجودی افتتاحیه نمی‌تواند در گذشته باشد'; end if;
  insert into public.farya_inventory_lots(item_id,lot_code,source_type,received_at,expires_on,received_qty,remaining_qty,note,created_by)
  values(p_item_id,coalesce(nullif(p_lot_code,''),'OPENING'), 'opening',now(),p_expires_on,p_base_qty,p_base_qty,coalesce(p_note,''),auth.uid())
  returning id into v_lot;
  insert into public.farya_inventory_transactions(item_id,lot_id,txn_type,qty_delta,value_delta,reference_type,actor,note)
  values(p_item_id,v_lot,'opening',p_base_qty,p_total_value,'opening',auth.uid(),coalesce(p_note,''));
  select coalesce(sum(qty_delta),0),coalesce(sum(value_delta),0)
    into v_balance_qty,v_balance_value
    from public.farya_inventory_transactions where item_id=p_item_id;
  v_unit_cost:=case when v_balance_qty>0 then greatest(v_balance_value,0)/v_balance_qty else 0 end;
  if v_item.ingredient_id is not null then
    insert into public.price_points(ingredient_id,price,jdate,note)
    values(v_item.ingredient_id,v_unit_cost,public.today_jalali(),'بهای موجودی افتتاحیه از میانگین موزونِ ارزش شمارش‌شده ÷ مقدار شمارش‌شده ثبت شد. '||coalesce(p_note,''))
    on conflict do nothing;
    perform public.farya_refresh_app_state_from_catalog('ثبت موجودی افتتاحیهٔ انبار');
  end if;
  return jsonb_build_object('lot_id',v_lot,'unit_cost',v_unit_cost,'base_unit',v_item.base_unit);
end $$;

create or replace function public.farya_adjust_stock(
  p_item_id text,p_delta_qty numeric,p_total_value numeric,p_expires_on date,p_reason text,p_note text default ''
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_item public.farya_inventory_items%rowtype;
  v_lot uuid;
  v_value numeric;
  v_unit_cost numeric;
  v_balance_qty numeric;
  v_balance_value numeric;
  v_ref uuid:=gen_random_uuid();
begin
  if auth.uid() is null then raise exception 'ورودِ کاربر لازم است' using errcode='42501'; end if;
  if p_delta_qty is null or p_delta_qty=0 or coalesce(trim(p_reason),'')='' then raise exception 'مقدار اصلاح و علت آن الزامی است'; end if;
  select * into v_item from public.farya_inventory_items where id=p_item_id and active for update;
  if not found then raise exception 'کالای فعال در انبار پیدا نشد'; end if;
  if p_delta_qty>0 then
    if p_total_value is null or p_total_value<0 then raise exception 'ارزش کل موجودیِ افزوده‌شده نامعتبر است'; end if;
    if v_item.track_expiry and p_expires_on is null then raise exception 'برای موجودی افزوده‌شده تاریخ انقضا الزامی است'; end if;
    if p_expires_on is not null and p_expires_on<(now() at time zone 'Asia/Tehran')::date then raise exception 'تاریخ انقضا نمی‌تواند در گذشته باشد'; end if;
    insert into public.farya_inventory_lots(item_id,lot_code,source_type,received_at,expires_on,received_qty,remaining_qty,note,created_by)
    values (p_item_id,'COUNT-'||to_char(now(),'YYYYMMDD-HH24MISS'),'adjustment',now(),p_expires_on,p_delta_qty,p_delta_qty,coalesce(p_note,''),auth.uid()) returning id into v_lot;
    insert into public.farya_inventory_transactions(item_id,lot_id,txn_type,qty_delta,value_delta,reference_id,reference_type,actor,note)
    values (p_item_id,v_lot,'adjustment_in',p_delta_qty,p_total_value,v_ref,'stock_count',auth.uid(),p_reason||': '||coalesce(p_note,''));
    v_value:=p_total_value;
  else
    v_value:=public.farya_consume_inventory_item(p_item_id,abs(p_delta_qty),'adjustment_out',v_ref,'stock_count',p_reason||': '||coalesce(p_note,''));
  end if;
  if v_item.ingredient_id is not null then
    select coalesce(sum(qty_delta),0),coalesce(sum(value_delta),0)
      into v_balance_qty,v_balance_value from public.farya_inventory_transactions where item_id=p_item_id;
    v_unit_cost:=case when v_balance_qty>0 then greatest(v_balance_value,0)/v_balance_qty else 0 end;
    insert into public.price_points(ingredient_id,price,jdate,note)
    values(v_item.ingredient_id,v_unit_cost,public.today_jalali(),
      'بهای جاری از میانگین موزون پس از اصلاح شمارش محاسبه شد. '||coalesce(p_reason,'')||' '||coalesce(p_note,''))
    on conflict do nothing;
    perform public.farya_refresh_app_state_from_catalog('به‌روزرسانی بهای میانگین موزون پس از اصلاح انبار');
  end if;
  return jsonb_build_object('reference_id',v_ref,'value_delta',v_value,'weighted_avg_unit_cost',v_unit_cost);
end $$;

create or replace function public.farya_produce_preparation(
  p_preparation_item_id text,p_batches numeric,p_actual_output_qty numeric,
  p_expires_on date,p_lot_code text default '',p_note text default ''
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_prep public.menu_items%rowtype;
  v_output_item_id text;
  v_output_ingredient_id text;
  v_output_lot_id uuid;
  v_output_balance_qty numeric;
  v_output_balance_value numeric;
  v_output_unit_cost numeric;
  v_total_cost numeric:=0;
  v_line_cost numeric;
  v_ref uuid:=gen_random_uuid();
  r record;
begin
  if auth.uid() is null then raise exception 'ورودِ کاربر لازم است' using errcode='42501'; end if;
  if p_batches is null or p_batches<=0 or p_actual_output_qty is null or p_actual_output_qty<=0 then raise exception 'تعداد بچ و بازدهٔ واقعی باید بیشتر از صفر باشند'; end if;
  select * into v_prep from public.menu_items where id=p_preparation_item_id and active and category in ('سس','نیمه‌ساخته') for update;
  if not found then raise exception 'دستورِ سس/نیمه‌ساختهٔ فعال پیدا نشد'; end if;
  select ii.id,i.id into v_output_item_id,v_output_ingredient_id
    from public.farya_inventory_items ii
    join public.ingredients i on i.id=ii.ingredient_id
   where i.sub_recipe_id=v_prep.id and ii.active
   limit 1;
  if v_output_item_id is null then raise exception 'کالای انبارِ متناظر با بازدهٔ دستور پیدا نشد'; end if;
  if (select track_expiry from public.farya_inventory_items where id=v_output_item_id) and p_expires_on is null then raise exception 'برای بچِ تولیدی تاریخ انقضا الزامی است'; end if;
  if p_expires_on is not null and p_expires_on<(now() at time zone 'Asia/Tehran')::date then raise exception 'تاریخ انقضای بچِ تولیدی نمی‌تواند در گذشته باشد'; end if;
  if not exists(select 1 from public.recipe_steps where item_id=v_prep.id) then raise exception 'برای این سس/نیمه‌ساخته هنوز دستور ثبت نشده است'; end if;
  for r in select ingredient_id,qty from public.recipe_steps where item_id=v_prep.id order by position loop
    v_line_cost:=public.farya_consume_inventory_item(r.ingredient_id,r.qty*p_batches,'preparation_out',v_ref,'preparation',coalesce(p_note,''));
    v_total_cost:=v_total_cost+v_line_cost;
  end loop;
  insert into public.farya_inventory_lots(item_id,lot_code,source_type,received_at,expires_on,received_qty,remaining_qty,note,created_by)
  values (v_output_item_id,coalesce(p_lot_code,''),'preparation',now(),p_expires_on,p_actual_output_qty,p_actual_output_qty,coalesce(p_note,''),auth.uid()) returning id into v_output_lot_id;
  insert into public.farya_inventory_transactions(item_id,lot_id,txn_type,qty_delta,value_delta,reference_id,reference_type,actor,note)
  values (v_output_item_id,v_output_lot_id,'preparation_in',p_actual_output_qty,v_total_cost,v_ref,'preparation',auth.uid(),coalesce(p_note,''));
  select coalesce(sum(qty_delta),0),coalesce(sum(value_delta),0)
    into v_output_balance_qty,v_output_balance_value
    from public.farya_inventory_transactions where item_id=v_output_item_id;
  v_output_unit_cost:=case when v_output_balance_qty>0 then greatest(v_output_balance_value,0)/v_output_balance_qty else 0 end;
  insert into public.price_points(ingredient_id,price,jdate,note)
  values (v_output_ingredient_id,v_output_unit_cost,public.today_jalali(),
    case when v_output_unit_cost=0 then 'رایگان/بدون هزینه؛ بهای ثبت‌شدهٔ موادِ دستور صفر بوده است.'
         else 'بهای واحدِ نیمه‌ساخته از ارزش موجودی تولیدشده ÷ مقدار موجودی؛ میانگین موزون.' end)
  on conflict do nothing;
  perform public.farya_refresh_app_state_from_catalog('ثبت بهای میانگین موزونِ سس/نیمه‌ساختهٔ تولیدشده');
  return jsonb_build_object('reference_id',v_ref,'total_cost',v_total_cost,'actual_output_qty',p_actual_output_qty,'unit_cost',v_output_unit_cost);
end $$;

create or replace function public.farya_record_sale(p_sold_at timestamptz,p_lines jsonb,p_note text default '')
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_sale uuid:=gen_random_uuid();
  v_item public.menu_items%rowtype;
  v_line jsonb;
  v_qty numeric;
  v_price numeric;
  v_discount numeric;
  v_revenue numeric;
  v_cogs numeric;
  v_cost numeric;
  r record;
  v_line_count integer:=0;
  v_total_revenue numeric:=0;
  v_total_cogs numeric:=0;
begin
  if auth.uid() is null then raise exception 'ورودِ کاربر لازم است' using errcode='42501'; end if;
  if p_lines is null or jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)=0 then raise exception 'فروش دست‌کم باید یک ردیف داشته باشد'; end if;
  insert into public.farya_sales(id,sold_at,note,created_by) values(v_sale,coalesce(p_sold_at,now()),coalesce(p_note,''),auth.uid());
  for v_line in select value from jsonb_array_elements(p_lines) loop
    select * into v_item from public.menu_items where id=v_line->>'menu_item_id' and category='پیتزا' and active for update;
    if not found then raise exception 'پیتزای فعال در منو پیدا نشد: %',v_line->>'menu_item_id'; end if;
    if not exists(select 1 from public.recipe_steps where item_id=v_item.id) then
      raise exception 'برای % دستور پخت ثبت نشده؛ فروش بدون BOM مجاز نیست',v_item.name;
    end if;
    v_qty:=nullif(v_line->>'qty','')::numeric;
    if v_qty is null or v_qty<=0 then raise exception 'تعداد فروش باید بیشتر از صفر باشد'; end if;
    v_price:=coalesce(nullif(v_line->>'unit_price','')::numeric,v_item.price);
    if v_price is null or v_price<0 then raise exception 'قیمت واقعی فروش برای % ثبت نشده است',v_item.name; end if;
    v_discount:=coalesce(nullif(v_line->>'discount_amount','')::numeric,0);
    if v_discount<0 or v_discount>v_qty*v_price then raise exception 'تخفیفِ ردیف فروش نامعتبر است'; end if;
    v_cogs:=0;
    for r in select ingredient_id,qty from public.recipe_steps where item_id=v_item.id order by position loop
      v_cost:=public.farya_consume_inventory_item(r.ingredient_id,r.qty*v_qty,'sale',v_sale,'sale',coalesce(p_note,''));
      v_cogs:=v_cogs+v_cost;
    end loop;
    for r in select inventory_item_id,qty_per_sale from public.farya_item_stock_usage where menu_item_id=v_item.id loop
      v_cost:=public.farya_consume_inventory_item(r.inventory_item_id,r.qty_per_sale*v_qty,'sale',v_sale,'sale','بسته‌بندیِ فروش');
      v_cogs:=v_cogs+v_cost;
    end loop;
    v_revenue:=v_qty*v_price-v_discount;
    insert into public.farya_sale_lines(sale_id,menu_item_id,item_name_snapshot,qty,unit_price,discount_amount,net_revenue,cogs)
    values(v_sale,v_item.id,v_item.name,v_qty,v_price,v_discount,v_revenue,v_cogs);
    v_line_count:=v_line_count+1;
    v_total_revenue:=v_total_revenue+v_revenue;
    v_total_cogs:=v_total_cogs+v_cogs;
  end loop;
  return jsonb_build_object('sale_id',v_sale,'line_count',v_line_count,'net_revenue',v_total_revenue,'cogs',v_total_cogs);
end $$;

create or replace function public.farya_record_waste(
  p_item_id text,p_qty numeric,p_reason text,p_note text default ''
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_ref uuid:=gen_random_uuid(); v_cost numeric;
begin
  if auth.uid() is null then raise exception 'ورودِ کاربر لازم است' using errcode='42501'; end if;
  if coalesce(trim(p_reason),'')='' then raise exception 'علتِ ضایعات الزامی است'; end if;
  v_cost:=public.farya_consume_inventory_item(p_item_id,p_qty,'waste',v_ref,'waste',p_reason||': '||coalesce(p_note,''));
  return jsonb_build_object('reference_id',v_ref,'waste_cost',v_cost);
end $$;

create or replace function public.farya_add_operating_expense(
  p_occurred_at timestamptz,p_category text,p_amount numeric,p_note text default ''
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'ورودِ کاربر لازم است' using errcode='42501'; end if;
  if coalesce(trim(p_category),'')='' or p_amount is null or p_amount<0 then raise exception 'دسته و مبلغ هزینه را درست وارد کنید'; end if;
  insert into public.farya_operating_expenses(occurred_at,category,amount,note,created_by)
  values(coalesce(p_occurred_at,now()),trim(p_category),p_amount,coalesce(p_note,''),auth.uid()) returning id into v_id;
  return v_id;
end $$;

create or replace function public.farya_update_inventory_item(
  p_item_id text,p_reorder_point numeric,p_expiry_warning_days integer,p_track_expiry boolean
) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null then raise exception 'ورودِ کاربر لازم است' using errcode='42501'; end if;
  if p_reorder_point is null or p_reorder_point<0 or p_expiry_warning_days is null
     or p_expiry_warning_days not between 0 and 365 or p_track_expiry is null then
    raise exception 'نقطهٔ سفارش یا روزهای هشدار نامعتبر است';
  end if;
  update public.farya_inventory_items set reorder_point=p_reorder_point,expiry_warning_days=p_expiry_warning_days,
    track_expiry=p_track_expiry,updated_at=now() where id=p_item_id and active;
  if not found then raise exception 'کالای فعال در انبار پیدا نشد'; end if;
end $$;

create or replace function public.farya_update_business_targets(
  p_monthly_unit_goal numeric,p_daily_revenue_goal numeric,p_daily_profit_goal numeric
) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null then raise exception 'ورودِ کاربر لازم است' using errcode='42501'; end if;
  if p_monthly_unit_goal is null or p_monthly_unit_goal<0 or (p_daily_revenue_goal is not null and p_daily_revenue_goal<0)
     or (p_daily_profit_goal is not null and p_daily_profit_goal<0) then raise exception 'هدف‌ها باید صفر یا بیشتر باشند'; end if;
  insert into public.farya_business_targets(singleton,monthly_unit_goal,daily_revenue_goal,daily_profit_goal,updated_at,updated_by)
  values(true,p_monthly_unit_goal,p_daily_revenue_goal,p_daily_profit_goal,now(),auth.uid())
  on conflict(singleton) do update set monthly_unit_goal=excluded.monthly_unit_goal,
    daily_revenue_goal=excluded.daily_revenue_goal,daily_profit_goal=excluded.daily_profit_goal,
    updated_at=now(),updated_by=auth.uid();
end $$;

create or replace function public.farya_operations_snapshot(p_day date default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_day date:=coalesce(p_day,(now() at time zone 'Asia/Tehran')::date);
  v_result jsonb;
  v_days integer;
  v_monthly_fixed numeric:=0;
  v_monthly_goal numeric:=0;
  v_revenue_goal numeric;
  v_profit_goal numeric;
begin
  if auth.uid() is null then raise exception 'ورودِ کاربر لازم است' using errcode='42501'; end if;
  v_days:=extract(day from (date_trunc('month',v_day::timestamp)+interval '1 month - 1 day'))::integer;
  select coalesce(sum(amount),0) into v_monthly_fixed from public.overheads where active and kind='monthly';
  select monthly_unit_goal,daily_revenue_goal,daily_profit_goal
    into v_monthly_goal,v_revenue_goal,v_profit_goal
    from public.farya_business_targets where singleton=true;
  v_monthly_goal:=coalesce(v_monthly_goal,0);
  select jsonb_build_object(
    'business_day',v_day,
    'items',coalesce((select jsonb_agg(jsonb_build_object(
      'id',b.item_id,'ingredient_id',b.ingredient_id,'name',b.name,'item_kind',b.item_kind,
      'base_unit',b.base_unit,'on_hand_qty',b.on_hand_qty,'stock_value',b.stock_value,
      'weighted_avg_unit_cost',b.weighted_avg_unit_cost,'reorder_point',b.reorder_point,
      'expiry_warning_days',b.expiry_warning_days,'track_expiry',b.track_expiry,'active',b.active
    ) order by b.name) from public.farya_inventory_balances b where b.active or abs(b.on_hand_qty)>0.000001),'[]'::jsonb),
    'lots',coalesce((select jsonb_agg(jsonb_build_object(
      'id',l.id,'item_id',l.item_id,'item_name',i.name,'lot_code',l.lot_code,
      'remaining_qty',l.remaining_qty,'base_unit',i.base_unit,'received_at',l.received_at,'expires_on',l.expires_on
    ) order by l.expires_on nulls last,l.received_at) from public.farya_inventory_lots l
      join public.farya_inventory_items i on i.id=l.item_id where l.remaining_qty>0),'[]'::jsonb),
    'alerts',coalesce((select jsonb_agg(to_jsonb(a) order by case a.alert_type when 'expired' then 0 when 'expiring' then 1 else 2 end,a.expires_on)
      from public.farya_inventory_alerts a),'[]'::jsonb),
    'transactions',coalesce((select jsonb_agg(jsonb_build_object(
      'id',x.id,'item_id',x.item_id,'item_name',i.name,'txn_type',x.txn_type,'qty_delta',x.qty_delta,
      'base_unit',i.base_unit,'value_delta',x.value_delta,'occurred_at',x.occurred_at,'note',x.note)
      order by x.occurred_at desc) from (select * from public.farya_inventory_transactions order by occurred_at desc limit 100) x
      join public.farya_inventory_items i on i.id=x.item_id),'[]'::jsonb),
    'pnl',coalesce((select to_jsonb(p) from public.farya_daily_pnl p where p.business_day=v_day),
      jsonb_build_object('business_day',v_day,'units_sold',0,'net_revenue',0,'cogs',0,'waste_cost',0,
       'operating_expenses',0,'monthly_fixed',v_monthly_fixed,'days_in_month',v_days,
       'gross_margin',null,'daily_fixed_overhead',v_monthly_fixed/greatest(v_days,1),
       'net_profit',-(v_monthly_fixed/greatest(v_days,1)),'monthly_unit_goal',v_monthly_goal,
       'daily_unit_goal',v_monthly_goal/greatest(v_days,1),'daily_revenue_goal',v_revenue_goal,
       'daily_profit_goal',v_profit_goal,
       'profit_goal_attainment_pct',case when v_profit_goal>0 then (-(v_monthly_fixed/greatest(v_days,1))/v_profit_goal)*100 else null end,
       'revenue_goal_attainment_pct',case when v_revenue_goal>0 then 0 else null end)),
    'today_sales',coalesce((select jsonb_agg(jsonb_build_object('sale_id',s.id,'sold_at',s.sold_at,
      'item_name',l.item_name_snapshot,'qty',l.qty,'unit_price',l.unit_price,'discount_amount',l.discount_amount,
      'net_revenue',l.net_revenue,'cogs',l.cogs) order by s.sold_at desc)
      from public.farya_sales s join public.farya_sale_lines l on l.sale_id=s.id
      where (s.sold_at at time zone 'Asia/Tehran')::date=v_day),'[]'::jsonb),
    'today_expenses',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'occurred_at',e.occurred_at,
      'category',e.category,'amount',e.amount,'note',e.note) order by e.occurred_at desc)
      from public.farya_operating_expenses e where (e.occurred_at at time zone 'Asia/Tehran')::date=v_day),'[]'::jsonb),
    'targets',(select to_jsonb(t) from public.farya_business_targets t where t.singleton=true)
  ) into v_result;
  return v_result;
end $$;

-- Authenticated chefs/admins can read operational reports; writes go through validated RPCs.
do $$
declare t text;
begin
  foreach t in array array['farya_inventory_items','farya_inventory_lots','farya_inventory_transactions',
    'farya_item_stock_usage','farya_sales','farya_sale_lines','farya_operating_expenses','farya_business_targets'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('drop policy if exists %I on public.%I',t||'_authenticated_read',t);
    execute format('create policy %I on public.%I for select to authenticated using (true)',t||'_authenticated_read',t);
    execute format('revoke all on public.%I from anon, public',t);
    execute format('grant select on public.%I to authenticated',t);
  end loop;
end $$;

revoke all on function public.farya_consume_inventory_item(text,numeric,text,uuid,text,text) from public,anon,authenticated;
revoke all on function public.farya_refresh_app_state_from_catalog(text) from public,anon,authenticated;
revoke all on function public.farya_receive_stock(text,numeric,numeric,timestamptz,date,text,text) from public,anon;
revoke all on function public.farya_opening_stock(text,numeric,numeric,date,text,text) from public,anon;
revoke all on function public.farya_adjust_stock(text,numeric,numeric,date,text,text) from public,anon;
revoke all on function public.farya_produce_preparation(text,numeric,numeric,date,text,text) from public,anon;
revoke all on function public.farya_record_sale(timestamptz,jsonb,text) from public,anon;
revoke all on function public.farya_record_waste(text,numeric,text,text) from public,anon;
revoke all on function public.farya_add_operating_expense(timestamptz,text,numeric,text) from public,anon;
revoke all on function public.farya_update_inventory_item(text,numeric,integer,boolean) from public,anon;
revoke all on function public.farya_update_business_targets(numeric,numeric,numeric) from public,anon;
revoke all on function public.farya_operations_snapshot(date) from public,anon;
grant execute on function public.farya_receive_stock(text,numeric,numeric,timestamptz,date,text,text) to authenticated;
grant execute on function public.farya_opening_stock(text,numeric,numeric,date,text,text) to authenticated;
grant execute on function public.farya_adjust_stock(text,numeric,numeric,date,text,text) to authenticated;
grant execute on function public.farya_produce_preparation(text,numeric,numeric,date,text,text) to authenticated;
grant execute on function public.farya_record_sale(timestamptz,jsonb,text) to authenticated;
grant execute on function public.farya_record_waste(text,numeric,text,text) to authenticated;
grant execute on function public.farya_add_operating_expense(timestamptz,text,numeric,text) to authenticated;
grant execute on function public.farya_update_inventory_item(text,numeric,integer,boolean) to authenticated;
grant execute on function public.farya_update_business_targets(numeric,numeric,numeric) to authenticated;
grant execute on function public.farya_operations_snapshot(date) to authenticated;

-- Enable realtime for the append-only event sources so the operations screen can refresh immediately.
do $$
declare t text;
begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    foreach t in array array['farya_inventory_transactions','farya_inventory_lots','farya_sales','farya_sale_lines','farya_operating_expenses'] loop
      if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
        execute format('alter publication supabase_realtime add table public.%I',t);
      end if;
    end loop;
  end if;
end $$;

commit;
