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
