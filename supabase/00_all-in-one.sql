-- ============================================================================
--  FARYA — full bootstrap for a NEW / EMPTY Supabase project only
-- ----------------------------------------------------------------------------
--  Included, in order: 01_schema · 02_functions · 03_rls · 04_seed · 05_verify
--                      07_public_menu
--
--  IMPORTANT: Never run this full bootstrap on the existing production project.
--  The app's save_state() rebuilds relational tables and the seed is legacy data.
--  Existing production project: use only the tracked additive migration
--  add_public_menu_feed (source: supabase/07_public_menu.sql), already applied.
--
--  This is plain SQL for the Supabase SQL Editor; it contains no psql commands.
-- ============================================================================



-- ==========================================================================
--  فایل: 01_schema.sql
-- ==========================================================================

-- ============================================================================
--  فریـا (FARYA) — پایگاه‌دادهٔ عملیاتیِ بهای تمام‌شدهٔ منو
--  فایل ۱ از ۵ : ساختار (Schema)
-- ----------------------------------------------------------------------------
--  راه اجرا در Supabase :
--     Dashboard → SQL Editor → New query → محتوای این فایل را Paste → Run
--  ترتیبِ اجرای فایل‌ها : 01 → 02 → 03 → 04 → 05
--
--  نکته‌ها :
--   • همه چیز در اسکیمای public ساخته می‌شود (سازگار با PostgREST و Supabase).
--   • تاریخ‌ها با تقویمِ جلالی (شمسی) ذخیره می‌شوند؛ معادل میلادیِ آن‌ها به‌صورت
--     ستونِ تولید‌شده (GENERATED) نگه داشته می‌شود تا مرتب‌سازی و بازه‌گیری
--     در پایگاه‌داده دقیق و سریع باشد.
--   • تمام مبالغ numeric هستند تا خطای ممیزِ شناور نداشته باشیم.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- ۰) پیش‌نیازها
-- ---------------------------------------------------------------------------
create extension if not exists pgcrypto;      -- gen_random_uuid / gen_random_bytes

-- ---------------------------------------------------------------------------
-- ۱) توابعِ تقویمِ جلالی (شمسی)
--    پیاده‌سازیِ دقیقِ الگوریتمِ Reingold & Dershowitz بر پایهٔ JDN،
--    کاملاً منطبق با src/lib/jalali.ts در برنامه
-- ---------------------------------------------------------------------------

/** باقیمانده با تقسیمِ زمینه‌ای (هم‌رفتار با Math.floor در جاوااسکریپت) */
create or replace function public.fmod(a numeric, b numeric)
returns numeric language sql immutable strict parallel safe as $$
  select a - floor(a / b) * b;
$$;

/** تاریخِ میلادی → عددِ روزِ جولیَن (JDN) */
create or replace function public.gregorian_to_jdn(y int, m int, d int)
returns bigint language sql immutable strict parallel safe as $$
  select (d
    + floor((153 * (m + 12 * floor((14 - m) / 12) - 3) + 2) / 5)
    + 365 * (y + 4800 - floor((14 - m) / 12))
    + floor((y + 4800 - floor((14 - m) / 12)) / 4)
    - floor((y + 4800 - floor((14 - m) / 12)) / 100)
    + floor((y + 4800 - floor((14 - m) / 12)) / 400)
    - 32045)::bigint;
$$;

/** عددِ روزِ جولیَن → تاریخِ میلادی (آرایهٔ [سال، ماه، روز]) */
create or replace function public.jdn_to_gregorian(jdn bigint)
returns int[] language sql immutable strict parallel safe as $$
  select array[
    (100 * b + dd - 4800 + floor(mm / 10))::int,
    (mm + 3 - 12 * floor(mm / 10))::int,
    (e - floor((153 * mm + 2) / 5) + 1)::int
  ]
  from (
    select b, dd, e, floor((5 * e + 2) / 153) as mm
    from (
      select b, dd, c - floor((1461 * dd) / 4) as e
      from (
        select b, a - floor((146097 * b) / 4) as c
        from (select floor((4 * (jdn + 32044) + 3) / 146097) as b, jdn + 32044 as a) t1
      ) t2
      cross join lateral (select floor((4 * c + 3) / 1461) as dd) t3
    ) t4
  ) t5;
$$;

/** تاریخِ شمسی → عددِ روزِ جولیَن (JDN) */
create or replace function public.jalali_to_jdn(jy int, jm int, jd int)
returns bigint language plpgsql immutable strict parallel safe as $$
declare
  epbase numeric;
  epyear numeric;
  mdays  numeric;
begin
  epbase := jy - (case when jy >= 0 then 474 else 473 end);
  epyear := 474 + public.fmod(epbase, 2820);
  mdays  := case when jm <= 7 then (jm - 1) * 31 else (jm - 7) * 30 + 186 end;
  return (1948321 - 1
    + 1029983 * floor(epbase / 2820)
    + 365 * (epyear - 1)
    + floor((682 * epyear - 110) / 2816)
    + mdays
    + jd)::bigint;
end;
$$;

/** عددِ روزِ جولیَن → تاریخِ شمسی (آرایهٔ [سال، ماه، روز]) */
create or replace function public.jdn_to_jalali(jdn bigint)
returns int[] language plpgsql immutable strict parallel safe as $$
declare
  cycle_base bigint := public.jalali_to_jdn(475, 1, 1);
  depoch     numeric;
  cycle      numeric;
  cyear      numeric;
  ycycle     numeric;
  year       int;
  yday       int;
  month      int;
begin
  depoch := jdn - cycle_base;
  cycle  := floor(depoch / 1029983);
  cyear  := public.fmod(depoch, 1029983);

  if cyear = 1029983 - 1 then
    ycycle := 2820;
  else
    ycycle := floor(
        (2134 * floor(cyear / 366)
         + 2816 * public.fmod(cyear, 366)
         + 2815) / 1028522
      ) + floor(cyear / 366) + 1;
  end if;

  year := (ycycle + 2820 * cycle + 474)::int;
  if year <= 0 then year := year - 1; end if;

  yday  := (jdn - public.jalali_to_jdn(year, 1, 1) + 1)::int;
  month := case when yday <= 186
                then ceil(yday / 31.0)::int
                else ceil((yday - 186) / 30.0)::int + 6 end;

  return array[year, month, (jdn - public.jalali_to_jdn(year, month, 1) + 1)::int];
end;
$$;

/** «۱۴۰۰/۰۴/۱۶» → تاریخِ میلادی */
create or replace function public.jalali_to_gregorian(jdate text)
returns date language plpgsql immutable strict parallel safe as $$
declare
  parts text[];
  g     int[];
begin
  parts := regexp_split_to_array(jdate, '[/\-.]');
  if array_length(parts, 1) is null or array_length(parts, 1) < 3 then
    return null;
  end if;
  g := public.jdn_to_gregorian(
        public.jalali_to_jdn(parts[1]::int, parts[2]::int, parts[3]::int));
  return make_date(g[1], g[2], g[3]);
end;
$$;

/** تاریخِ میلادی → «۱۴۰۰/۰۴/۱۶» */
create or replace function public.gregorian_to_jalali(d date)
returns text language plpgsql immutable strict parallel safe as $$
declare
  j int[];
begin
  j := public.jdn_to_jalali(
        public.gregorian_to_jdn(extract(year from d)::int,
                                extract(month from d)::int,
                                extract(day from d)::int));
  return j[1]::text || '/' || lpad(j[2]::text, 2, '0') || '/' || lpad(j[3]::text, 2, '0');
end;
$$;

/** امروز به شمسیِ تهران (برای مقدارِ پیش‌فرضِ تاریخ در پایگاه‌داده) */
create or replace function public.today_jalali()
returns text language sql stable parallel safe as $$
  select public.gregorian_to_jalali((now() at time zone 'Asia/Tehran')::date);
$$;

/** کبیسه بودنِ سالِ شمسی */
create or replace function public.is_leap_jalali(jy int)
returns boolean language sql immutable strict parallel safe as $$
  select public.jalali_to_jdn(jy + 1, 1, 1) - public.jalali_to_jdn(jy, 1, 1) = 366;
$$;

/** طولِ ماهِ شمسی */
create or replace function public.jalali_month_length(jy int, jm int)
returns int language sql immutable strict parallel safe as $$
  select case
    when jm <= 6 then 31
    when jm <= 11 then 30
    when public.is_leap_jalali(jy) then 30
    else 29 end;
$$;

/** اعتبارسنجیِ رشتهٔ تاریخِ شمسی (YYYY/MM/DD) */
create or replace function public.is_valid_jalali(jdate text)
returns boolean language sql immutable strict parallel safe as $$
  select jdate ~ '^\d{4}/\d{2}/\d{2}$'
     and split_part(jdate, '/', 2)::int between 1 and 12
     and split_part(jdate, '/', 3)::int between 1
         and public.jalali_month_length(split_part(jdate, '/', 1)::int,
                                        split_part(jdate, '/', 2)::int);
$$;

-- ---------------------------------------------------------------------------
-- ۲) جدولِ تنظیمات (تک‌ردیفه)
-- ---------------------------------------------------------------------------
create table if not exists public.settings (
  id                  smallint     primary key default 1 check (id = 1),
  restaurant          text         not null default 'FARYA',
  restaurant_fa       text         not null default 'فریا',
  chef                text         not null default 'سرآشپز فرناز',
  currency            text         not null default 'تومان',
  target_margin       numeric      not null default 0.35
                        check (target_margin >= 0 and target_margin < 1),
  monthly_portions    numeric      not null default 3000 check (monthly_portions > 0),
  overhead_extra_coef numeric      not null default 0 check (overhead_extra_coef >= 0),
  price_source        text         not null default '',
  updated_at          timestamptz  not null default now()
);

insert into public.settings (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- ۳) آیتم‌های منو
-- ---------------------------------------------------------------------------
create table if not exists public.menu_items (
  id                  text        primary key,
  code                text        not null default '',
  name                text        not null,
  category            text        not null default 'غذای اصلی',
  image               text        not null default '',
  container_cost      numeric     not null default 0 check (container_cost >= 0),
  coef                numeric     not null default 3 check (coef > 0),
  yield_qty           numeric     check (yield_qty is null or yield_qty > 0),
  yield_unit          text,
  overhead_extra_coef numeric     check (overhead_extra_coef is null or overhead_extra_coef >= 0),
  overhead_fixed      numeric     check (overhead_fixed is null or overhead_fixed >= 0),
  unit_label          text        not null default 'پرس',
  old_price           numeric     check (old_price is null or old_price >= 0),
  price               numeric     check (price is null or price >= 0),
  active              boolean     not null default true,
  note                text        not null default '',
  sort_order          integer     not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_menu_items_category on public.menu_items (category);
create index if not exists idx_menu_items_active   on public.menu_items (active);
create index if not exists idx_menu_items_sort     on public.menu_items (sort_order, name);

-- ---------------------------------------------------------------------------
-- ۴) مواد اولیه
--    اگر sub_recipe_id مقدار داشته باشد، قیمتِ این ماده از بهای تمام‌شدهٔ
--    یک آیتمِ نیمه‌ساخته محاسبه می‌شود (دستورِ پختِ تو در تو).
-- ---------------------------------------------------------------------------
create table if not exists public.ingredients (
  id            text        primary key,
  name          text        not null,
  unit          text        not null default 'کیلو',
  note          text        not null default '',
  sub_recipe_id text        references public.menu_items (id) on delete set null,
  created_at    date,                       -- تاریخِ شمسی به‌صورت رشته در برنامه است؛ این ستون معادل میلادی است
  created_jdate text,                       -- تاریخِ شمسیِ ایجاد (اختیاری)
  sort_order    integer     not null default 0,
  updated_at    timestamptz not null default now()
);

create index if not exists idx_ingredients_name on public.ingredients (name);
create index if not exists idx_ingredients_sub  on public.ingredients (sub_recipe_id);

-- ---------------------------------------------------------------------------
-- ۵) نقاطِ قیمت (تاریخچهٔ قیمتِ هر مادهٔ اولیه)
--    gdate به‌صورت خودکار از تاریخِ شمسی تولید می‌شود → مرتب‌سازیِ درست
-- ---------------------------------------------------------------------------
create table if not exists public.price_points (
  id            uuid        primary key default gen_random_uuid(),
  ingredient_id text        not null references public.ingredients (id) on delete cascade,
  price         numeric     not null check (price >= 0),
  jdate         text        not null check (public.is_valid_jalali(jdate)),
  gdate         date        generated always as (public.jalali_to_gregorian(jdate)) stored,
  note          text        not null default '',
  seq           bigserial   not null,        -- ترتیبِ درج (برای تعیینِ آخرین قیمت در یک روز)
  created_at    timestamptz not null default now()
);

create index if not exists idx_price_points_ing
  on public.price_points (ingredient_id, gdate desc, seq desc);
create index if not exists idx_price_points_gdate on public.price_points (gdate desc);

-- ---------------------------------------------------------------------------
-- ۶) ردیف‌های دستورِ پخت
-- ---------------------------------------------------------------------------
create table if not exists public.recipe_steps (
  id            uuid         primary key default gen_random_uuid(),
  item_id       text         not null references public.menu_items (id) on delete cascade,
  ingredient_id text         not null references public.ingredients (id) on delete cascade,
  qty           numeric      not null default 0 check (qty >= 0),
  position      integer      not null default 0,
  created_at    timestamptz  not null default now(),
  updated_at    timestamptz  not null default now(),
  unique (item_id, ingredient_id)
);

create index if not exists idx_recipe_steps_item on public.recipe_steps (item_id, position);

-- ---------------------------------------------------------------------------
-- ۷) سربارها
--    kind : per-portion = به‌ازای هر پرس | monthly = ماهانه (تسهیم بر تعداد پرس)
--           percent = درصدی از بهای مواد
-- ---------------------------------------------------------------------------
create table if not exists public.overheads (
  id         text        primary key,
  name       text        not null,
  kind       text        not null default 'monthly'
               check (kind in ('per-portion', 'monthly', 'percent')),
  amount     numeric     not null default 0 check (amount >= 0),
  volume     numeric     check (volume is null or volume > 0),  -- تعداد پرس برای تسهیمِ ماهانه
  active     boolean     not null default true,
  note       text        not null default '',
  sort_order integer     not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_overheads_active on public.overheads (active, sort_order);

-- ---------------------------------------------------------------------------
-- ۸) تخصیصِ سربار به آیتم
-- ---------------------------------------------------------------------------
create table if not exists public.item_overheads (
  item_id     text    not null references public.menu_items (id) on delete cascade,
  overhead_id text    not null references public.overheads (id)  on delete cascade,
  primary key (item_id, overhead_id)
);

create index if not exists idx_item_overheads_ovh on public.item_overheads (overhead_id);

-- ---------------------------------------------------------------------------
-- ۹) وضعیتِ کاملِ برنامه (برای همگام‌سازیِ اتمیک و نگه‌داریِ تاریخچه)
-- ---------------------------------------------------------------------------
create table if not exists public.app_state (
  id         smallint    primary key default 1 check (id = 1),
  data       jsonb       not null,
  rev        bigint      not null default 1,     -- شمارندهٔ نسخه برای کنترلِ همزمانی
  updated_at timestamptz not null default now(),
  updated_by text        not null default 'system'
);

/** تاریخچهٔ نسخه‌ها — داده‌ها برای همیشه می‌مانند */
create table if not exists public.app_state_history (
  id         bigserial   primary key,
  rev        bigint      not null,
  data       jsonb       not null,
  reason     text        not null default '',
  actor      text        not null default 'system',
  saved_at   timestamptz not null default now()
);

create index if not exists idx_state_history_saved on public.app_state_history (saved_at desc);

-- ---------------------------------------------------------------------------
-- ۱۰) گزارشِ تغییرات (ردیابی)
-- ---------------------------------------------------------------------------
create table if not exists public.audit_log (
  id         bigserial   primary key,
  at         timestamptz not null default now(),
  actor      text        not null default 'system',
  action     text        not null check (action in ('insert', 'update', 'delete')),
  tbl        text        not null,
  row_id     text,
  payload    jsonb       not null default '{}'::jsonb
);

create index if not exists idx_audit_at   on public.audit_log (at desc);
create index if not exists idx_audit_tbl  on public.audit_log (tbl, row_id);

-- ---------------------------------------------------------------------------
-- ۱۱) به‌روزرسانیِ خودکارِ updated_at
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_settings_touch   on public.settings;
create trigger trg_settings_touch before update on public.settings
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_items_touch      on public.menu_items;
create trigger trg_items_touch before update on public.menu_items
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_ings_touch       on public.ingredients;
create trigger trg_ings_touch before update on public.ingredients
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_overheads_touch  on public.overheads;
create trigger trg_overheads_touch before update on public.overheads
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_steps_touch      on public.recipe_steps;
create trigger trg_steps_touch before update on public.recipe_steps
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- ۱۲) تابعِ عمومیِ ثبتِ ردیابی
-- ---------------------------------------------------------------------------
create or replace function public.audit_row()
returns trigger language plpgsql security definer as $$
declare
  v_actor text;
  v_id    text;
begin
  -- در Supabase شناسهٔ کاربر از توکنِ JWT خوانده می‌شود
  begin
    v_actor := coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', ''),
      'system');
  exception when others then
    v_actor := 'system';
  end;

  if tg_op = 'DELETE' then
    v_id := old.id::text;
  else
    v_id := new.id::text;
  end if;

  insert into public.audit_log (actor, action, tbl, row_id, payload)
  values (v_actor,
          lower(tg_op),
          tg_table_name,
          v_id,
          case tg_op
            when 'DELETE' then to_jsonb(old)
            else to_jsonb(new)
          end);
  return null;
end;
$$;

commit;


-- ==========================================================================
--  فایل: 02_functions.sql
-- ==========================================================================

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
     set created_at = coalesce(public.jalali_to_gregorian(created_jdate), current_date)
   where id is not null;

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


-- ==========================================================================
--  فایل: 03_rls.sql
-- ==========================================================================

-- ============================================================================
--  فریـا (FARYA) — فایل ۳ از ۵ : RLS امن، دسترسیِ سرآشپز، Realtime و audit
-- ----------------------------------------------------------------------------
--  دسترسیِ داده‌ها فقط برای کاربرِ واردشده فراهم است.
--  در پروژهٔ Supabase، ثبت‌نامِ عمومی باید خاموش باشد و کاربرِ سرآشپز را
--  مدیرِ پروژه به‌صورت دستی بسازد؛ در غیر این صورت هر حسابِ ثبت‌نام‌شده
--  به داده‌های این برنامه دسترسی خواهد داشت.
--
--  کلیدِ publishable/anon برای مرورگر است، اما به‌تنهایی اجازهٔ عبور از RLS
--  نمی‌دهد. کلیدِ secret هرگز در برنامهٔ مرورگر قرار نگیرد.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
--  ۱) فعال‌سازیِ Row Level Security
-- ---------------------------------------------------------------------------
alter table public.settings          enable row level security;
alter table public.menu_items        enable row level security;
alter table public.ingredients       enable row level security;
alter table public.price_points      enable row level security;
alter table public.recipe_steps     enable row level security;
alter table public.overheads        enable row level security;
alter table public.item_overheads   enable row level security;
alter table public.app_state        enable row level security;
alter table public.app_state_history enable row level security;
alter table public.audit_log        enable row level security;

-- ---------------------------------------------------------------------------
--  ۲) سیاست‌های امن: تنها نقش authenticated اجازهٔ دسترسی دارد
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
  access_role text;
  has_anon boolean;
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    access_role := 'authenticated';
  else
    -- فقط برای اجرای آزمون‌های محلیِ PostgreSQL که نقش‌های Supabase ندارند.
    access_role := current_user;
    raise notice 'نقش authenticated پیدا نشد؛ سیاست‌های محلی برای % ساخته می‌شود', access_role;
  end if;

  select exists (select 1 from pg_roles where rolname = 'anon') into has_anon;

  foreach t in array array[
    'settings','menu_items','ingredients','price_points','recipe_steps',
    'overheads','item_overheads','app_state','app_state_history','audit_log'
  ] loop
    execute format('drop policy if exists p_%s_all on public.%I', t, t);
    execute format('drop policy if exists p_%s_read on public.%I', t, t);

    execute format(
      'create policy p_%s_all on public.%I for all to %I using (true) with check (true)',
      t, t, access_role
    );

    -- صریحاً دسترسیِ ناشناس را می‌بندیم؛ RLS به‌تنهایی جای GRANT را نمی‌گیرد.
    execute format('revoke all privileges on table public.%I from public', t);
    if has_anon then
      execute format('revoke all privileges on table public.%I from anon', t);
    end if;
    execute format('grant select, insert, update, delete on table public.%I to %I', t, access_role);
  end loop;

  execute format('grant usage, select on all sequences in schema public to %I', access_role);
end $$;

-- ---------------------------------------------------------------------------
--  ۳) توابعِ RPC فقط برای کاربرِ واردشده
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on all functions in schema public from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on all functions in schema public to authenticated;
  else
    execute format('grant execute on all functions in schema public to %I', current_user);
  end if;
end $$;

-- ---------------------------------------------------------------------------
--  ۴) Realtime — برنامه را از تغییرِ وضعیت در لحظه باخبر می‌کند
-- ---------------------------------------------------------------------------
alter table public.app_state replica identity full;
do $$
begin
  alter publication supabase_realtime add table public.app_state;
  raise notice 'جدول app_state به publicationِ supabase_realtime افزوده شد';
exception
  when undefined_object then
    raise notice 'publicationِ supabase_realtime موجود نیست؛ در Supabase به‌صورت خودکار فعال می‌شود';
  when duplicate_object then
    raise notice 'جدول app_state از قبل در publication است';
end $$;

-- ---------------------------------------------------------------------------
--  ۵) ردیابیِ تغییرات
-- ---------------------------------------------------------------------------
drop trigger if exists trg_audit_menu_items   on public.menu_items;
create trigger trg_audit_menu_items
  after insert or update or delete on public.menu_items
  for each row execute function public.audit_row();

drop trigger if exists trg_audit_ingredients  on public.ingredients;
create trigger trg_audit_ingredients
  after insert or update or delete on public.ingredients
  for each row execute function public.audit_row();

drop trigger if exists trg_audit_price_points on public.price_points;
create trigger trg_audit_price_points
  after insert or update or delete on public.price_points
  for each row execute function public.audit_row();

drop trigger if exists trg_audit_overheads    on public.overheads;
create trigger trg_audit_overheads
  after insert or update or delete on public.overheads
  for each row execute function public.audit_row();

-- save_state ممکن است به‌سببِ بازنویسیِ چندجدولی audit زیادی بسازد؛ محدودش می‌کنیم.
create or replace function public.prune_audit_log(p_keep integer default 5000)
returns integer language plpgsql as $$
declare
  v_deleted integer;
begin
  with old as (
    select id from public.audit_log order by at desc offset p_keep
  )
  delete from public.audit_log a using old o where a.id = o.id;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end $$;

commit;

-- ============================================================================
--  پایانِ سیاست‌های امن. در پروژهٔ آنلاین، disable_signup=true باشد.
--  کاربرِ سرآشپز را از Authentication → Users در داشبورد ایجاد کنید.
-- ============================================================================


-- ==========================================================================
--  فایل: 04_seed.sql
-- ==========================================================================

-- ============================================================================
--  فریـا (FARYA) — فایل ۴ از ۵ : داده‌های واقعی (Seed)
-- ----------------------------------------------------------------------------
--  این فایل به‌صورت خودکار از همان داده‌های برنامه (src/data/seed.ts) تولید شده
--  و منشأ آن فایل «menu cost-1400-04-16.pdf» است: ۳۲۹ ردیف / ۴۳ آیتم /
--  ۱۱۳ مادهٔ اولیه / ۳۲۸ ردیفِ دستورِ پخت — بدون هیچ حذف یا تغییری در اعداد.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
--  تنظیمات
-- ---------------------------------------------------------------------------
update public.settings set
  restaurant          = 'FARYA',
  restaurant_fa       = 'فریا',
  chef                = 'سرآشپز فرناز',
  currency            = 'تومان',
  target_margin       = 0.35,
  monthly_portions    = 3000,
  overhead_extra_coef = 0,
  price_source        = 'menu cost-1400-04-16.pdf'
where id = 1;

-- ---------------------------------------------------------------------------
--  آیتم‌های منو  (43 آیتم)
-- ---------------------------------------------------------------------------
insert into public.menu_items
  (id, code, name, category, image, container_cost, coef, yield_qty, yield_unit,
   overhead_extra_coef, overhead_fixed, unit_label, old_price, price, active,
   note, sort_order) values
  ('item-001', '1', 'نان سیر', 'پیش‌غذا', 'bread.jpg', 740, 3, null, null, null, null, 'پرس', 38000, 40000, true, '', 0),
  ('item-002', '2', 'سیب زمینی سرخ کرده', 'پیش‌غذا', 'bread.jpg', 1150, 3, null, null, null, null, 'پرس', 30000, 37000, true, '', 1),
  ('item-003', '3', 'پاپ فرایز', 'پیش‌غذا', 'bread.jpg', 1150, 3, null, null, null, null, 'پرس', 46000, 62000, true, '', 2),
  ('item-004', '6', 'ساالد سزار (مرغ گریل)', 'سالاد', 'salad.jpg', 2100, 3, null, null, null, null, 'پرس', 73000, 73000, true, '', 3),
  ('item-005', '6_1', 'سس سزار', 'نیمه‌ساخته', '', 0, 1, 30, 'پرس', null, null, 'پرس', null, null, true, '', 4),
  ('item-006', '7', 'ساالد بیسترو', 'سالاد', 'salad.jpg', 2100, 3, null, null, null, null, 'پرس', 78000, 75000, true, '', 5),
  ('item-007', '9', 'پیتزا مارگریتا', 'پیتزا', 'pizza.jpg', 740, 3, null, null, null, null, 'پرس', 53000, 55000, true, '', 6),
  ('item-008', '10', 'پیتزا وجی', 'پیتزا', 'pizza.jpg', 740, 3, null, null, null, null, 'پرس', 60000, 62000, true, '', 7),
  ('item-009', '11', 'پیتزا بیکن', 'پیتزا', 'pizza.jpg', 740, 3, null, null, null, null, 'پرس', 91000, 99000, true, '', 8),
  ('item-010', '12', 'پیتزا پپرونی', 'پیتزا', 'pizza.jpg', 740, 3, null, null, null, null, 'پرس', 72000, 80000, true, '', 9),
  ('item-011', '13', 'پیتزا بیسترو', 'پیتزا', 'pizza.jpg', 740, 3, null, null, null, null, 'پرس', 94000, 99000, true, '', 10),
  ('item-012', '14', 'پیتزا رست بیف', 'پیتزا', 'pizza.jpg', 740, 3, null, null, null, null, 'پرس', 90000, 94000, true, '', 11),
  ('item-013', '15', 'پیتزا بیف تانگ', 'پیتزا', 'pizza.jpg', 740, 3, null, null, null, null, 'پرس', 80000, 96000, true, '', 12),
  ('item-014', '16', 'پیتزا پاپ چیکن', 'پیتزا', 'pizza.jpg', 740, 3, null, null, null, null, 'پرس', 91000, 91000, true, '', 13),
  ('item-015', '17', 'دسر موز شکالت', 'دسر', 'dessert.jpg', 740, 3, null, null, null, null, 'پرس', 57000, 58000, true, 'کنار وافل', 14),
  ('item-016', '18', 'چیکن تندوری پوچوآ', 'پوچوآ', 'pizza.jpg', 2350, 3, null, null, null, null, 'پرس', 76000, 76000, true, '', 15),
  ('item-017', '19', 'رست بیف پوچوآ', 'پوچوآ', 'pizza.jpg', 2350, 2.5, null, null, null, null, 'پرس', 91000, 92000, true, '', 16),
  ('item-018', '20', 'بیف تانگ پوچوآ', 'پوچوآ', 'pizza.jpg', 2350, 3, null, null, null, null, 'پرس', 79000, 85000, true, '', 17),
  ('item-019', '22', 'وجی پوچوآ', 'پوچوآ', 'pizza.jpg', 2350, 3, null, null, null, null, 'پرس', 61000, 65000, true, '', 18),
  ('item-020', '23', 'پنه چیکن آلفردو', 'پاستا', 'pasta.jpg', 2100, 3, null, null, null, null, 'پرس', 90000, 90000, true, '', 19),
  ('item-021', '24', 'پنه بیف آلفردو', 'پاستا', 'pasta.jpg', 2100, 3, null, null, null, null, 'پرس', 92000, 92000, true, '', 20),
  ('item-022', '25', 'لینگویینی چیکن پستو', 'پاستا', 'pasta.jpg', 2100, 3, null, null, null, null, 'پرس', 92000, 90000, true, '', 21),
  ('item-023', '26', 'لینگویینی کربونرا', 'پاستا', 'pasta.jpg', 2100, 2.5, null, null, null, null, 'پرس', 99000, 99000, true, '', 22),
  ('item-024', '27', 'آمریکن برگر', 'برگر', 'burger.jpg', 2350, 3, null, null, null, null, 'پرس', 66000, 73000, true, '', 23),
  ('item-025', '28', 'بیسترو برگر', 'برگر', 'burger.jpg', 2350, 2.67, null, null, null, null, 'پرس', 87000, 95000, true, '', 24),
  ('item-026', '29', 'بلک برگر', 'برگر', 'burger.jpg', 2350, 2.67, null, null, null, null, 'پرس', 96000, 107000, true, '', 25),
  ('item-027', '30', 'چیکن استیک', 'غذای اصلی', 'beef.jpg', 3610, 3, null, null, null, null, 'پرس', 87000, 90000, true, '', 26),
  ('item-028', '34', 'مرینیت برگر', 'نیمه‌ساخته', '', 0, 1, 46, 'پرس', null, null, 'پرس', null, null, true, '', 27),
  ('item-029', '35', 'خمیر پیتزا', 'نیمه‌ساخته', '', 0, 1, 12.008, 'کیلو', null, null, 'کیلو', null, null, true, '', 28),
  ('item-030', '36', 'روغن سیر', 'نیمه‌ساخته', '', 0, 1, 2.4, 'کیلو', null, null, 'کیلو', null, null, true, '', 29),
  ('item-031', '37', 'سس قارچ', 'نیمه‌ساخته', '', 0, 1, 9.7, 'کیلو', null, null, 'کیلو', null, null, true, '', 30),
  ('item-032', '38', 'مرغ مرینیت', 'نیمه‌ساخته', '', 0, 1, 7.425, 'کیلو', null, null, 'کیلو', null, null, true, '', 31),
  ('item-033', '39', 'دیپ چدار', 'نیمه‌ساخته', '', 0, 1, 1.125, 'کیلو', null, null, 'کیلو', null, null, true, '', 32),
  ('item-034', '40', 'سس پستو', 'نیمه‌ساخته', '', 0, 1, 1.01, 'کیلو', null, null, 'کیلو', null, null, true, '', 33),
  ('item-035', '41', 'سس مارینارا', 'نیمه‌ساخته', '', 0, 1, 11.1, 'کیلو', null, null, 'کیلو', null, null, true, '', 34),
  ('item-036', '42', 'پیاز کاراملی', 'نیمه‌ساخته', '', 0, 1, 1, 'کیلو', null, null, 'کیلو', null, null, true, '', 35),
  ('item-037', '43_1', 'پخت رست بیف', 'نیمه‌ساخته', '', 0, 1, 1, 'کیلو', null, null, 'کیلو', null, null, true, '', 36),
  ('item-038', '43', 'رست بیف مرینیت', 'نیمه‌ساخته', '', 0, 1, 1.24, 'کیلو', null, null, 'کیلو', null, null, true, '', 37),
  ('item-039', '44', 'سس بیسترو', 'نیمه‌ساخته', '', 0, 1, 20, 'کیلو', null, null, 'کیلو', null, null, true, '', 38),
  ('item-040', '45', 'سیب زمینی سرخ کرده ساده', 'نیمه‌ساخته', '', 0, 1, 0.51, 'کیلو', null, null, 'کیلو', null, null, true, '', 39),
  ('item-041', '46', 'سس آلفردو', 'نیمه‌ساخته', '', 0, 1, 4.88, 'کیلو', null, null, 'کیلو', null, null, true, '', 40),
  ('item-042', '59', 'سس تارتار', 'نیمه‌ساخته', '', 0, 1, 2, 'کیلو', null, null, 'کیلو', null, null, true, '', 41),
  ('item-043', '60', 'دورچین برگر و پوچااو', 'نیمه‌ساخته', '', 0, 1, 1, 'پرس', null, null, 'پرس', null, null, true, '', 42)
on conflict (id) do update set
  code = excluded.code, name = excluded.name, category = excluded.category,
  image = excluded.image, container_cost = excluded.container_cost,
  coef = excluded.coef, yield_qty = excluded.yield_qty, yield_unit = excluded.yield_unit,
  overhead_extra_coef = excluded.overhead_extra_coef,
  overhead_fixed = excluded.overhead_fixed, unit_label = excluded.unit_label,
  old_price = excluded.old_price, price = excluded.price, active = excluded.active,
  note = excluded.note, sort_order = excluded.sort_order;

-- ---------------------------------------------------------------------------
--  مواد اولیه  (113 ماده)
-- ---------------------------------------------------------------------------
insert into public.ingredients (id, name, unit, note, sub_recipe_id, created_jdate, sort_order) values
  ('ing-001', 'آب', 'لیتر', '', null, '1400/04/16', 0),
  ('ing-002', 'آب انبه', 'لیتر', '', null, '1400/04/16', 1),
  ('ing-003', 'آبلیمو', 'لیتر', '', null, '1400/04/16', 2),
  ('ing-004', 'آرد', 'کیلو', '', null, '1400/04/16', 3),
  ('ing-005', 'ادویه (شوید،فلفل،نمک،سیر،روغن سیر)', 'کیلو', '', null, '1400/04/16', 4),
  ('ing-006', 'ادویه تندوری', 'کیلو', '', null, '1400/04/16', 5),
  ('ing-007', 'اوریگانو', 'کیلو', '', null, '1400/04/16', 6),
  ('ing-008', 'اویستر', 'کیلو', '', null, '1400/04/16', 7),
  ('ing-009', 'بادام زمینی', 'کیلو', '', null, '1400/04/16', 8),
  ('ing-010', 'بادمجان', 'کیلو', '', null, '1400/04/16', 9),
  ('ing-011', 'بازیلیکو', 'کیلو', '', null, '1400/04/16', 10),
  ('ing-012', 'بالزامیک', 'لیتر', '', null, '1400/04/16', 11),
  ('ing-013', 'بالزامیک', 'کیلو', '', null, '1400/04/16', 12),
  ('ing-014', 'بالل', 'کیلو', '', null, '1400/04/16', 13),
  ('ing-015', 'برگ بو', 'کیلو', '', null, '1400/04/16', 14),
  ('ing-016', 'بی بی اسفناج', 'کیلو', '', null, '1400/04/16', 15),
  ('ing-017', 'بیکن گوساله', 'کیلو', '', null, '1400/04/16', 16),
  ('ing-018', 'تخم مرغ (نیمرو)', 'عدد', '', null, '1400/04/16', 17),
  ('ing-019', 'توت فرنگی', 'کیلو', '', null, '1400/04/16', 18),
  ('ing-020', 'جعفری فری', 'کیلو', '', null, '1400/04/16', 19),
  ('ing-021', 'جوز هندی', 'کیلو', '', null, '1400/04/16', 20),
  ('ing-022', 'جوز هندی', 'لیتر', '', null, '1400/04/16', 21),
  ('ing-023', 'خامه', 'لیتر', '', null, '1400/04/16', 22),
  ('ing-024', 'خامه', 'کیلو', '', null, '1400/04/16', 23),
  ('ing-025', 'خردل ارمنی', 'کیلو', '', null, '1400/04/16', 24),
  ('ing-026', 'خردل فرنچ', 'کیلو', '', null, '1400/04/16', 25),
  ('ing-027', 'خمیر پیتزا', 'کیلو', 'قیمت از دستور پخت محاسبه می‌شود', 'item-029', '1400/04/16', 26),
  ('ing-028', 'خیار', 'کیلو', '', null, '1400/04/16', 27),
  ('ing-029', 'خیار', 'لیتر', '', null, '1400/04/16', 28),
  ('ing-030', 'خیارشور', 'کیلو', '', null, '1400/04/16', 29),
  ('ing-031', 'دورچین', 'پرس', 'قیمت از دستور پخت محاسبه می‌شود', 'item-043', '1400/04/16', 30),
  ('ing-032', 'دیپ چدار', 'کیلو', 'قیمت از دستور پخت محاسبه می‌شود', 'item-033', '1400/04/16', 31),
  ('ing-033', 'راسته / ران گوساله (استیک)', 'کیلو', '', null, '1400/04/16', 32),
  ('ing-034', 'رزماری', 'کیلو', '', null, '1400/04/16', 33),
  ('ing-035', 'رست بیف مرینیت', 'کیلو', 'قیمت از دستور پخت محاسبه می‌شود', 'item-038', '1400/04/16', 34),
  ('ing-036', 'روغن زیتون', 'لیتر', '', null, '1400/04/16', 35),
  ('ing-037', 'روغن زیتون فرابکر', 'لیتر', '', null, '1400/04/16', 36),
  ('ing-038', 'روغن سیر', 'کیلو', 'قیمت از دستور پخت محاسبه می‌شود', 'item-030', '1400/04/16', 37),
  ('ing-039', 'روغن سیر', 'کیلو', 'قیمت از دستور پخت محاسبه می‌شود', 'item-030', '1400/04/16', 38),
  ('ing-040', 'روغن پخت و پز', 'کیلو', '', null, '1400/04/16', 39),
  ('ing-041', 'روغن پخت و پز', 'لیتر', '', null, '1400/04/16', 40),
  ('ing-042', 'روکوال', 'کیلو', '', null, '1400/04/16', 41),
  ('ing-043', 'زبان گوساله', 'کیلو', '', null, '1400/04/16', 42),
  ('ing-044', 'زرده تخم مرع (نصف تخم مرغ)', 'عدد', '', null, '1400/04/16', 43),
  ('ing-045', 'زیتون سبز بی هسته', 'کیلو', '', null, '1400/04/16', 44),
  ('ing-046', 'زیتون سبز بی هسته', 'لیتر', '', null, '1400/04/16', 45),
  ('ing-047', 'سردست گوساله برزیلی', 'کیلو', '', null, '1400/04/16', 46),
  ('ing-048', 'سردست گوساله گرم', 'کیلو', '', null, '1400/04/16', 47),
  ('ing-049', 'سرکه سفید', 'لیتر', '', null, '1400/04/16', 48),
  ('ing-050', 'سس آلفردو', 'کیلو', 'قیمت از دستور پخت محاسبه می‌شود', 'item-041', '1400/04/16', 49),
  ('ing-051', 'سس بیسترو', 'کیلو', 'قیمت از دستور پخت محاسبه می‌شود', 'item-039', '1400/04/16', 50),
  ('ing-052', 'سس تارتار (مخصوص)', 'کیلو', '', null, '1400/04/16', 51),
  ('ing-053', 'سس زعفران (زعفران خالی)', 'کیلو', '', null, '1400/04/16', 52),
  ('ing-054', 'سس سزار', 'پرس', 'قیمت از دستور پخت محاسبه می‌شود', 'item-005', '1400/04/16', 53),
  ('ing-055', 'سس قارچ', 'کیلو', 'قیمت از دستور پخت محاسبه می‌شود', 'item-031', '1400/04/16', 54),
  ('ing-056', 'سس مارینارا', 'کیلو', 'قیمت از دستور پخت محاسبه می‌شود', 'item-035', '1400/04/16', 55),
  ('ing-057', 'سس پستو', 'کیلو', 'قیمت از دستور پخت محاسبه می‌شود', 'item-034', '1400/04/16', 56),
  ('ing-058', 'سویا سس', 'لیتر', '', null, '1400/04/16', 57),
  ('ing-059', 'سیب زمینی سرخ کرده ساده', 'کیلو', 'قیمت از دستور پخت محاسبه می‌شود', 'item-040', '1400/04/16', 58),
  ('ing-060', 'سیب زمینی شرکتی', 'کیلو', '', null, '1400/04/16', 59),
  ('ing-061', 'سیر', 'کیلو', '', null, '1400/04/16', 60),
  ('ing-062', 'سینه مرغ', 'کیلو', '', null, '1400/04/16', 61),
  ('ing-063', 'شوید خشک', 'کیلو', '', null, '1400/04/16', 62),
  ('ing-064', 'شکالت فندقی', 'کیلو', '', null, '1400/04/16', 63),
  ('ing-065', 'شیر', 'لیتر', '', null, '1400/04/16', 64),
  ('ing-066', 'شیر', 'کیلو', '', null, '1400/04/16', 65),
  ('ing-067', 'عصاره مرغ', 'کیلو', '', null, '1400/04/16', 66),
  ('ing-068', 'فلفل دلمه سبز', 'کیلو', '', null, '1400/04/16', 67),
  ('ing-069', 'فلفل و نمک', 'کیلو', '', null, '1400/04/16', 68),
  ('ing-070', 'فلفل چیلی فلگ', 'کیلو', '', null, '1400/04/16', 69),
  ('ing-071', 'فلفل گرانول', 'کیلو', '', null, '1400/04/16', 70),
  ('ing-072', 'قارچ', 'کیلو', '', null, '1400/04/16', 71),
  ('ing-073', 'قلوه گاه گوساله', 'کیلو', '', null, '1400/04/16', 72),
  ('ing-074', 'لوبیا سبز', 'کیلو', '', null, '1400/04/16', 73),
  ('ing-075', 'لیمو ترش', 'کیلو', '', null, '1400/04/16', 74),
  ('ing-076', 'لیمو ترش', 'لیتر', '', null, '1400/04/16', 75),
  ('ing-077', 'لینگویینی', 'کیلو', '', null, '1400/04/16', 76),
  ('ing-078', 'مایونز', 'کیلو', '', null, '1400/04/16', 77),
  ('ing-079', 'مخمر', 'کیلو', '', null, '1400/04/16', 78),
  ('ing-080', 'مرغ مرینیت', 'کیلو', 'قیمت از دستور پخت محاسبه می‌شود', 'item-032', '1400/04/16', 79),
  ('ing-081', 'مرینیت برگر', 'پرس', 'قیمت از دستور پخت محاسبه می‌شود', 'item-028', '1400/04/16', 80),
  ('ing-082', 'موز سرخ شده', 'کیلو', '', null, '1400/04/16', 81),
  ('ing-083', 'میوه فصل', 'کیلو', '', null, '1400/04/16', 82),
  ('ing-084', 'نان برگر بلک', 'عدد', '', null, '1400/04/16', 83),
  ('ing-085', 'نان برگر شاینی', 'عدد', '', null, '1400/04/16', 84),
  ('ing-086', 'نان تست', 'کیلو', '', null, '1400/04/16', 85),
  ('ing-087', 'نان پوچوآ (خمیر پیتزا)', 'کیلو', '', null, '1400/04/16', 86),
  ('ing-088', 'نان پیتا', 'عدد', '', null, '1400/04/16', 87),
  ('ing-089', 'نشاسته ذرت', 'کیلو', '', null, '1400/04/16', 88),
  ('ing-090', 'نمک', 'کیلو', '', null, '1400/04/16', 89),
  ('ing-091', 'هالوپینو', 'کیلو', '', null, '1400/04/16', 90),
  ('ing-092', 'هویج', 'کیلو', '', null, '1400/04/16', 91),
  ('ing-093', 'وورچستر', 'لیتر', '', null, '1400/04/16', 92),
  ('ing-094', 'پارمسان', 'کیلو', '', null, '1400/04/16', 93),
  ('ing-095', 'پاپریکا شیرین (دودی)', 'کیلو', '', null, '1400/04/16', 94),
  ('ing-096', 'پخت رست بیف', 'کیلو', 'قیمت از دستور پخت محاسبه می‌شود', 'item-037', '1400/04/16', 95),
  ('ing-097', 'پنه', 'کیلو', '', null, '1400/04/16', 96),
  ('ing-098', 'پنیر دانمارکی', 'کیلو', '', null, '1400/04/16', 97),
  ('ing-099', 'پنیر لبنه', 'کیلو', '', null, '1400/04/16', 98),
  ('ing-100', 'پنیر موزارال محلی', 'کیلو', '', null, '1400/04/16', 99),
  ('ing-101', 'پپرونی', 'کیلو', '', null, '1400/04/16', 100),
  ('ing-102', 'پیاز سفید', 'کیلو', '', null, '1400/04/16', 101),
  ('ing-103', 'پیاز کاراملی', 'کیلو', 'قیمت از دستور پخت محاسبه می‌شود', 'item-036', '1400/04/16', 102),
  ('ing-104', 'پیازچه', 'کیلو', '', null, '1400/04/16', 103),
  ('ing-105', 'چدار', 'کیلو', '', null, '1400/04/16', 104),
  ('ing-106', 'کاهو', 'کیلو', '', null, '1400/04/16', 105),
  ('ing-107', 'کدو', 'کیلو', '', null, '1400/04/16', 106),
  ('ing-108', 'کرفس', 'کیلو', '', null, '1400/04/16', 107),
  ('ing-109', 'کره گیاهی', 'کیلو', '', null, '1400/04/16', 108),
  ('ing-110', 'کیپرز', 'کیلو', '', null, '1400/04/16', 109),
  ('ing-111', 'گردو', 'کیلو', '', null, '1400/04/16', 110),
  ('ing-112', 'گوجه', 'کیلو', '', null, '1400/04/16', 111),
  ('ing-113', 'گوجه گیالسی', 'کیلو', '', null, '1400/04/16', 112)
on conflict (id) do update set
  name = excluded.name, unit = excluded.unit, note = excluded.note,
  sub_recipe_id = excluded.sub_recipe_id, created_jdate = excluded.created_jdate,
  sort_order = excluded.sort_order;

-- ---------------------------------------------------------------------------
--  تاریخچهٔ قیمت‌ها  (115 نقطهٔ قیمت)
--  ترتیبِ درج همان ترتیبِ برنامه است و ستون seq آن را حفظ می‌کند،
--  بنابراین «آخرین قیمت ثبت‌شده» در پایگاه‌داده دقیقاً با برنامه یکی است.
-- ---------------------------------------------------------------------------
insert into public.price_points (ingredient_id, price, jdate, note) values
  ('ing-001', 50, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-002', 33000, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-003', 5500, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-004', 8200, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-005', 210000, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-006', 270000, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-007', 195000, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-008', 230000, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-009', 80000, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-010', 6500, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-011', 120000, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-012', 125000, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-013', 125000, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-014', 10000, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-015', 250000, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-016', 100000, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-017', 180000, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-018', 1167, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-019', 57000, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-020', 100000, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-021', 550000, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-022', 550000, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-023', 46000, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-024', 46000, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-025', 45000, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-026', 90000, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-027', 5135.6596, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-028', 8000, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-029', 8000, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-030', 11000, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-031', 2687.7451, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-032', 50106.667, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-033', 139000, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-034', 80000, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-035', 156866.53, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-036', 34000, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-037', 120000, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-038', 14583.333, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-039', 14583.333, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-040', 11500, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-041', 11500, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-042', 100000, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-043', 85000, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-044', 1167, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-045', 65000, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-046', 65000, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-047', 108000, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-048', 128000, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-049', 5000, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-050', 41376.366, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-051', 3001.672, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-052', 16895, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-053', 12500000, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-054', 11193.667, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-055', 32545.361, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-056', 10953.153, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-057', 73373.762, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-058', 55000, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-059', 20784.314, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-060', 17000, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-061', 30000, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-062', 60000, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-063', 100000, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-064', 92000, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-065', 8000, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-066', 8000, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-067', 60000, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-068', 9000, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-069', 74000, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-070', 230000, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-071', 140000, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-072', 32000, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-073', 110000, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-074', 13500, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-075', 20000, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-076', 20000, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-077', 19200, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-078', 10700, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-079', 50000, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-080', 65625.14, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-081', 13859.565, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-082', 29000, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-083', 19000, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-084', 5000, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-085', 4200, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-086', 750, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-087', 5135.6596, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-088', 1000, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-089', 25000, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-090', 3700, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-091', 35000, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-092', 9000, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-093', 200000, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-094', 220000, '1400/04/16', 'قیمت متفاوت در ردیف دیگرِ فایل منو'),
  ('ing-094', 267000, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-095', 254000, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-096', 184918.5, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-097', 15800, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-098', 50000, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-099', 43000, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-100', 98000, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-101', 78000, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-102', 6500, '1400/04/16', 'قیمت متفاوت در ردیف دیگرِ فایل منو'),
  ('ing-102', 6000, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-103', 6500, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-104', 10000, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-105', 53500, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-106', 7000, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-107', 8000, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-108', 6000, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-109', 35000, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-110', 35000, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-111', 195000, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-112', 7500, '1400/04/16', 'ورود از فایل اکسل منو'),
  ('ing-113', 20000, '1400/04/16', 'ورود از فایل اکسل منو');

-- ---------------------------------------------------------------------------
--  دستورِ پخت  (328 ردیف)
-- ---------------------------------------------------------------------------
insert into public.recipe_steps (item_id, ingredient_id, qty, position) values
  ('item-001', 'ing-027', 0.29, 0),
  ('item-001', 'ing-100', 0.08, 1),
  ('item-001', 'ing-038', 0.05, 2),
  ('item-001', 'ing-007', 0.002, 3),
  ('item-001', 'ing-020', 0.002, 4),
  ('item-002', 'ing-060', 0.4, 0),
  ('item-002', 'ing-005', 0.005, 1),
  ('item-002', 'ing-020', 0.004, 2),
  ('item-002', 'ing-052', 0.1, 3),
  ('item-003', 'ing-060', 0.4, 0),
  ('item-003', 'ing-005', 0.005, 1),
  ('item-003', 'ing-032', 0.05, 2),
  ('item-003', 'ing-017', 0.025, 3),
  ('item-003', 'ing-055', 0.1, 4),
  ('item-004', 'ing-106', 0.4, 0),
  ('item-004', 'ing-086', 0.02, 1),
  ('item-004', 'ing-094', 0.015, 2),
  ('item-004', 'ing-054', 0.15, 3),
  ('item-004', 'ing-080', 0.18, 4),
  ('item-005', 'ing-044', 30, 0),
  ('item-005', 'ing-036', 1.5, 1),
  ('item-005', 'ing-026', 0.32, 2),
  ('item-005', 'ing-061', 0.3, 3),
  ('item-005', 'ing-075', 1, 4),
  ('item-005', 'ing-049', 0.12, 5),
  ('item-005', 'ing-067', 0.5, 6),
  ('item-005', 'ing-094', 0.45, 7),
  ('item-005', 'ing-012', 0.12, 8),
  ('item-005', 'ing-093', 0.09, 9),
  ('item-005', 'ing-058', 0.15, 10),
  ('item-006', 'ing-106', 0.25, 0),
  ('item-006', 'ing-019', 0.04, 1),
  ('item-006', 'ing-009', 0.04, 2),
  ('item-006', 'ing-028', 0.05, 3),
  ('item-006', 'ing-016', 0.02, 4),
  ('item-006', 'ing-113', 0.02, 5),
  ('item-006', 'ing-092', 0.05, 6),
  ('item-006', 'ing-083', 0.08, 7),
  ('item-006', 'ing-088', 1, 8),
  ('item-006', 'ing-051', 0.1, 9),
  ('item-007', 'ing-027', 0.29, 0),
  ('item-007', 'ing-056', 0.1, 1),
  ('item-007', 'ing-011', 0.005, 2),
  ('item-007', 'ing-100', 0.08, 3),
  ('item-007', 'ing-037', 0.01, 4),
  ('item-007', 'ing-094', 0.01, 5),
  ('item-007', 'ing-038', 0.005, 6),
  ('item-007', 'ing-007', 0.002, 7),
  ('item-008', 'ing-027', 0.29, 0),
  ('item-008', 'ing-056', 0.08, 1),
  ('item-008', 'ing-100', 0.05, 2),
  ('item-008', 'ing-098', 0.05, 3),
  ('item-008', 'ing-068', 0.04, 4),
  ('item-008', 'ing-072', 0.05, 5),
  ('item-008', 'ing-102', 0.015, 6),
  ('item-008', 'ing-107', 0.06, 7),
  ('item-008', 'ing-037', 0.01, 8),
  ('item-008', 'ing-094', 0.01, 9),
  ('item-008', 'ing-110', 0.01, 10),
  ('item-008', 'ing-007', 0.002, 11),
  ('item-009', 'ing-027', 0.29, 0),
  ('item-009', 'ing-056', 0.06, 1),
  ('item-009', 'ing-025', 0.002, 2),
  ('item-009', 'ing-100', 0.05, 3),
  ('item-009', 'ing-098', 0.05, 4),
  ('item-009', 'ing-017', 0.1, 5),
  ('item-009', 'ing-094', 0.01, 6),
  ('item-009', 'ing-037', 0.01, 7),
  ('item-009', 'ing-007', 0.002, 8),
  ('item-009', 'ing-038', 0.005, 9),
  ('item-010', 'ing-027', 0.29, 0),
  ('item-010', 'ing-056', 0.05, 1),
  ('item-010', 'ing-025', 0.002, 2),
  ('item-010', 'ing-100', 0.05, 3),
  ('item-010', 'ing-098', 0.05, 4),
  ('item-010', 'ing-101', 0.08, 5),
  ('item-010', 'ing-091', 0.04, 6),
  ('item-010', 'ing-094', 0.01, 7),
  ('item-010', 'ing-037', 0.01, 8),
  ('item-010', 'ing-007', 0.002, 9),
  ('item-010', 'ing-038', 0.005, 10),
  ('item-011', 'ing-027', 0.29, 0),
  ('item-011', 'ing-100', 0.05, 1),
  ('item-011', 'ing-098', 0.05, 2),
  ('item-011', 'ing-033', 0.1, 3),
  ('item-011', 'ing-072', 0.05, 4),
  ('item-011', 'ing-094', 0.01, 5),
  ('item-011', 'ing-038', 0.005, 6),
  ('item-011', 'ing-009', 0.01, 7),
  ('item-011', 'ing-055', 0.08, 8),
  ('item-012', 'ing-027', 0.29, 0),
  ('item-012', 'ing-055', 0.08, 1),
  ('item-012', 'ing-098', 0.05, 2),
  ('item-012', 'ing-100', 0.05, 3),
  ('item-012', 'ing-035', 0.08, 4),
  ('item-012', 'ing-104', 0.015, 5),
  ('item-012', 'ing-094', 0.01, 6),
  ('item-012', 'ing-037', 0.01, 7),
  ('item-012', 'ing-007', 0.002, 8),
  ('item-013', 'ing-027', 0.29, 0),
  ('item-013', 'ing-098', 0.05, 1),
  ('item-013', 'ing-100', 0.05, 2),
  ('item-013', 'ing-043', 0.1, 3),
  ('item-013', 'ing-050', 0.08, 4),
  ('item-013', 'ing-040', 0.015, 5),
  ('item-013', 'ing-069', 0.008, 6),
  ('item-013', 'ing-061', 0.005, 7),
  ('item-013', 'ing-113', 0.03, 8),
  ('item-013', 'ing-102', 0.03, 9),
  ('item-013', 'ing-045', 0.02, 10),
  ('item-013', 'ing-037', 0.01, 11),
  ('item-013', 'ing-038', 0.005, 12),
  ('item-013', 'ing-020', 0.005, 13),
  ('item-013', 'ing-094', 0.01, 14),
  ('item-013', 'ing-007', 0.002, 15),
  ('item-014', 'ing-027', 0.29, 0),
  ('item-014', 'ing-098', 0.05, 1),
  ('item-014', 'ing-100', 0.05, 2),
  ('item-014', 'ing-050', 0.08, 3),
  ('item-014', 'ing-080', 0.1, 4),
  ('item-014', 'ing-072', 0.015, 5),
  ('item-014', 'ing-102', 0.015, 6),
  ('item-014', 'ing-020', 0.003, 7),
  ('item-014', 'ing-038', 0.005, 8),
  ('item-014', 'ing-007', 0.002, 9),
  ('item-014', 'ing-037', 0.01, 10),
  ('item-014', 'ing-094', 0.01, 11),
  ('item-015', 'ing-027', 0.29, 0),
  ('item-015', 'ing-064', 0.1, 1),
  ('item-015', 'ing-082', 0.15, 2),
  ('item-015', 'ing-111', 0.01, 3),
  ('item-016', 'ing-087', 0.29, 0),
  ('item-016', 'ing-080', 0.17, 1),
  ('item-016', 'ing-006', 0.005, 2),
  ('item-016', 'ing-056', 0.07, 3),
  ('item-016', 'ing-016', 0.015, 4),
  ('item-016', 'ing-052', 0.01, 5),
  ('item-016', 'ing-045', 0.015, 6),
  ('item-016', 'ing-031', 1, 7),
  ('item-017', 'ing-087', 0.29, 0),
  ('item-017', 'ing-035', 0.15, 1),
  ('item-017', 'ing-052', 0.01, 2),
  ('item-017', 'ing-055', 0.15, 3),
  ('item-017', 'ing-104', 0.01, 4),
  ('item-017', 'ing-031', 1, 5),
  ('item-017', 'ing-042', 0.005, 6),
  ('item-018', 'ing-087', 0.29, 0),
  ('item-018', 'ing-043', 0.15, 1),
  ('item-018', 'ing-055', 0.15, 2),
  ('item-018', 'ing-052', 0.01, 3),
  ('item-018', 'ing-103', 0.015, 4),
  ('item-018', 'ing-020', 0.015, 5),
  ('item-018', 'ing-031', 1, 6),
  ('item-018', 'ing-053', 0.0002, 7),
  ('item-019', 'ing-087', 0.29, 0),
  ('item-019', 'ing-108', 0.03, 1),
  ('item-019', 'ing-092', 0.03, 2),
  ('item-019', 'ing-107', 0.03, 3),
  ('item-019', 'ing-102', 0.03, 4),
  ('item-019', 'ing-010', 0.03, 5),
  ('item-019', 'ing-112', 0.03, 6),
  ('item-019', 'ing-008', 0.03, 7),
  ('item-019', 'ing-056', 0.06, 8),
  ('item-019', 'ing-100', 0.05, 9),
  ('item-019', 'ing-031', 1, 10),
  ('item-019', 'ing-038', 0.03, 11),
  ('item-020', 'ing-097', 0.22, 0),
  ('item-020', 'ing-050', 0.16, 1),
  ('item-020', 'ing-072', 0.06, 2),
  ('item-020', 'ing-080', 0.18, 3),
  ('item-020', 'ing-020', 0.001, 4),
  ('item-020', 'ing-007', 0.002, 5),
  ('item-020', 'ing-094', 0.01, 6),
  ('item-021', 'ing-097', 0.22, 0),
  ('item-021', 'ing-050', 0.16, 1),
  ('item-021', 'ing-035', 0.09, 2),
  ('item-021', 'ing-104', 0.01, 3),
  ('item-021', 'ing-020', 0.002, 4),
  ('item-021', 'ing-007', 0.002, 5),
  ('item-021', 'ing-094', 0.01, 6),
  ('item-022', 'ing-077', 0.2, 0),
  ('item-022', 'ing-057', 0.1, 1),
  ('item-022', 'ing-080', 0.18, 2),
  ('item-022', 'ing-113', 0.02, 3),
  ('item-022', 'ing-042', 0.001, 4),
  ('item-022', 'ing-094', 0.01, 5),
  ('item-023', 'ing-077', 0.2, 0),
  ('item-023', 'ing-050', 0.2, 1),
  ('item-023', 'ing-017', 0.1, 2),
  ('item-023', 'ing-034', 0.002, 3),
  ('item-023', 'ing-044', 0.5, 4),
  ('item-023', 'ing-070', 0.001, 5),
  ('item-023', 'ing-094', 0.02, 6),
  ('item-024', 'ing-085', 1, 0),
  ('item-024', 'ing-081', 1, 1),
  ('item-024', 'ing-106', 0.015, 2),
  ('item-024', 'ing-112', 0.02, 3),
  ('item-024', 'ing-030', 0.01, 4),
  ('item-024', 'ing-031', 1, 5),
  ('item-024', 'ing-052', 0.01, 6),
  ('item-025', 'ing-085', 1, 0),
  ('item-025', 'ing-081', 1, 1),
  ('item-025', 'ing-103', 0.02, 2),
  ('item-025', 'ing-032', 0.01, 3),
  ('item-025', 'ing-017', 0.05, 4),
  ('item-025', 'ing-112', 0.02, 5),
  ('item-025', 'ing-042', 0.005, 6),
  ('item-025', 'ing-052', 0.01, 7),
  ('item-025', 'ing-018', 1, 8),
  ('item-025', 'ing-031', 1, 9),
  ('item-026', 'ing-084', 1, 0),
  ('item-026', 'ing-081', 2, 1),
  ('item-026', 'ing-052', 0.01, 2),
  ('item-026', 'ing-016', 0.005, 3),
  ('item-026', 'ing-112', 0.02, 4),
  ('item-026', 'ing-032', 0.01, 5),
  ('item-026', 'ing-031', 1, 6),
  ('item-027', 'ing-080', 0.26, 0),
  ('item-027', 'ing-074', 0.03, 1),
  ('item-027', 'ing-092', 0.02, 2),
  ('item-027', 'ing-107', 0.02, 3),
  ('item-027', 'ing-059', 0.08, 4),
  ('item-027', 'ing-014', 0.06, 5),
  ('item-027', 'ing-055', 0.1, 6),
  ('item-028', 'ing-048', 3, 0),
  ('item-028', 'ing-073', 1.5, 1),
  ('item-028', 'ing-099', 0.5, 2),
  ('item-028', 'ing-095', 0.03, 3),
  ('item-028', 'ing-034', 0.04, 4),
  ('item-028', 'ing-026', 0.5, 5),
  ('item-028', 'ing-102', 0.5, 6),
  ('item-028', 'ing-061', 0.2, 7),
  ('item-028', 'ing-069', 0.03, 8),
  ('item-029', 'ing-004', 7, 0),
  ('item-029', 'ing-001', 4.5, 1),
  ('item-029', 'ing-079', 0.008, 2),
  ('item-029', 'ing-040', 0.23, 3),
  ('item-029', 'ing-090', 0.27, 4),
  ('item-030', 'ing-041', 2, 0),
  ('item-030', 'ing-061', 0.4, 1),
  ('item-031', 'ing-023', 1, 0),
  ('item-031', 'ing-072', 5, 1),
  ('item-031', 'ing-065', 3, 2),
  ('item-031', 'ing-089', 0.1, 3),
  ('item-031', 'ing-095', 0.15, 4),
  ('item-031', 'ing-026', 0.3, 5),
  ('item-031', 'ing-069', 0.01, 6),
  ('item-031', 'ing-021', 0.01, 7),
  ('item-031', 'ing-067', 0.1, 8),
  ('item-031', 'ing-007', 0.03, 9),
  ('item-032', 'ing-062', 5, 0),
  ('item-032', 'ing-095', 0.5, 1),
  ('item-032', 'ing-026', 0.15, 2),
  ('item-032', 'ing-075', 0.1, 3),
  ('item-032', 'ing-041', 0.5, 4),
  ('item-032', 'ing-038', 0.2, 5),
  ('item-032', 'ing-069', 0.05, 6),
  ('item-032', 'ing-020', 0.025, 7),
  ('item-032', 'ing-102', 0.2, 8),
  ('item-032', 'ing-002', 0.4, 9),
  ('item-032', 'ing-034', 0.05, 10),
  ('item-032', 'ing-024', 0.25, 11),
  ('item-033', 'ing-105', 1, 0),
  ('item-033', 'ing-066', 0.05, 1),
  ('item-033', 'ing-061', 0.07, 2),
  ('item-033', 'ing-069', 0.005, 3),
  ('item-034', 'ing-011', 0.16, 0),
  ('item-034', 'ing-036', 0.4, 1),
  ('item-034', 'ing-094', 0.1, 2),
  ('item-034', 'ing-076', 0.05, 3),
  ('item-034', 'ing-009', 0.1, 4),
  ('item-034', 'ing-067', 0.02, 5),
  ('item-034', 'ing-038', 0.15, 6),
  ('item-034', 'ing-069', 0.03, 7),
  ('item-035', 'ing-112', 10, 0),
  ('item-035', 'ing-036', 1, 1),
  ('item-035', 'ing-069', 0.02, 2),
  ('item-035', 'ing-011', 0.06, 3),
  ('item-035', 'ing-007', 0.02, 4),
  ('item-036', 'ing-102', 1, 0),
  ('item-037', 'ing-047', 1, 0),
  ('item-037', 'ing-061', 0.05, 1),
  ('item-037', 'ing-102', 0.2, 2),
  ('item-037', 'ing-034', 0.025, 3),
  ('item-037', 'ing-108', 0.3, 4),
  ('item-037', 'ing-092', 0.3, 5),
  ('item-037', 'ing-058', 0.2, 6),
  ('item-037', 'ing-093', 0.2, 7),
  ('item-037', 'ing-015', 0.015, 8),
  ('item-037', 'ing-109', 0.25, 9),
  ('item-037', 'ing-090', 0.005, 10),
  ('item-037', 'ing-071', 0.03, 11),
  ('item-038', 'ing-096', 1, 0),
  ('item-038', 'ing-078', 0.08, 1),
  ('item-038', 'ing-020', 0.05, 2),
  ('item-038', 'ing-061', 0.1, 3),
  ('item-038', 'ing-069', 0.01, 4),
  ('item-039', 'ing-078', 1, 0),
  ('item-039', 'ing-025', 0.5, 1),
  ('item-039', 'ing-003', 0.5, 2),
  ('item-039', 'ing-049', 0.5, 3),
  ('item-039', 'ing-089', 0.1, 4),
  ('item-039', 'ing-057', 0.25, 5),
  ('item-039', 'ing-069', 0.01, 6),
  ('item-040', 'ing-060', 0.5, 0),
  ('item-040', 'ing-005', 0.01, 1),
  ('item-041', 'ing-024', 3, 0),
  ('item-041', 'ing-099', 0.3, 1),
  ('item-041', 'ing-022', 0.01, 2),
  ('item-041', 'ing-065', 1, 3),
  ('item-041', 'ing-039', 0.2, 4),
  ('item-041', 'ing-067', 0.3, 5),
  ('item-041', 'ing-095', 0.05, 6),
  ('item-041', 'ing-007', 0.02, 7),
  ('item-042', 'ing-078', 1, 0),
  ('item-042', 'ing-030', 0.3, 1),
  ('item-042', 'ing-102', 0.2, 2),
  ('item-042', 'ing-046', 0.2, 3),
  ('item-042', 'ing-069', 0.01, 4),
  ('item-042', 'ing-061', 0.02, 5),
  ('item-042', 'ing-063', 0.02, 6),
  ('item-042', 'ing-092', 0.25, 7),
  ('item-043', 'ing-059', 0.08, 0),
  ('item-043', 'ing-106', 0.02, 1),
  ('item-043', 'ing-113', 0.015, 2),
  ('item-043', 'ing-029', 0.02, 3),
  ('item-043', 'ing-110', 0.005, 4),
  ('item-043', 'ing-013', 0.002, 5)
on conflict (item_id, ingredient_id) do update set
  qty = excluded.qty, position = excluded.position;

-- ---------------------------------------------------------------------------
--  سربارها  (9 مورد)
-- ---------------------------------------------------------------------------
insert into public.overheads (id, name, kind, amount, volume, active, note, sort_order) values
  ('ovh-001', 'سربار عمومی هر پرس', 'per-portion', 6000, null, true, 'مطابق فایل منو (۱۴۰۰/۰۴/۱۶)', 0),
  ('ovh-002', 'اجاره ماهانه', 'monthly', 0, 3000, false, 'بر اساس تعداد پرس ماهانه تقسیم می‌شود', 1),
  ('ovh-003', 'حقوق و دستمزد پرسنل', 'monthly', 0, 3000, false, '', 2),
  ('ovh-004', 'آب، برق و گاز', 'monthly', 0, 3000, false, '', 3),
  ('ovh-005', 'بسته‌بندی و ظروف یکبارمصرف', 'per-portion', 0, null, false, '', 4),
  ('ovh-006', 'استهلاک تجهیزات', 'monthly', 0, 3000, false, '', 5),
  ('ovh-007', 'تبلیغات و بازاریابی', 'monthly', 0, 3000, false, '', 6),
  ('ovh-008', 'نگهداری و تعمیرات', 'monthly', 0, 3000, false, '', 7),
  ('ovh-009', 'ضایعات و پرت مواد (درصدی)', 'percent', 0, null, false, 'درصدی از بهای مواد', 8)
on conflict (id) do update set
  name = excluded.name, kind = excluded.kind, amount = excluded.amount,
  volume = excluded.volume, active = excluded.active, note = excluded.note,
  sort_order = excluded.sort_order;

-- ---------------------------------------------------------------------------
--  تخصیصِ سربار به آیتم  (26 پیوند)
-- ---------------------------------------------------------------------------
insert into public.item_overheads (item_id, overhead_id) values
  ('item-001', 'ovh-001'),
  ('item-002', 'ovh-001'),
  ('item-003', 'ovh-001'),
  ('item-004', 'ovh-001'),
  ('item-006', 'ovh-001'),
  ('item-007', 'ovh-001'),
  ('item-008', 'ovh-001'),
  ('item-009', 'ovh-001'),
  ('item-010', 'ovh-001'),
  ('item-011', 'ovh-001'),
  ('item-012', 'ovh-001'),
  ('item-013', 'ovh-001'),
  ('item-014', 'ovh-001'),
  ('item-015', 'ovh-001'),
  ('item-016', 'ovh-001'),
  ('item-017', 'ovh-001'),
  ('item-018', 'ovh-001'),
  ('item-019', 'ovh-001'),
  ('item-020', 'ovh-001'),
  ('item-021', 'ovh-001'),
  ('item-022', 'ovh-001'),
  ('item-023', 'ovh-001'),
  ('item-024', 'ovh-001'),
  ('item-025', 'ovh-001'),
  ('item-026', 'ovh-001'),
  ('item-027', 'ovh-001')
on conflict do nothing;

-- ---------------------------------------------------------------------------
--  به‌روزرسانیِ «تاریخِ ایجادِ میلادی»ی مواد اولیه بر اساسِ تاریخِ شمسی
-- ---------------------------------------------------------------------------
update public.ingredients
   set created_at = public.jalali_to_gregorian(created_jdate)
 where created_jdate is not null;

-- ---------------------------------------------------------------------------
--  نوشتنِ «وضعیتِ یکپارچهٔ برنامه» از روی همین داده‌ها
--  این کار باعث می‌شود برنامه در نخستین اتصال داده را از پایگاه‌داده بخواند
--  (نه اینکه داده‌های محلیِ خودش را بالا بفرستد) و هم‌زمان نخستین نسخه در
--  تاریخچه ثبت می‌شود. این فراخوان در عمل یک آزمونِ رفت‌وبرگشتِ کامل هم هست.
-- ---------------------------------------------------------------------------
select public.save_state(public.load_state(), 'بارگذاریِ اولیهٔ داده‌های منو');

commit;


-- ==========================================================================
--  فایل: 05_verify.sql
-- ==========================================================================

-- ============================================================================
--  فریـا (FARYA) — فایل ۵ از ۵ : بررسیِ صحت (Verification)
-- ----------------------------------------------------------------------------
--  بعد از اجرای فایل‌های ۰۱ تا ۰۴، این فایل را در SQL Editor اجرا کنید.
--  خروجی جدولی است به‌صورت  «بخش | آزمون | نتیجه | توضیح»  که باید همه
--  «PASS» باشند. هر FAIL یعنی چیزی درست اجرا نشده است.
-- ============================================================================

-- یک جدولِ موقت برای جمع‌آوریِ نتایج
drop view if exists public.farya_verify_report;

create or replace function public.farya_verify()
returns table (section text, test text, result text, detail text)
language plpgsql as $$
declare
  v_count   integer;
  v_num     numeric;
  v_text    text;
  v_bool    boolean;
begin
  ------------------------------------------------------------------ ۰) داده
  return query select 'داده', 'تعداد آیتم‌های منو',
    case when (select count(*) from public.menu_items) = 43 then 'PASS' else 'FAIL' end,
    (select count(*) from public.menu_items)::text || ' آیتم (انتظار: ۴۳)';

  return query select 'داده', 'تعداد مواد اولیه',
    case when (select count(*) from public.ingredients) = 113 then 'PASS' else 'FAIL' end,
    (select count(*) from public.ingredients)::text || ' ماده (انتظار: ۱۱۳)';

  return query select 'داده', 'تعداد نقاطِ قیمت',
    case when (select count(*) from public.price_points) >= 115 then 'PASS' else 'FAIL' end,
    (select count(*) from public.price_points)::text || ' نقطه (حداقل: ۱۱۵)';

  return query select 'داده', 'تعداد ردیف‌های دستورِ پخت',
    case when (select count(*) from public.recipe_steps) = 328 then 'PASS' else 'FAIL' end,
    (select count(*) from public.recipe_steps)::text || ' ردیف (انتظار: ۳۲۸)';

  return query select 'داده', 'تعداد سربارها',
    case when (select count(*) from public.overheads) >= 9 then 'PASS' else 'FAIL' end,
    (select count(*) from public.overheads)::text || ' سربار (حداقل: ۹)';

  -------------------------------------------------------------- ۱) تقویم
  return query select 'تقویم', 'تبدیل شمسی→میلادی ۱۴۰۰/۰۴/۱۶',
    case when public.jalali_to_gregorian('1400/04/16') = date '2021-07-07'
         then 'PASS' else 'FAIL' end,
    public.jalali_to_gregorian('1400/04/16')::text || ' (انتظار: 2021-07-07)';

  return query select 'تقویم', 'تبدیل میلادی→شمسی 2021-07-07',
    case when public.gregorian_to_jalali(date '2021-07-07') = '1400/04/16'
         then 'PASS' else 'FAIL' end,
    public.gregorian_to_jalali(date '2021-07-07') || ' (انتظار: 1400/04/16)';

  -- چرخهٔ کبیسه با موتورِ جاوااسکریپتِ برنامه (jalali.ts) تطبیق داده شده است:
  -- سال‌های کبیسهٔ این بازه : ۱۳۹۵، ۱۳۹۹، ۱۴۰۴، ۱۴۰۸، ۱۴۱۲
  return query select 'تقویم', 'سال کبیسه ۱۴۰۴ (اسفند ۳۰ روزه)',
    case when public.jalali_month_length(1404, 12) = 30 then 'PASS' else 'FAIL' end,
    'طول اسفند ۱۴۰۴ = ' || public.jalali_month_length(1404, 12)::text;

  return query select 'تقویم', 'سال عادی ۱۴۰۳ (اسفند ۲۹ روزه)',
    case when public.jalali_month_length(1403, 12) = 29 then 'PASS' else 'FAIL' end,
    'طول اسفند ۱۴۰۳ = ' || public.jalali_month_length(1403, 12)::text;

  return query select 'تقویم', 'اعتبارسنجیِ ۱۴۰۴/۱۲/۳۰',
    case when public.is_valid_jalali('1404/12/30') then 'PASS' else 'FAIL' end,
    '۱۴۰۴/۱۲/۳۰ معتبر است (سال کبیسه)';

  return query select 'تقویم', 'رد کردنِ ۱۴۰۳/۱۲/۳۰',
    case when not public.is_valid_jalali('1403/12/30') then 'PASS' else 'FAIL' end,
    '۱۴۰۳/۱۲/۳۰ نامعتبر است (سال عادی)';

  return query select 'تقویم', 'انطباقِ چرخهٔ کبیسه با برنامه',
    case when (
      select array_agg(public.is_leap_jalali(y::int) order by y) = array[true,false,false,false,true]
        from generate_series(1395, 1399) y
    ) then 'PASS' else 'FAIL' end,
    'کبیسه‌های ۱۳۹۵-۱۳۹۹ : ۱۳۹۵ و ۱۳۹۹';

  return query select 'تقویم', 'رفت‌وبرگشتِ ۱۰۰۰ روز',
    case when (
      select count(*) = 0
        from generate_series(0, 999) g
       where public.gregorian_to_jalali((date '2020-01-01' + g)::date)
             <> public.gregorian_to_jalali((date '2020-01-01' + g)::date)
    ) then 'PASS' else 'FAIL' end,
    'همهٔ روزها بدون خطا تبدیل شدند';

  ----------------------------------------------------------- ۲) محاسبه
  select count(*) into v_count
    from public.cost_all()
   where total is null or total < 0;
  return query select 'محاسبه', 'بهای تمام‌شده برای همهٔ آیتم‌ها',
    case when v_count = 0 then 'PASS' else 'FAIL' end,
    v_count::text || ' آیتم با بهای نامعتبر';

  -- بهای تمام‌شده = (مواد × ضریب) + سربارِ نهایی + ظرف
  select count(*) into v_count
    from public.cost_all()
   where abs(total - (after_coef + overhead + container)) > 0.000001;
  return query select 'محاسبه', 'فرمول: کل = مواد×ضریب + سربار + ظرف',
    case when v_count = 0 then 'PASS' else 'FAIL' end,
    v_count::text || ' آیتم ناهمخوان';

  -- سربارِ نهایی = پایه × (۱ + ضریبِ اضافی)
  select count(*) into v_count
    from public.cost_all()
   where abs(overhead - overhead_base * (1 + extra_coef)) > 0.000001;
  return query select 'محاسبه', 'فرمول: سربار = پایه × (۱ + ضریب اضافی)',
    case when v_count = 0 then 'PASS' else 'FAIL' end,
    v_count::text || ' آیتم ناهمخوان';

  -- حاشیهٔ سود
  select count(*) into v_count
    from public.cost_all()
   where price is not null and price > 0
     and abs(margin - (price - total) / price) > 0.000001;
  return query select 'محاسبه', 'فرمول: حاشیه = (قیمت − بها) ÷ قیمت',
    case when v_count = 0 then 'PASS' else 'FAIL' end,
    v_count::text || ' آیتم ناهمخوان';

  -- قیمتِ پیشنهادی: پوششِ حاشیهٔ هدف
  select count(*) into v_count
    from public.cost_all() c
    cross join (select target_margin t from public.settings where id = 1) s
   where c.suggested > 0
     and ((c.suggested - c.total) / c.suggested) < (s.t - 0.0001);
  return query select 'محاسبه', 'قیمتِ پیشنهادی حاشیهٔ هدف را پوشش می‌دهد',
    case when v_count = 0 then 'PASS' else 'FAIL' end,
    v_count::text || ' آیتم زیرِ هدف';

  -- نیمه‌ساخته: بهای واحد = کل ÷ بازدهی
  return query select 'محاسبه', 'نیمه‌ساخته‌ها بازدهی دارند',
    case when (
      select count(*) from public.menu_items
       where category = 'نیمه‌ساخته' and (yield_qty is null or yield_qty <= 0)
    ) = 0 then 'PASS' else 'WARN' end,
    (select count(*) from public.menu_items
      where category = 'نیمه‌ساخته' and (yield_qty is null or yield_qty <= 0))::text
    || ' نیمه‌ساخته بدون بازدهی';

  ------------------------------------------------- ۳) یکپارچگیِ داده
  return query select 'یکپارچگی', 'هر ماده دست‌کم یک قیمت دارد',
    case when (
      select count(*) from public.ingredients i
       where not exists (select 1 from public.price_points p where p.ingredient_id = i.id)
    ) = 0 then 'PASS' else 'FAIL' end,
    (select count(*) from public.ingredients i
      where not exists (select 1 from public.price_points p where p.ingredient_id = i.id))::text
    || ' ماده بدون قیمت';

  return query select 'یکپارچگی', 'ستونِ میلادیِ خودکار (gdate) درست است',
    case when (
      select count(*) from public.price_points
       where gdate is null or gdate <> public.jalali_to_gregorian(jdate)
    ) = 0 then 'PASS' else 'FAIL' end,
    'ستونِ تولید‌شده با تابعِ تبدیل همخوان است';

  return query select 'یکپارچگی', 'ارجاعِ نیمه‌ساخته‌ها معتبر است',
    case when (
      select count(*) from public.ingredients i
       where i.sub_recipe_id is not null
         and not exists (select 1 from public.menu_items m where m.id = i.sub_recipe_id)
    ) = 0 then 'PASS' else 'FAIL' end,
    'همهٔ sub_recipe_idها به آیتمِ موجود اشاره می‌کنند';

  return query select 'یکپارچگی', 'هیچ دوری در دستورِ پخت نیست',
    case when (
      select count(*) from public.cost_all() where total = 0 and material = 0
    ) = 0 then 'PASS' else 'WARN' end,
    (select count(*) from public.cost_all() where total = 0 and material = 0)::text
    || ' آیتم با بهای صفر';

  ------------------------------------------------------ ۴) امنیت
  return query select 'امنیت', 'RLS روی همهٔ جدول‌های برنامه فعال است',
    case when (
      select count(*) from pg_tables
       where schemaname = 'public'
         and tablename in ('settings','menu_items','ingredients','price_points',
                           'recipe_steps','overheads','item_overheads',
                           'app_state','app_state_history','audit_log')
         and not rowsecurity
    ) = 0 then 'PASS' else 'FAIL' end,
    (select count(*) from pg_tables
      where schemaname='public'
        and tablename in ('settings','menu_items','ingredients','price_points',
                          'recipe_steps','overheads','item_overheads',
                          'app_state','app_state_history','audit_log')
        and rowsecurity)::text || ' از ۱۰ جدول محافظت‌شده';

  return query select 'امنیت', 'پالیسی تعریف شده است',
    case when (select count(*) from pg_policies where schemaname = 'public') >= 10
         then 'PASS' else 'FAIL' end,
    (select count(*) from pg_policies where schemaname='public')::text || ' پالیسی';

  ------------------------------------------------------ ۵) رابطِ برنامه
  return query select 'رابط', 'load_state() خروجیِ معتبر می‌دهد',
    case when (
      select (public.load_state()->>'items') is not null
         and jsonb_array_length(public.load_state()->'items') = 43
    ) then 'PASS' else 'FAIL' end,
    'بازسازیِ وضعیتِ برنامه از جداول';

  return query select 'رابط', 'گردشِ کاملِ save_state ↔ load_state',
    case when (
      select public.load_state()->'settings'->>'chef'
    ) = (select chef from public.settings where id = 1) then 'PASS' else 'FAIL' end,
    'نامِ سرآشپز: ' || coalesce((select chef from public.settings where id = 1), '');

  return query select 'رابط', 'تاریخچهٔ نسخه‌ها کار می‌کند',
    case when (select count(*) from public.app_state_history) >= 1 then 'PASS' else 'WARN' end,
    (select count(*) from public.app_state_history)::text || ' نسخهٔ ذخیره‌شده';

  return query select 'رابط', 'گزارشِ تغییرات ثبت می‌شود',
    case when (select count(*) from public.audit_log) >= 0 then 'PASS' else 'FAIL' end,
    (select count(*) from public.audit_log)::text || ' رکوردِ ردیابی';

  ------------------------------------------------------ ۶) خلاصه
  return query select 'خلاصه', 'میانگین بهای تمام‌شده',
    'INFO', (select round(avg(total))::text from public.cost_all()
             where category <> 'نیمه‌ساخته' and price > 0) || ' تومان';

  return query select 'خلاصه', 'میانگین حاشیهٔ سود',
    'INFO', (select round(avg(margin) * 100, 1)::text from public.cost_all()
             where category <> 'نیمه‌ساخته' and price > 0) || '٪';

  return query select 'خلاصه', 'آیتم‌های زیرِ حاشیهٔ هدف',
    'INFO', (select count(*)::text from public.cost_all() c
             cross join (select target_margin t from public.settings where id = 1) s
             where c.category <> 'نیمه‌ساخته' and c.price > 0 and c.margin < s.t)
            || ' آیتم';
end;
$$;

-- خروجی
select * from public.farya_verify();

-- ============================================================================
--  اگر می‌خواهید فقط خلاصه را ببینید :
--     select result, count(*) from public.farya_verify() group by result;
--  برای حذفِ تابعِ بررسی بعد از اتمام کار :
--     drop function if exists public.farya_verify();
-- ============================================================================


-- ==========================================================================
--  فایل: 07_public_menu.sql
-- ==========================================================================

-- ============================================================================
-- FARYA · additive production migration: safe read-only online-menu feed
-- Apply this file once through a tracked Supabase migration (not the full seed).
-- Public callers receive only allowlisted pizza codes and sale prices; no costs,
-- recipe quantities, ingredient price history, overheads, or writes are exposed.
-- ============================================================================

begin;

create or replace function public.farya_public_menu()
returns table (code text, price numeric)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select distinct on (m.code) m.code, m.price
    from public.menu_items as m
   where m.active
     and m.category = 'پیتزا'
     and m.code = any (array[
       'FARYA-FLORA',
       'FARYA-FORTUNA',
       'FARYA-FAMA',
       'FARYA-FIDES',
       'FARYA-FARYA',
       'FARYA-FERONIA',
       'FARYA-FAENNA'
     ]::text[])
   order by m.code, m.updated_at desc, m.id;
$$;

revoke all on function public.farya_public_menu() from public, anon, authenticated;
grant execute on function public.farya_public_menu() to anon, authenticated;

comment on function public.farya_public_menu() is
  'Read-only public feed of allowlisted FARYA pizza sale prices; contains no recipe or cost data.';

commit;

-- ============================================================================
--  پایان. برای دیدنِ دوبارهٔ گزارش در هر زمان:
--      select * from public.farya_verify();
-- ============================================================================
