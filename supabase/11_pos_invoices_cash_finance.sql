-- FARYA | POS invoices, final-product catalog, payments, cashier close and financial reporting
-- STAGING ONLY. Depends on 10_operations_inventory_sales.sql. Never run on production without separate approval.
-- Sales catalog is separate from the public menu_prices: invoice prices do not alter the public website.
-- Raw inputs remain ingredients; semi-finished items remain preparations; only farya_sale_products are invoiceable.

begin;

do $$
begin
  if to_regclass('public.farya_sales') is null or to_regclass('public.farya_sale_lines') is null
     or to_regclass('public.farya_inventory_items') is null then
    raise exception 'پیش‌نیازها موجود نیستند؛ ابتدا migration شمارهٔ ۱۰ را فقط در staging اجرا کنید';
  end if;
end $$;

-- Persist optional seller identity/contact fields shown on internal customer receipts.
alter table public.settings add column if not exists restaurant_phone text not null default '';
alter table public.settings add column if not exists restaurant_address text not null default '';
alter table public.settings add column if not exists taxpayer_id text not null default '';
alter table public.settings add column if not exists economic_code text not null default '';

create or replace function public.update_settings(p_patch jsonb)
returns public.settings language plpgsql as $$
declare
  v_row public.settings;
begin
  update public.settings s set
    restaurant          = coalesce(p_patch->>'restaurant', s.restaurant),
    restaurant_fa       = coalesce(p_patch->>'restaurantFa', s.restaurant_fa),
    restaurant_phone    = coalesce(p_patch->>'restaurantPhone', s.restaurant_phone),
    restaurant_address  = coalesce(p_patch->>'restaurantAddress', s.restaurant_address),
    taxpayer_id         = coalesce(p_patch->>'taxpayerId', s.taxpayer_id),
    economic_code       = coalesce(p_patch->>'economicCode', s.economic_code),
    chef                = coalesce(p_patch->>'chef', s.chef),
    currency            = coalesce(p_patch->>'currency', s.currency),
    target_margin       = coalesce((p_patch->>'targetMargin')::numeric, s.target_margin),
    monthly_portions    = coalesce((p_patch->>'monthlyPortions')::numeric, s.monthly_portions),
    overhead_extra_coef = coalesce((p_patch->>'overheadExtraCoef')::numeric, s.overhead_extra_coef),
    price_source        = coalesce(p_patch->>'priceSource', s.price_source)
  where s.id = 1
  returning * into v_row;

  return v_row;
end $$;

create or replace function public.load_state()
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'updatedAt', public.today_jalali(),
    'settings', (
      select jsonb_build_object(          -- نام‌ها باید camelCase باشند (قراردادِ برنامه)
               'restaurant',          s.restaurant,
               'restaurantFa',        s.restaurant_fa,
               'restaurantPhone',     s.restaurant_phone,
               'restaurantAddress',   s.restaurant_address,
               'taxpayerId',          s.taxpayer_id,
               'economicCode',        s.economic_code,
               'chef',                s.chef,
               'currency',            s.currency,
               'overheadExtraCoef',   s.overhead_extra_coef,
               'targetMargin',        s.target_margin,
               'monthlyPortions',     s.monthly_portions,
               'priceSource',         s.price_source)
        from public.settings s where s.id = 1),
    'ingredients', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', i.id,
               'name', i.name,
               'unit', i.unit,
               'note', i.note,
               'createdAt', coalesce(i.created_jdate, public.gregorian_to_jalali(i.created_at)),
               'subRecipeId', i.sub_recipe_id,
               'prices', coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'id', pp.id,
                          'price', pp.price,
                          'date', pp.jdate,
                          'note', pp.note)
                        order by pp.seq)
                   from public.price_points pp where pp.ingredient_id = i.id), '[]'::jsonb))
             order by i.sort_order, i.id)
        from public.ingredients i), '[]'::jsonb),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', m.id,
               'code', m.code,
               'name', m.name,
               'category', m.category,
               'image', m.image,
               'containerCost', m.container_cost,
               'coef', m.coef,
               'yieldQty', m.yield_qty,
               'yieldUnit', m.yield_unit,
               'overheadExtraCoef', m.overhead_extra_coef,
               'overheadFixed', m.overhead_fixed,
               'unitLabel', m.unit_label,
               'oldPrice', m.old_price,
               'price', m.price,
               'active', m.active,
               'note', m.note,
               'overheadIds', coalesce((
                 select jsonb_agg(io.overhead_id order by o.sort_order)
                   from public.item_overheads io
                   join public.overheads o on o.id = io.overhead_id
                  where io.item_id = m.id), '[]'::jsonb),
               'recipe', coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'ingredientId', rs.ingredient_id,
                          'qty', rs.qty)
                        order by rs.position, rs.id)
                   from public.recipe_steps rs where rs.item_id = m.id), '[]'::jsonb))
             order by m.sort_order, m.id)
        from public.menu_items m), '[]'::jsonb),
    'overheads', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', o.id,
               'name', o.name,
               'kind', o.kind,
               'amount', o.amount,
               'volume', o.volume,
               'active', o.active,
               'note', o.note)
             order by o.sort_order, o.id)
        from public.overheads o), '[]'::jsonb)
  );
$$;

-- Finished goods are stock cards in their own right (e.g. bottled water and soft drinks).
alter table public.farya_inventory_items drop constraint if exists farya_inventory_items_item_kind_check;
alter table public.farya_inventory_items add constraint farya_inventory_items_item_kind_check
  check (item_kind in ('raw','prepared','finished'));

create table if not exists public.farya_sale_products (
  id text primary key,
  product_name text not null,
  category text not null check (category in ('پیتزا','نوشیدنی','محصول نهایی')),
  sale_type text not null check (sale_type in ('recipe','stock')),
  menu_item_id text,
  inventory_item_id text,
  unit_label text not null default 'عدد',
  unit_price numeric check (unit_price is null or unit_price >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (sale_type='recipe' and menu_item_id is not null and inventory_item_id is null and category='پیتزا')
    or (sale_type='stock' and menu_item_id is null and inventory_item_id is not null and category in ('نوشیدنی','محصول نهایی'))
  )
);
create unique index if not exists farya_sale_products_menu_item_uidx
  on public.farya_sale_products(menu_item_id) where menu_item_id is not null;
create index if not exists farya_sale_products_active_idx on public.farya_sale_products(active,category,product_name);
create unique index if not exists farya_sale_products_inventory_uidx on public.farya_sale_products(inventory_item_id) where inventory_item_id is not null;

-- Pizza rows follow the protected internal catalog, but prices live only in this POS catalog.
insert into public.farya_sale_products(id,product_name,category,sale_type,menu_item_id,unit_label,unit_price,active)
select case when m.id like 'pizza-%' then m.id else 'pizza-'||m.id end,m.name,'پیتزا','recipe',m.id,coalesce(nullif(m.unit_label,''),'عدد'),m.price,m.active
  from public.menu_items m
 where m.category='پیتزا'
on conflict (menu_item_id) where menu_item_id is not null do update set
  product_name=excluded.product_name,category='پیتزا',sale_type='recipe',
  unit_label=excluded.unit_label,unit_price=coalesce(public.farya_sale_products.unit_price,excluded.unit_price),
  active=excluded.active,updated_at=now();

-- Keep display names and availability aligned when save_state() rebuilds menu_items.
create or replace function public.farya_sync_pos_pizza()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if tg_op='DELETE' then
    update public.farya_sale_products set active=false,updated_at=now() where menu_item_id=old.id;
    return old;
  end if;
  if new.category='پیتزا' then
    insert into public.farya_sale_products(id,product_name,category,sale_type,menu_item_id,unit_label,unit_price,active)
    values(case when new.id like 'pizza-%' then new.id else 'pizza-'||new.id end,new.name,'پیتزا','recipe',new.id,coalesce(nullif(new.unit_label,''),'عدد'),new.price,new.active)
    on conflict (menu_item_id) where menu_item_id is not null do update set
      product_name=excluded.product_name,unit_label=excluded.unit_label,
      unit_price=coalesce(public.farya_sale_products.unit_price,excluded.unit_price),active=excluded.active,updated_at=now();
  else
    update public.farya_sale_products set active=false,updated_at=now() where menu_item_id=new.id;
  end if;
  return new;
end $$;
drop trigger if exists farya_pos_pizza_sync on public.menu_items;
create trigger farya_pos_pizza_sync after insert or update or delete on public.menu_items
for each row execute function public.farya_sync_pos_pizza();

alter table public.farya_sales drop constraint if exists farya_sales_source_check;
alter table public.farya_sales add constraint farya_sales_source_check check (source in ('manual','pos_import','pos'));
alter table public.farya_sales add column if not exists invoice_number text;
alter table public.farya_sales add column if not exists status text not null default 'issued';
alter table public.farya_sales add column if not exists subtotal numeric not null default 0;
alter table public.farya_sales add column if not exists tax_rate numeric not null default 10;
alter table public.farya_sales add column if not exists tax_amount numeric not null default 0;
alter table public.farya_sales add column if not exists total_amount numeric not null default 0;
alter table public.farya_sales add column if not exists customer_name text not null default '';
alter table public.farya_sales add column if not exists customer_phone text not null default '';
update public.farya_sales s set subtotal=x.subtotal,total_amount=x.subtotal
  from (select sale_id,coalesce(sum(net_revenue),0) subtotal from public.farya_sale_lines group by sale_id) x
 where s.id=x.sale_id and s.invoice_number is null and s.total_amount=0;
create unique index if not exists farya_sales_invoice_number_uidx on public.farya_sales(invoice_number) where invoice_number is not null;
create index if not exists farya_sales_status_time_idx on public.farya_sales(status,sold_at desc);

alter table public.farya_sale_lines add column if not exists sale_product_id text;
alter table public.farya_sale_lines add column if not exists product_type text not null default 'recipe';
alter table public.farya_sale_lines add column if not exists product_category_snapshot text not null default 'پیتزا';

create table if not exists public.farya_invoice_counters (
  business_day date primary key,
  last_number integer not null default 0 check (last_number>=0)
);

create table if not exists public.farya_cash_sessions (
  id uuid primary key default gen_random_uuid(),
  business_day date not null default (now() at time zone 'Asia/Tehran')::date,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  opening_cash numeric not null default 0 check (opening_cash>=0),
  expected_cash numeric,
  counted_cash numeric,
  cash_difference numeric,
  expected_card numeric,
  counted_card numeric,
  card_difference numeric,
  expected_transfer numeric,
  counted_transfer numeric,
  transfer_difference numeric,
  status text not null default 'open' check (status in ('open','closed')),
  opened_by uuid,
  closed_by uuid,
  open_note text not null default '',
  close_note text not null default ''
);
create unique index if not exists farya_cash_one_open_session_uidx on public.farya_cash_sessions((status)) where status='open';
create index if not exists farya_cash_sessions_day_idx on public.farya_cash_sessions(business_day desc);

create table if not exists public.farya_sale_payments (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.farya_sales(id) on delete restrict,
  cash_session_id uuid references public.farya_cash_sessions(id) on delete restrict,
  method text not null check (method in ('cash','card','transfer')),
  amount numeric not null check (amount>0),
  reference text not null default '',
  actor uuid,
  created_at timestamptz not null default now()
);
create index if not exists farya_sale_payments_sale_idx on public.farya_sale_payments(sale_id,created_at);
create index if not exists farya_sale_payments_session_idx on public.farya_sale_payments(cash_session_id,method);

create table if not exists public.farya_cash_movements (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.farya_cash_sessions(id) on delete restrict,
  direction text not null check (direction in ('in','out')),
  method text not null check (method in ('cash','card','transfer')),
  amount numeric not null check (amount>0),
  movement_type text not null default 'manual' check (movement_type in ('manual','expense','owner_draw','correction')),
  reference_id uuid,
  note text not null default '',
  actor uuid,
  created_at timestamptz not null default now()
);
create index if not exists farya_cash_movements_session_idx on public.farya_cash_movements(session_id,method,created_at);

alter table public.farya_operating_expenses add column if not exists payment_method text not null default 'unassigned';
alter table public.farya_operating_expenses add column if not exists cash_session_id uuid references public.farya_cash_sessions(id) on delete restrict;

-- The daily P&L is based on issued invoices, and excludes voided transactions if later added.
create or replace view public.farya_daily_pnl as
with days as (
  select (s.sold_at at time zone 'Asia/Tehran')::date as business_day from public.farya_sales s where s.status='issued'
  union select (e.occurred_at at time zone 'Asia/Tehran')::date from public.farya_operating_expenses e
  union select (t.occurred_at at time zone 'Asia/Tehran')::date from public.farya_inventory_transactions t where t.txn_type='waste'
  union select (now() at time zone 'Asia/Tehran')::date
), sales as (
  select (s.sold_at at time zone 'Asia/Tehran')::date as business_day,
         sum(l.net_revenue) as revenue, sum(l.cogs) as cogs, sum(l.qty) as units_sold
    from public.farya_sales s join public.farya_sale_lines l on l.sale_id=s.id
   where s.status='issued' group by 1
), expenses as (
  select (occurred_at at time zone 'Asia/Tehran')::date as business_day,sum(amount) as amount
    from public.farya_operating_expenses group by 1
), waste as (
  select (occurred_at at time zone 'Asia/Tehran')::date as business_day,
         sum(greatest(-value_delta,0)) as amount
    from public.farya_inventory_transactions where txn_type='waste' group by 1
), fixed as (
  select coalesce(sum(amount),0) as monthly_fixed from public.overheads where active and kind='monthly'
)
select d.business_day,coalesce(s.units_sold,0)::numeric as units_sold,
       coalesce(s.revenue,0)::numeric as net_revenue,coalesce(s.cogs,0)::numeric as cogs,
       coalesce(w.amount,0)::numeric as waste_cost,coalesce(e.amount,0)::numeric as operating_expenses,
       f.monthly_fixed,
       extract(day from (date_trunc('month',d.business_day::timestamp)+interval '1 month - 1 day'))::integer as days_in_month,
       case when coalesce(s.revenue,0)>0 then (s.revenue-s.cogs)/s.revenue else null end::numeric as gross_margin,
       (f.monthly_fixed / extract(day from (date_trunc('month',d.business_day::timestamp)+interval '1 month - 1 day')))::numeric as daily_fixed_overhead,
       (coalesce(s.revenue,0)-coalesce(s.cogs,0)-coalesce(w.amount,0)-coalesce(e.amount,0)
        -(f.monthly_fixed / extract(day from (date_trunc('month',d.business_day::timestamp)+interval '1 month - 1 day'))))::numeric as net_profit,
       coalesce(t.monthly_unit_goal,0)::numeric as monthly_unit_goal,
       (coalesce(t.monthly_unit_goal,0)/extract(day from (date_trunc('month',d.business_day::timestamp)+interval '1 month - 1 day')))::numeric as daily_unit_goal,
       t.daily_revenue_goal,t.daily_profit_goal,
       case when t.daily_profit_goal>0 then ((coalesce(s.revenue,0)-coalesce(s.cogs,0)-coalesce(w.amount,0)-coalesce(e.amount,0)
        -(f.monthly_fixed / extract(day from (date_trunc('month',d.business_day::timestamp)+interval '1 month - 1 day'))))/t.daily_profit_goal)*100 else null end::numeric as profit_goal_attainment_pct,
       case when t.daily_revenue_goal>0 then (coalesce(s.revenue,0)/t.daily_revenue_goal)*100 else null end::numeric as revenue_goal_attainment_pct
  from days d left join sales s using(business_day) left join expenses e using(business_day)
  left join waste w using(business_day) cross join fixed f left join public.farya_business_targets t on t.singleton=true;

create or replace function public.farya_save_sale_product(
  p_product_id text,p_product_name text,p_category text,p_sale_type text,p_unit_label text,
  p_unit_price numeric,p_inventory_item_id text default null,p_track_expiry boolean default true,p_active boolean default true
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_product public.farya_sale_products%rowtype; v_item_id text;
begin
  if auth.uid() is null then raise exception 'ورود کاربر لازم است' using errcode='42501'; end if;
  if coalesce(trim(p_product_id),'')='' or coalesce(trim(p_product_name),'')='' or coalesce(trim(p_unit_label),'')='' then
    raise exception 'شناسه، نام و واحد کالا الزامی است';
  end if;
  if p_unit_price is not null and p_unit_price<0 then raise exception 'قیمت فروش نمی‌تواند منفی باشد'; end if;
  if p_sale_type='recipe' then
    if p_category<>'پیتزا' or not exists(select 1 from public.farya_sale_products where id=p_product_id and sale_type='recipe') then
      raise exception 'محصولِ رسپی‌محور فقط یکی از پیتزاهای تعریف‌شده است';
    end if;
    update public.farya_sale_products set unit_price=p_unit_price,active=coalesce(p_active,true),updated_at=now() where id=p_product_id and sale_type='recipe';
    return jsonb_build_object('product_id',p_product_id,'inventory_item_id',null);
  end if;
  if p_sale_type<>'stock' or p_category not in ('نوشیدنی','محصول نهایی') or coalesce(trim(p_inventory_item_id),'')='' then
    raise exception 'کالای نهاییِ انباری باید دسته و کارت موجودی معتبر داشته باشد';
  end if;
  v_item_id:=p_inventory_item_id;
  if exists(select 1 from public.farya_inventory_items where id=v_item_id and item_kind<>'finished') then
    raise exception 'شناسهٔ انبار به ماده خام یا نیمه‌ساخته تعلق دارد و قابل استفاده برای محصول نهایی نیست';
  end if;
  if exists(select 1 from public.farya_inventory_transactions where item_id=v_item_id)
     and exists(select 1 from public.farya_inventory_items where id=v_item_id and base_unit is distinct from p_unit_label) then
    raise exception 'واحدِ محصول پس از شروع گردش انبار قابل تغییر نیست';
  end if;
  insert into public.farya_inventory_items(id,ingredient_id,name,item_kind,base_unit,track_expiry,active,note)
  values(v_item_id,null,trim(p_product_name),'finished',trim(p_unit_label),coalesce(p_track_expiry,true),true,'محصول نهایی قابل فروش؛ موجودی با خرید/افتتاحیه ثبت می‌شود.')
  on conflict(id) do update set name=excluded.name,item_kind='finished',base_unit=excluded.base_unit,
    track_expiry=excluded.track_expiry,active=true,updated_at=now();
  insert into public.farya_sale_products(id,product_name,category,sale_type,inventory_item_id,unit_label,unit_price,active)
  values(p_product_id,trim(p_product_name),p_category,'stock',v_item_id,trim(p_unit_label),p_unit_price,coalesce(p_active,true))
  on conflict(id) do update set product_name=excluded.product_name,category=excluded.category,
    inventory_item_id=excluded.inventory_item_id,unit_label=excluded.unit_label,unit_price=excluded.unit_price,
    active=excluded.active,updated_at=now();
  return jsonb_build_object('product_id',p_product_id,'inventory_item_id',v_item_id);
end $$;

create or replace function public.farya_record_invoice(
  p_lines jsonb,p_payments jsonb default '[]'::jsonb,p_customer_name text default '',
  p_customer_phone text default '',p_note text default ''
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_sale uuid:=gen_random_uuid(); v_number text; v_jdate text; v_day date:=(now() at time zone 'Asia/Tehran')::date;
  v_seq integer; v_product public.farya_sale_products%rowtype; v_menu public.menu_items%rowtype;
  v_line jsonb; v_pay jsonb; v_qty numeric; v_price numeric; v_discount numeric; v_revenue numeric;
  v_cogs numeric; v_cost numeric; v_subtotal numeric:=0; v_tax numeric; v_total numeric; v_paid numeric:=0;
  v_session uuid; v_product_name text; v_product_id text; v_line_count integer:=0; r record;
begin
  if auth.uid() is null then raise exception 'ورود کاربر لازم است' using errcode='42501'; end if;
  if p_lines is null or jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)=0 then raise exception 'فاکتور باید دست‌کم یک قلم داشته باشد'; end if;
  if p_payments is not null and jsonb_typeof(p_payments)<>'array' then raise exception 'ساختار پرداخت فاکتور نامعتبر است'; end if;
  v_jdate:=replace(public.today_jalali(),'/','-');
  insert into public.farya_invoice_counters(business_day,last_number) values(v_day,1)
  on conflict(business_day) do update set last_number=public.farya_invoice_counters.last_number+1
  returning last_number into v_seq;
  v_number:='FAR-'||v_jdate||'-'||lpad(v_seq::text,4,'0');
  select id into v_session from public.farya_cash_sessions where status='open' order by opened_at desc limit 1 for update;

  insert into public.farya_sales(id,sold_at,source,note,created_by,invoice_number,status,subtotal,tax_rate,tax_amount,total_amount,customer_name,customer_phone)
  values(v_sale,now(),'pos',coalesce(p_note,''),auth.uid(),v_number,'issued',0,10,0,0,coalesce(trim(p_customer_name),''),coalesce(trim(p_customer_phone),''));

  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_product_id:=coalesce(v_line->>'product_id','');
    select * into v_product from public.farya_sale_products where id=v_product_id and active for update;
    if not found then raise exception 'محصول نهاییِ فعال پیدا نشد: %',v_product_id; end if;
    if v_product.unit_price is null then raise exception 'قیمت فروش «%» هنوز در کاتالوگ تأیید نشده است',v_product.product_name; end if;
    v_qty:=nullif(v_line->>'qty','')::numeric;
    if v_qty is null or v_qty<=0 then raise exception 'تعداد هر قلم باید بیشتر از صفر باشد'; end if;
    v_price:=v_product.unit_price;
    v_discount:=coalesce(nullif(v_line->>'discount_amount','')::numeric,0);
    if v_discount<0 or v_discount>v_qty*v_price then raise exception 'تخفیف ردیف برای «%» نامعتبر است',v_product.product_name; end if;
    v_cogs:=0;
    if v_product.sale_type='recipe' then
      select * into v_menu from public.menu_items where id=v_product.menu_item_id and active and category='پیتزا' for update;
      if not found then raise exception 'پیتزای متناظر با محصول فروش پیدا نشد'; end if;
      if not exists(select 1 from public.recipe_steps where item_id=v_menu.id) then raise exception 'برای % دستور پخت ثبت نشده؛ فاکتور بدون BOM مجاز نیست',v_menu.name; end if;
      v_product_name:=v_menu.name;
      for r in select ingredient_id,qty from public.recipe_steps where item_id=v_menu.id order by position loop
        v_cost:=public.farya_consume_inventory_item(r.ingredient_id,r.qty*v_qty,'sale',v_sale,'invoice',v_number||' '||coalesce(p_note,''));
        v_cogs:=v_cogs+v_cost;
      end loop;
      for r in select inventory_item_id,qty_per_sale from public.farya_item_stock_usage where menu_item_id=v_menu.id loop
        v_cost:=public.farya_consume_inventory_item(r.inventory_item_id,r.qty_per_sale*v_qty,'sale',v_sale,'invoice','بسته‌بندیِ فاکتور '||v_number);
        v_cogs:=v_cogs+v_cost;
      end loop;
    else
      v_product_name:=v_product.product_name;
      if not exists(select 1 from public.farya_inventory_balances b where b.item_id=v_product.inventory_item_id and b.weighted_avg_unit_cost>0) then
        if not exists(select 1 from public.farya_inventory_transactions t where t.item_id=v_product.inventory_item_id
          and t.qty_delta>0 and t.note ~* '(رایگان|free)') then
          raise exception 'بهای موجودی «%» مشخص نیست؛ خرید یا موجودی افتتاحیه با ارزش واقعی ثبت کنید',v_product_name;
        end if;
      end if;
      v_cogs:=public.farya_consume_inventory_item(v_product.inventory_item_id,v_qty,'sale',v_sale,'invoice',v_number||' '||coalesce(p_note,''));
    end if;
    v_revenue:=v_qty*v_price-v_discount;
    insert into public.farya_sale_lines(sale_id,menu_item_id,item_name_snapshot,qty,unit_price,discount_amount,net_revenue,cogs,sale_product_id,product_type,product_category_snapshot)
    values(v_sale,coalesce(v_product.menu_item_id,v_product.id),v_product_name,v_qty,v_price,v_discount,v_revenue,v_cogs,v_product.id,v_product.sale_type,v_product.category);
    v_subtotal:=v_subtotal+v_revenue; v_line_count:=v_line_count+1;
  end loop;

  v_tax:=round(v_subtotal*0.10,0); v_total:=v_subtotal+v_tax;
  if jsonb_array_length(coalesce(p_payments,'[]'::jsonb))>0 then
    if v_session is null then raise exception 'برای ثبت دریافت، ابتدا نوبت صندوق را باز کنید'; end if;
    for v_pay in select value from jsonb_array_elements(coalesce(p_payments,'[]'::jsonb)) loop
      if coalesce(v_pay->>'method','') not in ('cash','card','transfer') then raise exception 'روش دریافت نامعتبر است'; end if;
      if nullif(v_pay->>'amount','') is null or (v_pay->>'amount')::numeric<=0 then raise exception 'مبلغ هر دریافت باید بیشتر از صفر باشد'; end if;
      v_paid:=v_paid+(v_pay->>'amount')::numeric;
    end loop;
    if v_paid>v_total then raise exception 'جمع دریافتی از مبلغ نهایی فاکتور بیشتر است'; end if;
    for v_pay in select value from jsonb_array_elements(coalesce(p_payments,'[]'::jsonb)) loop
      insert into public.farya_sale_payments(sale_id,cash_session_id,method,amount,reference,actor)
      values(v_sale,v_session,v_pay->>'method',(v_pay->>'amount')::numeric,coalesce(v_pay->>'reference',''),auth.uid());
    end loop;
  end if;
  update public.farya_sales set subtotal=v_subtotal,tax_rate=10,tax_amount=v_tax,total_amount=v_total where id=v_sale;
  return jsonb_build_object('id',v_sale,'invoice_number',v_number,'sold_at',now(),'status','issued',
    'customer_name',coalesce(trim(p_customer_name),''),'customer_phone',coalesce(trim(p_customer_phone),''),
    'subtotal',v_subtotal,'tax_rate',10,'tax_amount',v_tax,'total_amount',v_total,'paid_amount',v_paid,
    'balance_due',v_total-v_paid,'payment_status',case when v_paid>=v_total then 'paid' when v_paid>0 then 'partial' else 'due' end,
    'line_count',v_line_count,
    'lines',(select coalesce(jsonb_agg(jsonb_build_object('product_id',sale_product_id,'name',item_name_snapshot,'qty',qty,'unit_price',unit_price,'discount_amount',discount_amount,'net_revenue',net_revenue,'cogs',cogs) order by id),'[]'::jsonb) from public.farya_sale_lines where sale_id=v_sale),
    'payments',(select coalesce(jsonb_agg(jsonb_build_object('method',method,'amount',amount,'reference',reference) order by created_at),'[]'::jsonb) from public.farya_sale_payments where sale_id=v_sale));
end $$;

create or replace function public.farya_record_invoice_payment(
  p_sale_id uuid,p_method text,p_amount numeric,p_reference text default ''
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_total numeric; v_paid numeric; v_session uuid; v_balance numeric;
begin
  if auth.uid() is null then raise exception 'ورود کاربر لازم است' using errcode='42501'; end if;
  if p_method not in ('cash','card','transfer') or p_amount is null or p_amount<=0 then raise exception 'روش یا مبلغ دریافت معتبر نیست'; end if;
  select id into v_session from public.farya_cash_sessions where status='open' order by opened_at desc limit 1 for update;
  if v_session is null then raise exception 'برای ثبت دریافت، ابتدا نوبت صندوق را باز کنید'; end if;
  select total_amount into v_total from public.farya_sales where id=p_sale_id and status='issued' for update;
  if not found then raise exception 'فاکتور معتبر پیدا نشد'; end if;
  select coalesce(sum(amount),0) into v_paid from public.farya_sale_payments where sale_id=p_sale_id;
  v_balance:=v_total-v_paid;
  if p_amount>v_balance then raise exception 'مبلغ دریافت از ماندهٔ فاکتور بیشتر است'; end if;
  insert into public.farya_sale_payments(sale_id,cash_session_id,method,amount,reference,actor)
  values(p_sale_id,v_session,p_method,p_amount,coalesce(p_reference,''),auth.uid());
  return jsonb_build_object('sale_id',p_sale_id,'paid_amount',v_paid+p_amount,'balance_due',v_balance-p_amount,
    'payment_status',case when v_paid+p_amount>=v_total then 'paid' else 'partial' end);
end $$;

create or replace function public.farya_open_cash_session(p_opening_cash numeric,p_note text default '')
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'ورود کاربر لازم است' using errcode='42501'; end if;
  if p_opening_cash is null or p_opening_cash<0 then raise exception 'وجهِ آغاز صندوق نامعتبر است'; end if;
  insert into public.farya_cash_sessions(opening_cash,opened_by,open_note)
  values(p_opening_cash,auth.uid(),coalesce(p_note,'')) returning id into v_id;
  return jsonb_build_object('id',v_id,'opening_cash',p_opening_cash);
exception when unique_violation then raise exception 'یک نوبت صندوق از قبل باز است؛ ابتدا همان نوبت را ببندید';
end $$;

create or replace function public.farya_cash_movement(p_direction text,p_method text,p_amount numeric,p_note text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_session uuid; v_id uuid;
begin
  if auth.uid() is null then raise exception 'ورود کاربر لازم است' using errcode='42501'; end if;
  if p_direction not in ('in','out') or p_method not in ('cash','card','transfer') or p_amount is null or p_amount<=0 or coalesce(trim(p_note),'')='' then
    raise exception 'نوع، روش، مبلغ و شرح گردش مالی الزامی است';
  end if;
  select id into v_session from public.farya_cash_sessions where status='open' order by opened_at desc limit 1 for update;
  if v_session is null then raise exception 'ابتدا نوبت صندوق را باز کنید'; end if;
  insert into public.farya_cash_movements(session_id,direction,method,amount,movement_type,note,actor)
  values(v_session,p_direction,p_method,p_amount,'manual',trim(p_note),auth.uid()) returning id into v_id;
  return v_id;
end $$;

create or replace function public.farya_close_cash_session(
  p_counted_cash numeric,p_counted_card numeric,p_counted_transfer numeric,p_note text default ''
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_session public.farya_cash_sessions%rowtype; v_cash numeric; v_card numeric; v_transfer numeric;
begin
  if auth.uid() is null then raise exception 'ورود کاربر لازم است' using errcode='42501'; end if;
  if p_counted_cash is null or p_counted_cash<0 or p_counted_card is null or p_counted_card<0 or p_counted_transfer is null or p_counted_transfer<0 then
    raise exception 'مبالغ شمارش‌شدهٔ صندوق و کارت‌خوان نامعتبر است';
  end if;
  select * into v_session from public.farya_cash_sessions where status='open' order by opened_at desc limit 1 for update;
  if not found then raise exception 'نوبتِ بازِ صندوق پیدا نشد'; end if;
  select v_session.opening_cash
    +coalesce((select sum(case m.direction when 'in' then m.amount else -m.amount end) from public.farya_cash_movements m where m.session_id=v_session.id and m.method='cash'),0)
    +coalesce((select sum(p.amount) from public.farya_sale_payments p where p.cash_session_id=v_session.id and p.method='cash'),0),
    coalesce((select sum(p.amount) from public.farya_sale_payments p where p.cash_session_id=v_session.id and p.method='card'),0)
    +coalesce((select sum(case m.direction when 'in' then m.amount else -m.amount end) from public.farya_cash_movements m where m.session_id=v_session.id and m.method='card'),0),
    coalesce((select sum(p.amount) from public.farya_sale_payments p where p.cash_session_id=v_session.id and p.method='transfer'),0)
    +coalesce((select sum(case m.direction when 'in' then m.amount else -m.amount end) from public.farya_cash_movements m where m.session_id=v_session.id and m.method='transfer'),0)
    into v_cash,v_card,v_transfer;
  update public.farya_cash_sessions set status='closed',closed_at=now(),closed_by=auth.uid(),
    expected_cash=v_cash,counted_cash=p_counted_cash,cash_difference=p_counted_cash-v_cash,
    expected_card=v_card,counted_card=p_counted_card,card_difference=p_counted_card-v_card,
    expected_transfer=v_transfer,counted_transfer=p_counted_transfer,transfer_difference=p_counted_transfer-v_transfer,
    close_note=coalesce(p_note,'') where id=v_session.id;
  return jsonb_build_object('id',v_session.id,'expected_cash',v_cash,'counted_cash',p_counted_cash,'cash_difference',p_counted_cash-v_cash,
    'expected_card',v_card,'counted_card',p_counted_card,'card_difference',p_counted_card-v_card,
    'expected_transfer',v_transfer,'counted_transfer',p_counted_transfer,'transfer_difference',p_counted_transfer-v_transfer);
end $$;

create or replace function public.farya_record_finance_expense(
  p_category text,p_amount numeric,p_method text,p_note text default ''
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_session uuid; v_expense uuid;
begin
  if auth.uid() is null then raise exception 'ورود کاربر لازم است' using errcode='42501'; end if;
  if coalesce(trim(p_category),'')='' or p_amount is null or p_amount<=0 or p_method not in ('cash','card','transfer') then
    raise exception 'دسته، مبلغ مثبت و روش پرداخت هزینه الزامی است';
  end if;
  select id into v_session from public.farya_cash_sessions where status='open' order by opened_at desc limit 1 for update;
  if v_session is null then raise exception 'برای ثبت هزینه، نوبت صندوق باید باز باشد'; end if;
  insert into public.farya_operating_expenses(occurred_at,category,amount,note,created_by,payment_method,cash_session_id)
  values(now(),trim(p_category),p_amount,coalesce(p_note,''),auth.uid(),p_method,v_session) returning id into v_expense;
  insert into public.farya_cash_movements(session_id,direction,method,amount,movement_type,reference_id,note,actor)
  values(v_session,'out',p_method,p_amount,'expense',v_expense,trim(p_category)||': '||coalesce(p_note,''),auth.uid());
  return v_expense;
end $$;

create or replace function public.farya_finance_snapshot(p_from date default null,p_to date default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_to date:=coalesce(p_to,(now() at time zone 'Asia/Tehran')::date);
  v_from date:=coalesce(p_from,v_to);
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'ورود کاربر لازم است' using errcode='42501'; end if;
  if v_from>v_to then raise exception 'بازهٔ آغاز نمی‌تواند بعد از پایان باشد'; end if;
  if v_to-v_from>730 then raise exception 'بازهٔ گزارش حداکثر دو سال است'; end if;
  select jsonb_build_object(
    'from',v_from,'to',v_to,
    'products',coalesce((select jsonb_agg(jsonb_build_object(
      'id',p.id,'name',case when p.sale_type='recipe' then coalesce(m.name,p.product_name) else p.product_name end,
      'category',p.category,'sale_type',p.sale_type,'unit_label',p.unit_label,'unit_price',p.unit_price,
      'active',p.active,'inventory_item_id',p.inventory_item_id,
      'on_hand_qty',case when p.sale_type='stock' then coalesce(b.on_hand_qty,0) else null end,
      'base_unit',case when p.sale_type='stock' then coalesce(b.base_unit,p.unit_label) else p.unit_label end,
      'stock_value',case when p.sale_type='stock' then coalesce(b.stock_value,0) else null end
    ) order by case p.category when 'پیتزا' then 0 when 'نوشیدنی' then 1 else 2 end,p.product_name)
      from public.farya_sale_products p left join public.menu_items m on m.id=p.menu_item_id
      left join public.farya_inventory_balances b on b.item_id=p.inventory_item_id),'[]'::jsonb),
    'invoices',coalesce((select jsonb_agg(jsonb_build_object(
      'id',s.id,'invoice_number',coalesce(s.invoice_number,'LEGACY-'||left(s.id::text,8)),
      'sold_at',s.sold_at,'status',s.status,'customer_name',s.customer_name,'customer_phone',s.customer_phone,
      'subtotal',s.subtotal,'tax_rate',s.tax_rate,'tax_amount',s.tax_amount,'total_amount',s.total_amount,
      'paid_amount',case when s.invoice_number is null then 0 else coalesce(pp.paid,0) end,
      'balance_due',case when s.invoice_number is null then 0 else greatest(s.total_amount-coalesce(pp.paid,0),0) end,
      'payment_status',case when s.invoice_number is null then 'legacy' when coalesce(pp.paid,0)>=s.total_amount and s.total_amount>0 then 'paid' when coalesce(pp.paid,0)>0 then 'partial' else 'due' end,
      'note',s.note,
      'lines',coalesce((select jsonb_agg(jsonb_build_object('product_id',l.sale_product_id,'name',l.item_name_snapshot,
        'category',l.product_category_snapshot,'qty',l.qty,'unit_price',l.unit_price,'discount_amount',l.discount_amount,
        'net_revenue',l.net_revenue,'cogs',l.cogs) order by l.created_at) from public.farya_sale_lines l where l.sale_id=s.id),'[]'::jsonb),
      'payments',coalesce((select jsonb_agg(jsonb_build_object('method',p.method,'amount',p.amount,'reference',p.reference) order by p.created_at)
        from public.farya_sale_payments p where p.sale_id=s.id),'[]'::jsonb)
    ) order by s.sold_at desc) from public.farya_sales s
      left join lateral (select sum(amount) paid from public.farya_sale_payments where sale_id=s.id) pp on true
     where (s.sold_at at time zone 'Asia/Tehran')::date between v_from and v_to),'[]'::jsonb),
    'daily',coalesce((select jsonb_agg(jsonb_build_object(
      'day',d.day::date,'revenue',coalesce(p.net_revenue,0),'tax',coalesce(tx.tax,0),
      'gross',coalesce(p.net_revenue,0)+coalesce(tx.tax,0),'cogs',coalesce(p.cogs,0),
      'expenses',coalesce(p.operating_expenses,0),'waste',coalesce(p.waste_cost,0),
      'net_profit',coalesce(p.net_profit,-(coalesce((select sum(amount) from public.overheads where active and kind='monthly'),0)
        /extract(day from (date_trunc('month',d.day::date::timestamp)+interval '1 month - 1 day')))),
      'invoices',coalesce(tx.invoice_count,0),'cash_collected',coalesce(pay.cash,0),
      'card_collected',coalesce(pay.card,0),'transfer_collected',coalesce(pay.transfer,0)
    ) order by d.day) from generate_series(v_from::timestamp,v_to::timestamp,interval '1 day') d(day)
      left join public.farya_daily_pnl p on p.business_day=d.day::date
      left join lateral (select sum(tax_amount) tax,count(*) invoice_count from public.farya_sales s
        where s.status='issued' and (s.sold_at at time zone 'Asia/Tehran')::date=d.day::date) tx on true
      left join lateral (select sum(amount) filter(where method='cash') cash,sum(amount) filter(where method='card') card,
        sum(amount) filter(where method='transfer') transfer from public.farya_sale_payments x
        join public.farya_sales s on s.id=x.sale_id where s.status='issued' and (s.sold_at at time zone 'Asia/Tehran')::date=d.day::date) pay on true),'[]'::jsonb),
    'summary',(select jsonb_build_object(
      'invoice_count',count(*),'subtotal',coalesce(sum(s.subtotal),0),'tax',coalesce(sum(s.tax_amount),0),
      'gross_total',coalesce(sum(s.total_amount),0),
      'paid',coalesce(sum(coalesce(pp.paid,0)),0),
      'receivable',coalesce(sum(case when s.invoice_number is null then 0 else greatest(s.total_amount-coalesce(pp.paid,0),0) end),0),
      'cogs',coalesce((select sum(l.cogs) from public.farya_sales sx join public.farya_sale_lines l on l.sale_id=sx.id
        where sx.status='issued' and (sx.sold_at at time zone 'Asia/Tehran')::date between v_from and v_to),0),
      'expenses',coalesce((select sum(amount) from public.farya_operating_expenses where (occurred_at at time zone 'Asia/Tehran')::date between v_from and v_to),0),
      'waste',coalesce((select sum(greatest(-value_delta,0)) from public.farya_inventory_transactions where txn_type='waste'
        and (occurred_at at time zone 'Asia/Tehran')::date between v_from and v_to),0),
      'net_profit',coalesce((select sum(coalesce(p.net_profit,-(coalesce((select sum(amount) from public.overheads where active and kind='monthly'),0)
        /extract(day from (date_trunc('month',d.day::date::timestamp)+interval '1 month - 1 day')))))
      from generate_series(v_from::timestamp,v_to::timestamp,interval '1 day') d(day)
      left join public.farya_daily_pnl p on p.business_day=d.day::date),0)
    ) from public.farya_sales s left join lateral (select sum(amount) paid from public.farya_sale_payments where sale_id=s.id) pp on true
      where s.status='issued' and (s.sold_at at time zone 'Asia/Tehran')::date between v_from and v_to),
    'cash_session',(select jsonb_build_object('id',cs.id,'business_day',cs.business_day,'opened_at',cs.opened_at,'opening_cash',cs.opening_cash,
      'open_note',cs.open_note,
      'cash_collected',coalesce((select sum(amount) from public.farya_sale_payments where cash_session_id=cs.id and method='cash'),0),
      'card_collected',coalesce((select sum(amount) from public.farya_sale_payments where cash_session_id=cs.id and method='card'),0),
      'transfer_collected',coalesce((select sum(amount) from public.farya_sale_payments where cash_session_id=cs.id and method='transfer'),0),
      'cash_in',coalesce((select sum(amount) from public.farya_cash_movements where session_id=cs.id and method='cash' and direction='in'),0),
      'cash_out',coalesce((select sum(amount) from public.farya_cash_movements where session_id=cs.id and method='cash' and direction='out'),0),
      'expected_cash',cs.opening_cash+coalesce((select sum(amount) from public.farya_sale_payments where cash_session_id=cs.id and method='cash'),0)
        +coalesce((select sum(case direction when 'in' then amount else -amount end) from public.farya_cash_movements where session_id=cs.id and method='cash'),0))
      from public.farya_cash_sessions cs where cs.status='open' order by cs.opened_at desc limit 1),
    'recent_closures',coalesce((select jsonb_agg(jsonb_build_object('id',cs.id,'business_day',cs.business_day,'opened_at',cs.opened_at,
      'closed_at',cs.closed_at,'opening_cash',cs.opening_cash,'expected_cash',cs.expected_cash,'counted_cash',cs.counted_cash,
      'cash_difference',cs.cash_difference,'expected_card',cs.expected_card,'counted_card',cs.counted_card,'card_difference',cs.card_difference,
      'expected_transfer',cs.expected_transfer,'counted_transfer',cs.counted_transfer,'transfer_difference',cs.transfer_difference,'close_note',cs.close_note)
      order by cs.closed_at desc) from (select * from public.farya_cash_sessions where status='closed' order by closed_at desc limit 30) cs),'[]'::jsonb)
  ) into v_result;
  return v_result;
end $$;

-- Authenticated reads; every write remains behind a validated, security-definer RPC.
do $$
declare t text;
begin
  foreach t in array array['farya_sale_products','farya_invoice_counters','farya_cash_sessions','farya_sale_payments','farya_cash_movements'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('drop policy if exists %I on public.%I',t||'_authenticated_read',t);
    execute format('create policy %I on public.%I for select to authenticated using (true)',t||'_authenticated_read',t);
    execute format('revoke all on public.%I from anon, public',t);
    execute format('grant select on public.%I to authenticated',t);
  end loop;
  alter table public.farya_operating_expenses enable row level security;
  alter table public.farya_sales enable row level security;
  alter table public.farya_sale_lines enable row level security;
end $$;

revoke all on function public.farya_save_sale_product(text,text,text,text,text,numeric,text,boolean,boolean) from public,anon;
revoke all on function public.farya_record_invoice(jsonb,jsonb,text,text,text) from public,anon;
revoke all on function public.farya_record_invoice_payment(uuid,text,numeric,text) from public,anon;
revoke all on function public.farya_open_cash_session(numeric,text) from public,anon;
revoke all on function public.farya_cash_movement(text,text,numeric,text) from public,anon;
revoke all on function public.farya_close_cash_session(numeric,numeric,numeric,text) from public,anon;
revoke all on function public.farya_record_finance_expense(text,numeric,text,text) from public,anon;
revoke all on function public.farya_finance_snapshot(date,date) from public,anon;
revoke all on function public.farya_record_sale(timestamptz,jsonb,text) from authenticated;
grant execute on function public.farya_save_sale_product(text,text,text,text,text,numeric,text,boolean,boolean) to authenticated;
grant execute on function public.farya_record_invoice(jsonb,jsonb,text,text,text) to authenticated;
grant execute on function public.farya_record_invoice_payment(uuid,text,numeric,text) to authenticated;
grant execute on function public.farya_open_cash_session(numeric,text) to authenticated;
grant execute on function public.farya_cash_movement(text,text,numeric,text) to authenticated;
grant execute on function public.farya_close_cash_session(numeric,numeric,numeric,text) to authenticated;
grant execute on function public.farya_record_finance_expense(text,numeric,text,text) to authenticated;
grant execute on function public.farya_finance_snapshot(date,date) to authenticated;

-- Realtime for finance dashboards and cash-close feedback.
do $$
declare t text;
begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    foreach t in array array['farya_sales','farya_sale_lines','farya_sale_products','farya_sale_payments',
      'farya_cash_sessions','farya_cash_movements','farya_operating_expenses'] loop
      if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
        execute format('alter publication supabase_realtime add table public.%I',t);
      end if;
    end loop;
  end if;
end $$;

commit;
