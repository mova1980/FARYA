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
