-- FARYA | Persistent menu-item images and date-filtered reporting API
-- REQUIRES: 10_operations_inventory_sales.sql and 11_pos_invoices_cash_finance.sql.
-- STAGING FIRST. This migration is supplied for the project owner to review/apply.
-- DO NOT execute it from the app or against production without separate approval.
-- Images are stored as durable objects in Supabase Storage; their object path,
-- MIME type and size are stored in this database table. The image bytes are not
-- placed in PostgreSQL rows (better for database size, backup and delivery).

begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('farya-menu-images','farya-menu-images',true,8388608,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  name=excluded.name,
  public=true,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists farya_menu_images_authenticated_insert on storage.objects;
create policy farya_menu_images_authenticated_insert on storage.objects
  for insert to authenticated with check (bucket_id='farya-menu-images');
drop policy if exists farya_menu_images_authenticated_update on storage.objects;
create policy farya_menu_images_authenticated_update on storage.objects
  for update to authenticated using (bucket_id='farya-menu-images') with check (bucket_id='farya-menu-images');
drop policy if exists farya_menu_images_authenticated_delete on storage.objects;
create policy farya_menu_images_authenticated_delete on storage.objects
  for delete to authenticated using (bucket_id='farya-menu-images');

create table if not exists public.farya_menu_item_images (
  item_id text primary key,
  object_path text not null unique,
  content_type text not null check (content_type in ('image/jpeg','image/png','image/webp')),
  size_bytes bigint not null check (size_bytes between 1 and 8388608),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table public.farya_menu_item_images enable row level security;
drop policy if exists farya_menu_item_images_authenticated_read on public.farya_menu_item_images;
create policy farya_menu_item_images_authenticated_read on public.farya_menu_item_images
  for select to authenticated using (true);
drop policy if exists farya_menu_item_images_authenticated_insert on public.farya_menu_item_images;
create policy farya_menu_item_images_authenticated_insert on public.farya_menu_item_images
  for insert to authenticated with check (auth.uid() is not null);
drop policy if exists farya_menu_item_images_authenticated_update on public.farya_menu_item_images;
create policy farya_menu_item_images_authenticated_update on public.farya_menu_item_images
  for update to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
drop policy if exists farya_menu_item_images_authenticated_delete on public.farya_menu_item_images;
create policy farya_menu_item_images_authenticated_delete on public.farya_menu_item_images
  for delete to authenticated using (auth.uid() is not null);
revoke all on public.farya_menu_item_images from anon, public;
grant select,insert,update,delete on public.farya_menu_item_images to authenticated;

create or replace function public.farya_inventory_report(p_from date default null,p_to date default null)
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
    'from',v_from,
    'to',v_to,
    'balances',coalesce((select jsonb_agg(jsonb_build_object(
      'item_id',b.item_id,'name',b.name,'item_kind',b.item_kind,'base_unit',b.base_unit,
      'on_hand_qty',b.on_hand_qty,'stock_value',b.stock_value,
      'weighted_avg_unit_cost',b.weighted_avg_unit_cost,'reorder_point',b.reorder_point,'active',b.active
    ) order by b.name) from public.farya_inventory_balances b
      where b.active or abs(b.on_hand_qty)>0.000001),'[]'::jsonb),
    'transactions',coalesce((select jsonb_agg(jsonb_build_object(
      'id',t.id,'item_id',t.item_id,'item_name',i.name,'item_kind',i.item_kind,
      'base_unit',i.base_unit,'txn_type',t.txn_type,'qty_delta',t.qty_delta,
      'value_delta',t.value_delta,'occurred_at',t.occurred_at,'reference_type',t.reference_type,
      'reference_id',t.reference_id,'note',t.note
    ) order by t.occurred_at desc) from public.farya_inventory_transactions t
      join public.farya_inventory_items i on i.id=t.item_id
      where (t.occurred_at at time zone 'Asia/Tehran')::date between v_from and v_to),'[]'::jsonb),
    'expenses',coalesce((select jsonb_agg(jsonb_build_object(
      'id',e.id,'occurred_at',e.occurred_at,'category',e.category,'amount',e.amount,
      'payment_method',e.payment_method,'note',e.note
    ) order by e.occurred_at desc) from public.farya_operating_expenses e
      where (e.occurred_at at time zone 'Asia/Tehran')::date between v_from and v_to),'[]'::jsonb)
  ) into v_result;
  return v_result;
end $$;
revoke all on function public.farya_inventory_report(date,date) from public,anon;
grant execute on function public.farya_inventory_report(date,date) to authenticated;

commit;
