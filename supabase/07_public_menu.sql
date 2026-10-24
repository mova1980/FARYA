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
