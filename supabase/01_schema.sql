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
  restaurant_phone    text         not null default '',
  restaurant_address  text         not null default '',
  taxpayer_id         text         not null default '',
  economic_code       text         not null default '',
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
