-- ============================================================================
--  فریـا (FARYA) — فایل ۲ از ۵ : موتورِ محاسبه و رویه‌های عملیاتی
-- ----------------------------------------------------------------------------
--  این فایل ترجمهٔ خط‌به‌خطِ src/lib/calc.ts است. خروجیِ SQL و خروجیِ برنامه
--  باید ریال‌به‌ریال یکسان باشد (در 05_verify.sql با آزمونِ تطبیقی بررسی می‌شود).
--
--  چرا plpgsql و نه sql خالص؟
--  در حالتِ sql خالص، PostgreSQL بدنهٔ تابع را درونِ پرس‌وجوی صدا‌زننده «inlined»
--  می‌کند و زمانِ برنامه‌ریزی برای جداولِ بزرگ به‌صورت نمایی بالا می‌رود
--  (در آزمونِ ما: ۱۴ دقیقه در برابرِ ۰٫۳ ثانیه). plpgsql این مشکل را ندارد.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
--  نوعِ مرکبِ خروجیِ محاسبه (هم‌نام و هم‌ترتیب با Computed در types.ts)
-- ---------------------------------------------------------------------------
do $$
begin
  create type public.item_cost as (
    item_id       text,
    code          text,
    name          text,
    category      text,
    unit_label    text,
    material      numeric,   -- بهای موادِ اولیه
    coef_value    numeric,   -- ضریبِ تبدیل / افت و پخت
    after_coef    numeric,   -- بهای مواد × ضریب
    overhead_base numeric,   -- جمعِ سربارهای تخصیصی (پیش از ضریبِ اضافی)
    extra_coef    numeric,   -- ضریبِ اضافیِ سربار
    overhead      numeric,   -- سربارِ نهایی = پایه × (۱ + ضریبِ اضافی)
    container     numeric,   -- هزینهٔ ظرف
    total         numeric,   -- «بهای تمام‌شده»
    unit_cost     numeric,   -- بهای هر واحد (نیمه‌ساخته = total / بازدهی)
    price         numeric,   -- قیمتِ فروش
    old_price     numeric,   -- قیمتِ قبلی
    profit        numeric,   -- سود
    margin        numeric,   -- حاشیهٔ سود
    food_cost     numeric,   -- نسبتِ بهای مواد به قیمت
    suggested     numeric    -- قیمتِ پیشنهادی (گرد به بالا، مبنای ۵۰۰)
  );
exception
  when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
--  ۱) قیمتِ مؤثرِ مواد اولیه
-- ---------------------------------------------------------------------------

/** قیمتِ جاری = آخرین قیمتی که ثبت شده (هم‌رفتار با manualPrice در calc.ts) */
create or replace function public.effective_price(p_ingredient text)
returns numeric language plpgsql stable parallel safe as $$
declare
  v_price numeric;
begin
  select pp.price into v_price
    from public.price_points pp
   where pp.ingredient_id = p_ingredient
   order by pp.seq desc
   limit 1;
  return coalesce(v_price, 0);
end $$;

/** قیمتِ قبلی (برای نمایشِ روند) — هم‌رفتار با previousPrice در calc.ts */
create or replace function public.previous_price(p_ingredient text)
returns numeric language plpgsql stable parallel safe as $$
declare
  v_price numeric;
begin
  select pp.price into v_price
    from public.price_points pp
   where pp.ingredient_id = p_ingredient
   order by pp.seq desc
   offset 1 limit 1;
  return v_price;
end $$;

/** قیمت در یک تاریخِ دلخواه؛ اگر تاریخ پیش از نخستین ثبت باشد، نخستین قیمت
 *  موجود برگردانده می‌شود تا سناریوهای «چه می‌شد اگر» بی‌پاسخ نمانند. */
create or replace function public.price_at(p_ingredient text, p_date date)
returns numeric language plpgsql stable parallel safe as $$
declare
  v_price numeric;
begin
  select pp.price into v_price
    from public.price_points pp
   where pp.ingredient_id = p_ingredient
     and pp.gdate <= p_date
   order by pp.gdate desc, pp.seq desc
   limit 1;

  if v_price is null then
    select pp.price into v_price
      from public.price_points pp
     where pp.ingredient_id = p_ingredient
     order by pp.gdate asc, pp.seq asc
     limit 1;
  end if;

  return coalesce(v_price, 0);
end $$;

/** خلاصهٔ وضعیتِ قیمت برای نمایش در جدولِ مواد اولیه */
create or replace function public.price_state(p_ingredient text)
returns table (
  price      numeric,
  previous   numeric,
  change_pct numeric,
  jdate      text,
  points     bigint
) language plpgsql stable parallel safe as $$
declare
  v_price numeric; v_prev numeric; v_jdate text; v_count bigint;
begin
  select pp.price, pp.jdate into v_price, v_jdate
    from public.price_points pp
   where pp.ingredient_id = p_ingredient
   order by pp.seq desc limit 1;

  v_prev := public.previous_price(p_ingredient);

  select count(*) into v_count
    from public.price_points pp where pp.ingredient_id = p_ingredient;

  return query select
    coalesce(v_price, 0),
    v_prev,
    case when v_prev is not null and v_prev <> 0
         then round(((coalesce(v_price, 0) - v_prev) / v_prev) * 100, 2)
         else null end,
    v_jdate,
    coalesce(v_count, 0);
end $$;

-- ---------------------------------------------------------------------------
--  ۲) بهای هر واحدِ یک آیتم (با پشتیبانی از نیمه‌ساختهٔ بازگشتی و تشخیصِ دور)
-- ---------------------------------------------------------------------------
create or replace function public.unit_cost(
  p_item  text,
  p_date  date   default null,
  p_stack text[] default '{}'
) returns numeric language plpgsql stable as $$
declare
  v_unit numeric;
begin
  if p_item = any (coalesce(p_stack, '{}'::text[])) then
    raise warning 'فریا: دور در دستورِ پخت شناسایی شد (آیتم %)', p_item;
    return 0;
  end if;

  select c.unit_cost into v_unit
    from public.cost_item(p_item, p_date, p_stack) c;

  return coalesce(v_unit, 0);
end $$;

-- ---------------------------------------------------------------------------
--  ۳) محاسبهٔ کاملِ یک آیتم — معادلِ تابعِ unitCost در calc.ts
-- ---------------------------------------------------------------------------
create or replace function public.cost_item(
  p_item  text,
  p_date  date   default null,
  p_stack text[] default '{}'
) returns setof public.item_cost language plpgsql stable as $$
declare
  v_item         public.menu_items;
  v_step         record;
  v_ing          public.ingredients;
  v_price        numeric;
  v_material     numeric := 0;
  v_coef         numeric := 1;
  v_after        numeric := 0;
  v_base         numeric := 0;
  v_extra        numeric := 0;
  v_overhead     numeric := 0;
  v_container    numeric := 0;
  v_total        numeric := 0;
  v_unit         numeric := 0;
  v_yield        numeric := 1;
  v_price_sale   numeric;
  v_old          numeric;
  v_profit       numeric;
  v_margin       numeric;
  v_food         numeric;
  v_suggested    numeric := 0;
  v_target       numeric := 0;
  v_monthly      numeric := 1;
  v_global_extra numeric := 0;
begin
  -- ۱) تشخیصِ دور در زنجیرهٔ نیمه‌ساخته‌ها
  if p_item = any (coalesce(p_stack, '{}'::text[])) then
    raise warning 'فریا: دور در دستورِ پخت شناسایی شد (آیتم %)', p_item;
    return next row (p_item, null, null, null, null,
                     0, 1, 0, 0, 0, 0, 0, 0, 0,
                     null, null, null, null, null, 0)::public.item_cost;
    return;
  end if;

  select * into v_item from public.menu_items where id = p_item;
  if not found then
    return;
  end if;

  -- ۲) تنظیماتِ سراسری
  select coalesce(s.target_margin, 0),
         coalesce(s.monthly_portions, 1),
         coalesce(s.overhead_extra_coef, 0)
    into v_target, v_monthly, v_global_extra
    from public.settings s where s.id = 1;

  -- ۳) بهای موادِ اولیه
  for v_step in
    select rs.ingredient_id, rs.qty
      from public.recipe_steps rs
     where rs.item_id = p_item
     order by rs.position, rs.id
  loop
    select * into v_ing from public.ingredients where id = v_step.ingredient_id;
    if not found then
      continue;
    end if;

    if v_ing.sub_recipe_id is not null
       and exists (select 1 from public.menu_items m where m.id = v_ing.sub_recipe_id) then
      -- ماده‌ای که خودش یک نیمه‌ساخته است → محاسبهٔ بازگشتی
      v_price := public.unit_cost(v_ing.sub_recipe_id, p_date,
                                  coalesce(p_stack, '{}'::text[]) || p_item);
    else
      if p_date is null then
        v_price := public.effective_price(v_ing.id);
      else
        v_price := public.price_at(v_ing.id, p_date);
      end if;
    end if;

    v_material := v_material + (coalesce(v_step.qty, 0) * coalesce(v_price, 0));
  end loop;

  v_coef := coalesce(v_item.coef, 1);
  if v_coef = 0 then v_coef := 1; end if;
  v_after := v_material * v_coef;

  -- ۴) سربارِ پایه
  if v_item.overhead_fixed is not null then
    v_base := coalesce(v_item.overhead_fixed, 0);
  else
    select coalesce(sum(
             case
               when o.kind = 'per-portion' then coalesce(o.amount, 0)
               when o.kind = 'monthly' then
                 coalesce(o.amount, 0) / nullif(coalesce(o.volume, v_monthly, 1), 0)
               when o.kind = 'percent' then
                 v_material * coalesce(o.amount, 0) / 100.0
               else 0
             end), 0)
      into v_base
      from public.item_overheads io
      join public.overheads o on o.id = io.overhead_id
     where io.item_id = p_item
       and o.active;
  end if;

  -- ۵) ضریبِ اضافیِ سربار (مقدارِ اختصاصیِ آیتم بر تنظیمِ سراسری مقدّم است)
  v_extra := case
    when v_item.overhead_extra_coef is not null then coalesce(v_item.overhead_extra_coef, 0)
    else v_global_extra
  end;
  v_overhead := v_base * (1 + v_extra);

  -- ۶) بهای تمام‌شده
  v_container := coalesce(v_item.container_cost, 0);
  v_total     := v_after + v_overhead + v_container;

  v_yield := coalesce(v_item.yield_qty, 1);
  if v_yield = 0 then v_yield := 1; end if;

  v_unit := case
    when v_item.category = 'نیمه‌ساخته' then v_total / v_yield
    else v_total
  end;

  -- ۷) شاخص‌های فروش
  v_price_sale := v_item.price;
  v_old        := v_item.old_price;

  if v_price_sale is not null then
    v_profit := v_price_sale - v_total;
    if v_price_sale <> 0 then
      v_margin := v_profit / v_price_sale;
      v_food   := v_material / v_price_sale;
    end if;
  end if;

  if v_total > 0 and v_target < 1 then
    v_suggested := ceil(v_total / (1 - v_target) / 500) * 500;
  end if;

  return next row (
    v_item.id, v_item.code, v_item.name, v_item.category, v_item.unit_label,
    v_material, v_coef, v_after,
    v_base, v_extra, v_overhead, v_container,
    v_total, v_unit,
    v_price_sale, v_old, v_profit, v_margin, v_food, v_suggested
  )::public.item_cost;
end $$;

-- ---------------------------------------------------------------------------
--  ۴) محاسبهٔ همهٔ آیتم‌ها
-- ---------------------------------------------------------------------------
create or replace function public.cost_all(p_jdate text default null)
returns setof public.item_cost language plpgsql stable as $$
declare
  v_item public.menu_items;
  v_date date;
begin
  if p_jdate is not null and btrim(p_jdate) <> '' then
    v_date := public.jalali_to_gregorian(p_jdate);
  end if;

  for v_item in
    select * from public.menu_items order by sort_order, name
  loop
    return query select * from public.cost_item(v_item.id, v_date, '{}'::text[]);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
--  ۵) خلاصهٔ آماریِ داشبورد — معادلِ summarize() در calc.ts
-- ---------------------------------------------------------------------------
create or replace function public.summarize(p_jdate text default null)
returns jsonb language plpgsql stable as $$
declare
  v_date   date;
  v_result jsonb;
begin
  if p_jdate is not null and btrim(p_jdate) <> '' then
    v_date := public.jalali_to_gregorian(p_jdate);
  end if;

  with costs as (
    select c.*, m.active
      from public.menu_items m
      cross join lateral public.cost_item(m.id, v_date, '{}'::text[]) c
  ),
  menu as (
    select * from costs
     where category <> 'نیمه‌ساخته'
       and active
       and coalesce(price, 0) > 0
  ),
  agg as (
    select
      count(*)                                 as item_count,
      coalesce(avg(total), 0)                  as avg_cost,
      coalesce(avg(coalesce(margin, 0)), 0)    as avg_margin,
      coalesce(avg(coalesce(food_cost, 0)), 0) as avg_food,
      coalesce(avg(coalesce(profit, 0)), 0)    as avg_profit,
      coalesce(sum(after_coef), 0)             as struct_material,
      coalesce(sum(overhead), 0)               as struct_overhead,
      coalesce(sum(container), 0)              as struct_container,
      count(*) filter (
        where margin is not null
          and margin < coalesce((select target_margin from public.settings where id = 1), 0)
      )                                        as below_target,
      count(*) filter (where coalesce(price, 0) > 0) as priced_count
      from menu
  )
  select jsonb_build_object(
    'itemCount',       a.item_count,
    'pricedCount',     a.priced_count,
    'semiCount',       (select count(*) from public.menu_items where category = 'نیمه‌ساخته'),
    'ingredientCount', (select count(*) from public.ingredients),
    'avgCost',         a.avg_cost,
    'avgMargin',       a.avg_margin,
    'avgFood',         a.avg_food,
    'avgProfit',       a.avg_profit,
    'belowTarget',     a.below_target,
    'struct', jsonb_build_object(
        'material',  a.struct_material,
        'overhead',  a.struct_overhead,
        'container', a.struct_container)
  ) into v_result
  from agg a;

  return coalesce(v_result, '{}'::jsonb);
end $$;

-- ---------------------------------------------------------------------------
--  ۶) ریزِ دستورِ پخت (صفحهٔ دستورها)
-- ---------------------------------------------------------------------------
create or replace function public.recipe_detail(p_item text, p_jdate text default null)
returns table (
  step_id       text,
  step_no       integer,
  ingredient_id text,
  ingredient    text,
  unit          text,
  qty           numeric,
  unit_price    numeric,
  line_cost     numeric,
  source        text,        -- 'manual' | 'recipe'
  last_jdate    text
) language plpgsql stable as $$
declare
  v_date date;
  v_step record;
  v_ing  public.ingredients;
  v_price numeric;
  v_src  text;
  v_last text;
begin
  if p_jdate is not null and btrim(p_jdate) <> '' then
    v_date := public.jalali_to_gregorian(p_jdate);
  end if;

  for v_step in
    select rs.id, rs.ingredient_id, rs.qty, rs.position
      from public.recipe_steps rs
     where rs.item_id = p_item
     order by rs.position, rs.id
  loop
    select * into v_ing from public.ingredients where id = v_step.ingredient_id;
    if not found then continue; end if;

    if v_ing.sub_recipe_id is not null
       and exists (select 1 from public.menu_items m where m.id = v_ing.sub_recipe_id) then
      v_price := public.unit_cost(v_ing.sub_recipe_id, v_date, array[p_item]::text[]);
      v_src   := 'recipe';
    else
      if v_date is null then
        v_price := public.effective_price(v_ing.id);
      else
        v_price := public.price_at(v_ing.id, v_date);
      end if;
      v_src := 'manual';
    end if;

    select pp.jdate into v_last
      from public.price_points pp
     where pp.ingredient_id = v_ing.id
     order by pp.seq desc limit 1;

    return query select
      v_step.id::text,
      v_step.position::integer,
      v_ing.id,
      v_ing.name,
      v_ing.unit,
      coalesce(v_step.qty, 0),
      coalesce(v_price, 0),
      coalesce(v_step.qty, 0) * coalesce(v_price, 0),
      v_src,
      v_last;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
--  ۷) وابستگی‌ها (برای حذفِ امن و نمایشِ «کجا استفاده شده»)
-- ---------------------------------------------------------------------------
create or replace function public.ingredient_usage(p_ingredient text)
returns table (item_id text, item_name text, qty numeric, unit text)
language sql stable parallel safe as $$
  select m.id, m.name, rs.qty, i.unit
    from public.recipe_steps rs
    join public.menu_items m  on m.id = rs.item_id
    join public.ingredients i on i.id = rs.ingredient_id
   where rs.ingredient_id = p_ingredient
   order by m.name;
$$;

-- ---------------------------------------------------------------------------
--  ۸) رویه‌های ثبتِ داده
-- ---------------------------------------------------------------------------

/** ثبتِ قیمتِ جدید؛ اگر تاریخ خالی باشد، امروزِ شمسی درج می‌شود */
create or replace function public.add_price(
  p_ingredient text,
  p_price      numeric,
  p_jdate      text default null,
  p_note       text default ''
) returns public.price_points language plpgsql as $$
declare
  v_jdate text;
  v_row   public.price_points;
begin
  if p_price is null or p_price < 0 then
    raise exception 'مبلغِ قیمت باید عددی نامنفی باشد';
  end if;
  if not exists (select 1 from public.ingredients where id = p_ingredient) then
    raise exception 'مادهٔ اولیه با شناسهٔ % وجود ندارد', p_ingredient;
  end if;

  v_jdate := coalesce(nullif(btrim(coalesce(p_jdate, '')), ''), public.today_jalali());

  if not public.is_valid_jalali(v_jdate) then
    raise exception 'تاریخِ شمسی نامعتبر است: %', v_jdate;
  end if;

  insert into public.price_points (ingredient_id, price, jdate, note)
  values (p_ingredient, p_price, v_jdate, coalesce(p_note, ''))
  returning * into v_row;

  return v_row;
end $$;

/** ایجادِ مادهٔ اولیه (با امکانِ ثبتِ قیمتِ اولیه در همان فراخوان) */
create or replace function public.add_ingredient(
  p_name       text,
  p_unit       text    default 'کیلو',
  p_price      numeric default null,
  p_jdate      text    default null,
  p_note       text    default '',
  p_sub_recipe text    default null
) returns public.ingredients language plpgsql as $$
declare
  v_row public.ingredients;
begin
  if p_name is null or btrim(p_name) = '' then
    raise exception 'نامِ مادهٔ اولیه نمی‌تواند خالی باشد';
  end if;

  insert into public.ingredients (name, unit, note, sub_recipe_id)
  values (btrim(p_name), coalesce(p_unit, 'کیلو'), coalesce(p_note, ''), p_sub_recipe)
  returning * into v_row;

  if p_price is not null then
    perform public.add_price(v_row.id, p_price, p_jdate, 'ثبتِ اولیه');
  end if;

  return v_row;
end $$;

/** ایجادِ آیتمِ منو */
create or replace function public.add_menu_item(
  p_name       text,
  p_category   text    default 'غذای اصلی',
  p_code       text    default '',
  p_price      numeric default null,
  p_coef       numeric default 3,
  p_container  numeric default 0,
  p_unit_label text    default 'پرس'
) returns public.menu_items language plpgsql as $$
declare
  v_row public.menu_items;
begin
  if p_name is null or btrim(p_name) = '' then
    raise exception 'نامِ آیتم نمی‌تواند خالی باشد';
  end if;

  insert into public.menu_items (name, category, code, price, coef, container_cost, unit_label)
  values (btrim(p_name), coalesce(p_category, 'غذای اصلی'), coalesce(p_code, ''),
          p_price, coalesce(p_coef, 3), coalesce(p_container, 0), coalesce(p_unit_label, 'پرس'))
  returning * into v_row;

  return v_row;
end $$;

/** ایجادِ سربار */
create or replace function public.add_overhead(
  p_name   text,
  p_kind   text    default 'monthly',
  p_amount numeric default 0,
  p_volume numeric default null,
  p_note   text    default ''
) returns public.overheads language plpgsql as $$
declare
  v_row public.overheads;
begin
  if p_kind not in ('per-portion', 'monthly', 'percent') then
    raise exception 'نوعِ تسهیم باید یکی از per-portion / monthly / percent باشد';
  end if;

  insert into public.overheads (name, kind, amount, volume, note)
  values (p_name, p_kind, coalesce(p_amount, 0), p_volume, coalesce(p_note, ''))
  returning * into v_row;

  return v_row;
end $$;

/** بروزرسانیِ تنظیمات */
create or replace function public.update_settings(p_patch jsonb)
returns public.settings language plpgsql as $$
declare
  v_row public.settings;
begin
  update public.settings s set
    restaurant          = coalesce(p_patch->>'restaurant', s.restaurant),
    restaurant_fa       = coalesce(p_patch->>'restaurantFa', s.restaurant_fa),
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

-- ---------------------------------------------------------------------------
--  ۹) عملیاتِ گروهیِ قیمت‌گذاری
-- ---------------------------------------------------------------------------

/** افزایش/کاهشِ درصدیِ قیمت‌ها */
create or replace function public.bulk_price_change(p_percent numeric default 5)
returns integer language plpgsql as $$
declare
  v_count integer := 0;
  v_row   public.menu_items;
begin
  for v_row in
    select * from public.menu_items
     where active
       and category <> 'نیمه‌ساخته'
       and price is not null
  loop
    update public.menu_items
       set old_price = price,
           price     = round(price * (1 + coalesce(p_percent, 0) / 100.0))
     where id = v_row.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

/** گرد کردنِ همهٔ قیمت‌ها به نزدیک‌ترین مضرب */
create or replace function public.round_all_prices(p_step numeric default 1000)
returns integer language plpgsql as $$
declare
  v_count integer := 0;
  v_new   numeric;
  v_row   public.menu_items;
begin
  if coalesce(p_step, 0) <= 0 then
    raise exception 'گامِ گردکردن باید بزرگ‌تر از صفر باشد';
  end if;

  for v_row in
    select * from public.menu_items
     where active and category <> 'نیمه‌ساخته' and price is not null
  loop
    v_new := round(v_row.price / p_step) * p_step;
    if v_new <> v_row.price then
      update public.menu_items set old_price = price, price = v_new where id = v_row.id;
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end $$;

/** اِعمالِ قیمتِ پیشنهادیِ حاصل از حاشیهٔ هدف */
create or replace function public.apply_suggested_prices()
returns integer language plpgsql as $$
declare
  v_count integer := 0;
  v_cost  public.item_cost;
begin
  for v_cost in select * from public.cost_all(null)
  loop
    if v_cost.category <> 'نیمه‌ساخته'
       and v_cost.suggested > 0
       and coalesce(v_cost.price, 0) <> v_cost.suggested then
      update public.menu_items
         set old_price = price, price = v_cost.suggested
       where id = v_cost.item_id;
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end $$;

-- ---------------------------------------------------------------------------
--  ۱۰) گزارش‌های مالیِ مکمل
-- ---------------------------------------------------------------------------

/** جمعِ سربارهای ماهانهٔ فعال */
create or replace function public.monthly_overhead_total()
returns numeric language sql stable parallel safe as $$
  select coalesce(sum(amount), 0) from public.overheads
   where active and kind = 'monthly';
$$;

/** نقطهٔ سر‌به‌سر: چند پرس در ماه برای پوششِ سربار لازم است؟ */
create or replace function public.break_even_portions()
returns numeric language plpgsql stable as $$
declare
  v_fixed numeric;
  v_avg   numeric;
begin
  v_fixed := public.monthly_overhead_total();

  select coalesce(avg(c.profit), 0) into v_avg
    from public.menu_items m
    cross join lateral public.cost_item(m.id, null, '{}'::text[]) c
   where m.active and m.category <> 'نیمه‌ساخته' and coalesce(c.profit, 0) > 0;

  if coalesce(v_avg, 0) <= 0 then return null; end if;
  return ceil(v_fixed / v_avg);
end $$;

-- ---------------------------------------------------------------------------
--  ۱۱) همگام‌سازیِ اتمیکِ وضعیتِ برنامه  (رابطِ برنامه ↔ پایگاه‌داده)
-- ---------------------------------------------------------------------------

/** بازسازیِ وضعیتِ کاملِ برنامه از جداولِ رابطه‌ای */
create or replace function public.load_state()
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'updatedAt', public.today_jalali(),
    'settings', (
      select jsonb_build_object(          -- نام‌ها باید camelCase باشند (قراردادِ برنامه)
               'restaurant',          s.restaurant,
               'restaurantFa',        s.restaurant_fa,
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

/** ذخیرهٔ اتمیکِ وضعیتِ کاملِ برنامه در جداولِ رابطه‌ای.
 *  کلِ عملیات در یک تراکنش انجام می‌شود: یا همه چیز ثبت می‌شود یا هیچ چیز. */
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

  -- تنظیمات
  if p_state ? 'settings' then
    perform public.update_settings(p_state->'settings');
  end if;

  -- سربارها (ابتدا، چون آیتم‌ها به آن‌ها ارجاع می‌دهند)
  -- ترتیبِ حذف رعایتِ کلیدهای خارجی است
  delete from public.item_overheads;
  delete from public.recipe_steps;
  delete from public.price_points;
  delete from public.ingredients;      -- به menu_items ارجاع دارد → پیش از آن حذف می‌شود
  delete from public.menu_items;
  delete from public.overheads;

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

  -- آیتم‌های منو (پیش از مواد اولیه، چون مواد ممکن است به نیمه‌ساخته‌ها ارجاع دهند)
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

  -- مواد اولیه
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

  -- معادلِ میلادیِ تاریخِ ایجاد
  update public.ingredients
     set created_at = coalesce(public.jalali_to_gregorian(created_jdate), current_date);

  -- تاریخچهٔ قیمت‌ها (همان ترتیبِ آرایهٔ برنامه → ستونِ seq ترتیب را حفظ می‌کند)
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

  -- ردیف‌های دستورِ پخت
  insert into public.recipe_steps (item_id, ingredient_id, qty, position)
  select it->>'id', r->>'ingredientId', coalesce((r->>'qty')::numeric, 0), (t.ord - 1)::integer
    from jsonb_array_elements(coalesce(p_state->'items', '[]'::jsonb)) it,
         jsonb_array_elements(coalesce(it->'recipe', '[]'::jsonb)) with ordinality as t(r, ord)
   where exists (select 1 from public.ingredients g where g.id = r->>'ingredientId')
     and exists (select 1 from public.menu_items m where m.id = coalesce(nullif(it->>'id', ''), ''))
   on conflict (item_id, ingredient_id) do update set qty = excluded.qty;

  -- پیوندِ سربارها
  insert into public.item_overheads (item_id, overhead_id)
  select it->>'id', o
    from jsonb_array_elements(coalesce(p_state->'items', '[]'::jsonb)) it,
         jsonb_array_elements_text(coalesce(it->'overheadIds', '[]'::jsonb)) o
   where exists (select 1 from public.overheads g where g.id = o)
     and exists (select 1 from public.menu_items m where m.id = it->>'id')
   on conflict do nothing;

  -- به‌روزرسانیِ نسخه و تاریخچه
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

commit;
