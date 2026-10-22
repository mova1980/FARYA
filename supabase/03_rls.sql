-- ============================================================================
--  فریـا (FARYA) — فایل ۳ از ۵ : امنیت (RLS)، دسترسی‌ها، لحظه‌ای (Realtime)
--                                و ردیابیِ تغییرات
-- ----------------------------------------------------------------------------
--  ⚠️  پیش‌فرضِ این فایل «باز» است تا برنامه بلافاصله بعد از اجرا کار کند
--      (برنامه هنوز ورود/ثبت‌نام ندارد و با کلیدِ anon کار می‌کند).
--      اگر بعداً Supabase Auth را فعال کردید، بخشِ «حالتِ قفل‌شده» را که
--      در انتهای همین فایل است فعال کنید و پالیسی‌های باز را حذف نمایید.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
--  ۱) فعال‌سازیِ Row Level Security
-- ---------------------------------------------------------------------------
alter table public.settings          enable row level security;
alter table public.menu_items        enable row level security;
alter table public.ingredients       enable row level security;
alter table public.price_points      enable row level security;
alter table public.recipe_steps      enable row level security;
alter table public.overheads         enable row level security;
alter table public.item_overheads    enable row level security;
alter table public.app_state         enable row level security;
alter table public.app_state_history enable row level security;
alter table public.audit_log         enable row level security;

-- ---------------------------------------------------------------------------
--  ۲) حذفِ پالیسی‌های قبلی (اجرای دوبارهٔ فایل بی‌خطر باشد)
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'settings','menu_items','ingredients','price_points','recipe_steps',
    'overheads','item_overheads','app_state','app_state_history','audit_log']
  loop
    execute format('drop policy if exists p_%s_all on public.%I', t, t);
    execute format('drop policy if exists p_%s_read on public.%I', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
--  ۳) پالیسیِ باز (مناسبِ اجرای اولیه با کلیدِ anon)
-- ---------------------------------------------------------------------------
--  نقش‌های anon و authenticated در Supabase وجود دارند؛ در نصب‌های محلی ممکن
--  است نباشند — در این صورت پالیسی برای کاربرِ جاری ساخته می‌شود تا فایل در
--  هر دو محیط بدون خطا اجرا شود.
-- ---------------------------------------------------------------------------
do $$
declare
  t     text;
  roles text;
begin
  select string_agg(rolname, ', ') into roles
    from pg_roles
   where rolname in ('anon', 'authenticated');

  if roles is null then
    roles := current_user;
    raise notice 'نقش‌های anon/authenticated یافت نشد؛ پالیسی‌ها برای کاربر % ساخته می‌شوند', roles;
  end if;

  foreach t in array array[
    'settings','menu_items','ingredients','price_points','recipe_steps',
    'overheads','item_overheads','app_state','app_state_history','audit_log']
  loop
    execute format($f$
      create policy p_%s_all on public.%I
        for all
        to %s
        using (true)
        with check (true);
    $f$, t, t, roles);

    execute format('grant select, insert, update, delete on public.%I to %s', t, roles);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
--  ۴) دسترسی‌های صریح
-- ---------------------------------------------------------------------------
do $$
declare
  roles text;
begin
  select string_agg(rolname, ', ') into roles
    from pg_roles where rolname in ('anon', 'authenticated');

  if roles is null then
    roles := current_user;
  end if;

  execute format('grant usage, select on all sequences in schema public to %s', roles);
  execute format('grant execute on all functions in schema public to %s', roles);
end $$;

-- ---------------------------------------------------------------------------
--  ۵) Realtime — برنامه را از تغییرِ وضعیت در لحظه باخبر می‌کند
--     (اگر انتشارِ supabase_realtime در دسترس نباشد، فقط یک NOTICE می‌دهد)
-- ---------------------------------------------------------------------------
alter table public.app_state replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.app_state;
  raise notice 'publication supabase_realtime: جدول app_state اضافه شد';
exception
  when undefined_object then
    raise notice 'انتشارِ supabase_realtime در این محیط وجود ندارد (در Supabase به‌صورت خودکار هست) — رد شد';
  when duplicate_object then
    raise notice 'جدول app_state قبلاً به انتشار اضافه شده بود';
end $$;

-- ---------------------------------------------------------------------------
--  ۶) ردیابیِ تغییرات — اتصالِ تریگرها به جدول‌ها
-- ---------------------------------------------------------------------------
drop trigger if exists trg_audit_menu_items     on public.menu_items;
create trigger trg_audit_menu_items
  after insert or update or delete on public.menu_items
  for each row execute function public.audit_row();

drop trigger if exists trg_audit_ingredients    on public.ingredients;
create trigger trg_audit_ingredients
  after insert or update or delete on public.ingredients
  for each row execute function public.audit_row();

drop trigger if exists trg_audit_price_points   on public.price_points;
create trigger trg_audit_price_points
  after insert or update or delete on public.price_points
  for each row execute function public.audit_row();

drop trigger if exists trg_audit_overheads      on public.overheads;
create trigger trg_audit_overheads
  after insert or update or delete on public.overheads
  for each row execute function public.audit_row();

-- آیتم‌های منو وقتی از طریق save_state دوباره نوشته می‌شوند، تغییراتِ زیادی
-- تولید می‌کنند؛ برای جلوگیری از انباشته شدنِ بی‌رویه، یک پاک‌سازی تعبیه شده:
create or replace function public.prune_audit_log(p_keep integer default 5000)
returns integer language plpgsql as $$
declare
  v_deleted integer;
begin
  with old as (
    select id from public.audit_log
     order by at desc
     offset p_keep
  )
  delete from public.audit_log a using old o where a.id = o.id;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end $$;

commit;

-- ============================================================================
--  ضمیمه : حالتِ قفل‌شده (اختیاری، بعد از فعال‌سازیِ Supabase Auth)
-- ----------------------------------------------------------------------------
--  اگر می‌خواهید فقط کاربرِ وارد‌شده بتواند بخواند/بنویسد، این بخش را اجرا کنید:
--
--  begin;
--  do $$
--  declare t text;
--  begin
--    foreach t in array array[
--      'settings','menu_items','ingredients','price_points','recipe_steps',
--      'overheads','item_overheads','app_state','app_state_history','audit_log']
--    loop
--      execute format('drop policy if exists p_%s_all on public.%I', t, t);
--      execute format($f$
--        create policy p_%s_all on public.%I
--          for all to authenticated
--          using (true) with check (true);
--      $f$, t, t);
--    end loop;
--  end $$;
--  commit;
--
--  سپس در تنظیماتِ Auth کاربرِ سرآشپز را بسازید و در برنامه وارد شوید.
-- ============================================================================
