import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../lib/store';
import { isPreparationCategory } from '../lib/types';
import { getSupabase, isSupabaseConfigured } from '../lib/supabase';
import { Button, Empty, Field } from '../components/ui';
import { faDigits, num, pct } from '../lib/format';
import { IconRefresh, IconPlus, IconCheck, IconAlert, IconLayers, IconLeaf, IconBolt } from '../components/Icons';
import '../styles/operations.css';

type Tab = 'stock' | 'production' | 'sales' | 'pnl';
type InventoryItem = {
  id: string; ingredient_id: string | null; name: string; item_kind: 'raw' | 'prepared'; base_unit: string;
  on_hand_qty: number | string; stock_value: number | string; weighted_avg_unit_cost: number | string;
  reorder_point: number | string; expiry_warning_days: number; track_expiry: boolean; active: boolean;
};
type InventoryLot = {
  id: string; item_id: string; item_name: string; lot_code: string; remaining_qty: number | string;
  base_unit: string; received_at: string; expires_on: string | null;
};
type InventoryAlert = {
  alert_type: 'expired' | 'expiring' | 'reorder'; item_id: string; name: string; lot_id: string | null;
  qty: number | string; base_unit: string; expires_on: string | null; days_from_expiry: number | null; message: string;
};
type Pnl = {
  business_day: string; units_sold: number | string; net_revenue: number | string; cogs: number | string;
  waste_cost: number | string; operating_expenses: number | string; monthly_fixed: number | string;
  days_in_month: number | string; gross_margin: number | string | null; daily_fixed_overhead: number | string;
  net_profit: number | string; monthly_unit_goal: number | string; daily_unit_goal: number | string;
  daily_revenue_goal: number | string | null; daily_profit_goal: number | string | null; profit_goal_attainment_pct: number | string | null;
  revenue_goal_attainment_pct: number | string | null;
};
type SaleLineSummary = { sale_id: string; sold_at: string; item_name: string; qty: number | string; unit_price: number | string; discount_amount: number | string; net_revenue: number | string; cogs: number | string };
type ExpenseSummary = { id: string; occurred_at: string; category: string; amount: number | string; note: string };
type InventoryTransaction = { id: string; item_id: string; item_name: string; txn_type: string; qty_delta: number | string; base_unit: string; value_delta: number | string; occurred_at: string; note: string };
type OpsSnapshot = { business_day: string; items: InventoryItem[]; lots: InventoryLot[]; alerts: InventoryAlert[]; transactions: InventoryTransaction[]; pnl: Pnl; today_sales: SaleLineSummary[]; today_expenses: ExpenseSummary[]; targets: { monthly_unit_goal: number | string; daily_revenue_goal: number | string | null; daily_profit_goal: number | string | null } | null };
type SaleDraftLine = { menu_item_id: string; qty: string; unit_price: string; discount_amount: string };

const localToday = () => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
};
const localDateTimeISO = (date: string) => new Date(`${date}T12:00:00+03:30`).toISOString();
const n = (value: unknown) => Number(value ?? 0) || 0;
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error || 'خطای ناشناخته');
const money = (value: unknown) => `${num(Math.round(n(value)))} تومان`;
const isExplicitlyFree = (note: string) => /رایگان|بدون\s*هزینه|free/i.test(note || '');
const txnLabels: Record<string, string> = {
  purchase: 'خرید', opening: 'افتتاحیه', preparation_in: 'ورود تولید', preparation_out: 'مصرف تولید',
  sale: 'فروش', waste: 'ضایعات', adjustment_in: 'اصلاح افزایشی', adjustment_out: 'اصلاح کاهشی',
};

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const sb = getSupabase();
  if (!sb) throw new Error('اتصال به دیتابیس تنظیم نشده است.');
  const { data, error } = await sb.rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export default function Operations() {
  const { state, toast } = useStore();
  const [tab, setTab] = useState<Tab>('stock');
  const [day, setDay] = useState(localToday());
  const [snapshot, setSnapshot] = useState<OpsSnapshot | null>(null);
  const targetsLoaded = useRef(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [opening, setOpening] = useState({ itemId: '', qty: '', totalValue: '', expires: '', lot: '', note: '' });
  const [purchase, setPurchase] = useState({ itemId: '', qty: '', totalCost: '', received: localToday(), expires: '', lot: '', note: '' });
  const [adjust, setAdjust] = useState({ itemId: '', delta: '', totalValue: '', expires: '', reason: '', note: '' });
  const [waste, setWaste] = useState({ itemId: '', qty: '', reason: '', note: '' });
  const [production, setProduction] = useState({ itemId: '', batches: '1', output: '', expires: '', lot: '', note: '' });
  const [saleLines, setSaleLines] = useState<SaleDraftLine[]>([{ menu_item_id: '', qty: '1', unit_price: '', discount_amount: '0' }]);
  const [saleNote, setSaleNote] = useState('');
  const [expense, setExpense] = useState({ category: '', amount: '', note: '' });
  const [targets, setTargets] = useState({ monthlyUnits: '1000', dailyRevenue: '', dailyProfit: '' });
  const [settingsItem, setSettingsItem] = useState<InventoryItem | null>(null);
  const [settingsDraft, setSettingsDraft] = useState({ reorder: '0', days: '7', trackExpiry: true });

  const pizzas = useMemo(() => state.items.filter((item) => item.category === 'پیتزا' && item.active), [state.items]);
  const preparations = useMemo(() => state.items.filter((item) => isPreparationCategory(item.category) && item.active), [state.items]);
  const items = snapshot?.items ?? [];
  const activeItem = (id: string) => items.find((item) => item.id === id);

  const refresh = useCallback(async (selectedDay = day) => {
    if (!isSupabaseConfigured) {
      setError('برای فعال‌شدن انبار و سود و زیان، ابتدا migration عملیاتی و متغیرهای امن اتصال به دیتابیس را تنظیم کنید.');
      return;
    }
    setLoading(true);
    try {
      const data = await rpc<OpsSnapshot>('farya_operations_snapshot', { p_day: selectedDay });
      setSnapshot(data);
      setError('');
      if (data.targets && !targetsLoaded.current) {
        targetsLoaded.current = true;
        setTargets({
        monthlyUnits: String(data.targets.monthly_unit_goal ?? ''),
        dailyRevenue: data.targets.daily_revenue_goal == null ? '' : String(data.targets.daily_revenue_goal),
        dailyProfit: data.targets.daily_profit_goal == null ? '' : String(data.targets.daily_profit_goal),
        });
      }
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, [day]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const sb = getSupabase();
    if (!sb) return;
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, 30_000);
    const channel = sb.channel('farya-operations-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'farya_inventory_transactions' }, () => { void refresh(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'farya_inventory_lots' }, () => { void refresh(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'farya_sales' }, () => { void refresh(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'farya_sale_lines' }, () => { void refresh(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'farya_operating_expenses' }, () => { void refresh(); })
      .subscribe();
    return () => { window.clearInterval(interval); void sb.removeChannel(channel); };
  }, [refresh]);

  const run = async (success: string, action: () => Promise<unknown>) => {
    setBusy(true); setError('');
    try {
      await action();
      toast(success, 'ok');
      await refresh();
    } catch (e) {
      const message = errorText(e);
      setError(message);
      toast(message, 'err');
    } finally { setBusy(false); }
  };

  const saveOpening = () => {
    const stock = activeItem(opening.itemId);
    if (!stock || n(opening.qty) <= 0 || n(opening.totalValue) < 0 || opening.totalValue === '') { toast('قلم، مقدار شمارش‌شده و ارزش ریالیِ مستند را وارد کنید.', 'err'); return; }
    if (n(opening.totalValue) === 0 && !isExplicitlyFree(opening.note)) { toast('ارزش صفر را فقط با یادداشت «رایگان/بدون هزینه» ثبت کنید تا هزینهٔ ناقص با کالای رایگان اشتباه نشود.', 'err'); return; }
    if (stock.track_expiry && !opening.expires) { toast('برای این قلم تاریخ انقضا/بچ شمارش‌شده الزامی است.', 'err'); return; }
    void run('موجودی افتتاحیه از شمارش واقعی ثبت شد؛ هیچ مقدار یا قیمتی حدس زده نشد.', async () => {
      await rpc('farya_opening_stock', {
        p_item_id: stock.id, p_base_qty: n(opening.qty), p_total_value: n(opening.totalValue),
        p_expires_on: opening.expires || null, p_lot_code: opening.lot, p_note: opening.note,
      });
      setOpening({ itemId: '', qty: '', totalValue: '', expires: '', lot: '', note: '' });
    });
  };

  const savePurchase = () => {
    const stock = activeItem(purchase.itemId);
    if (!stock) { toast('قلم انبار را انتخاب کنید.', 'err'); return; }
    if (!purchase.received) { toast('تاریخ دریافت را وارد کنید.', 'err'); return; }
    if (n(purchase.qty) <= 0 || purchase.totalCost === '' || n(purchase.totalCost) < 0) { toast('مقدار خرید و مبلغ کلِ مستند را وارد کنید؛ خرید رایگان را صریحاً با صفر ثبت کنید.', 'err'); return; }
    if (n(purchase.totalCost) === 0 && !isExplicitlyFree(purchase.note)) { toast('برای خریدِ صفرهزینه، در یادداشت «رایگان/بدون هزینه» را ثبت کنید.', 'err'); return; }
    if (stock.track_expiry && !purchase.expires) { toast('تاریخ انقضا برای این قلم الزامی است.', 'err'); return; }
    void run('رسید خرید ثبت شد؛ موجودی و ارزش انبار به‌روز شد.', async () => {
      await rpc('farya_receive_stock', {
        p_item_id: stock.id, p_base_qty: n(purchase.qty), p_total_cost: n(purchase.totalCost),
        p_received_at: localDateTimeISO(purchase.received), p_expires_on: purchase.expires || null,
        p_lot_code: purchase.lot, p_note: purchase.note,
      });
      setPurchase({ itemId: '', qty: '', totalCost: '', received: localToday(), expires: '', lot: '', note: '' });
    });
  };

  const saveAdjustment = () => {
    const stock = activeItem(adjust.itemId);
    const delta = Number(adjust.delta);
    if (!stock || !Number.isFinite(delta) || delta === 0 || !adjust.reason.trim()) { toast('قلم، مقدار اصلاح و علت را وارد کنید.', 'err'); return; }
    if (delta > 0 && (adjust.totalValue === '' || n(adjust.totalValue) < 0)) { toast('ارزش کلِ موجودی افزوده‌شده را صریحاً وارد کنید؛ صفر فقط در صورت مستندبودن پذیرفته است.', 'err'); return; }
    if (delta > 0 && n(adjust.totalValue) === 0 && !isExplicitlyFree(`${adjust.reason} ${adjust.note}`)) { toast('برای ارزش صفر، علت/یادداشت باید «رایگان/بدون هزینه» را مشخص کند.', 'err'); return; }
    if (delta > 0 && stock.track_expiry && !adjust.expires) { toast('برای موجودی افزوده‌شده تاریخ انقضا الزامی است.', 'err'); return; }
    void run('اصلاح موجودی با ثبت علت در دفتر گردش انبار انجام شد.', async () => {
      await rpc('farya_adjust_stock', {
        p_item_id: stock.id, p_delta_qty: delta, p_total_value: delta > 0 ? n(adjust.totalValue) : null,
        p_expires_on: delta > 0 ? (adjust.expires || null) : null, p_reason: adjust.reason, p_note: adjust.note,
      });
      setAdjust({ itemId: '', delta: '', totalValue: '', expires: '', reason: '', note: '' });
    });
  };

  const saveWaste = () => {
    const stock = activeItem(waste.itemId);
    if (!stock || n(waste.qty) <= 0 || !waste.reason.trim()) { toast('قلم، مقدار و علت ضایعات را وارد کنید.', 'err'); return; }
    void run('ضایعات با بهای میانگین موزون ثبت و از موجودی کم شد.', async () => {
      await rpc('farya_record_waste', { p_item_id: stock.id, p_qty: n(waste.qty), p_reason: waste.reason, p_note: waste.note });
      setWaste({ itemId: '', qty: '', reason: '', note: '' });
    });
  };

  const saveProduction = () => {
    const prep = preparations.find((item) => item.id === production.itemId);
    if (!prep || n(production.batches) <= 0 || n(production.output) <= 0) { toast('دستور تولید، تعداد بچ و بازدهٔ واقعی را وارد کنید.', 'err'); return; }
    const outputInventoryId = state.ingredients.find((ing) => ing.subRecipeId === prep.id)?.id;
    const outputStock = outputInventoryId ? activeItem(outputInventoryId) : undefined;
    if (outputStock?.track_expiry && !production.expires) { toast('برای محصول تولیدی تاریخ انقضا الزامی است.', 'err'); return; }
    void run(`تولیدِ ${prep.name} ثبت شد؛ مواد خام مصرف و موجودی محصول آماده افزوده شد.`, async () => {
      await rpc('farya_produce_preparation', {
        p_preparation_item_id: prep.id, p_batches: n(production.batches), p_actual_output_qty: n(production.output),
        p_expires_on: production.expires || null, p_lot_code: production.lot, p_note: production.note,
      });
      setProduction({ itemId: '', batches: '1', output: '', expires: '', lot: '', note: '' });
    });
  };

  const updateSaleLine = (index: number, patch: Partial<SaleDraftLine>) => setSaleLines((lines) => lines.map((line, i) => i === index ? { ...line, ...patch } : line));
  const setSaleProduct = (index: number, id: string) => {
    const item = pizzas.find((pizza) => pizza.id === id);
    updateSaleLine(index, { menu_item_id: id, unit_price: item?.price == null ? '' : String(item.price) });
  };
  const saveSale = () => {
    if (!day) { toast('روزِ فروش را انتخاب کنید.', 'err'); return; }
    if (!saleLines.length || saleLines.some((line) => !line.menu_item_id || n(line.qty) <= 0 || line.unit_price === '' || !Number.isFinite(Number(line.unit_price)))) {
      toast('برای هر ردیف پیتزا، تعداد و قیمت واقعی فروش را وارد کنید.', 'err'); return;
    }
    void run('فروش ثبت شد؛ مواد طبق BOM و سس‌های آماده طبق FEFO از انبار کم شدند.', async () => {
      await rpc('farya_record_sale', {
        p_sold_at: localDateTimeISO(day),
        p_lines: saleLines.map((line) => ({ menu_item_id: line.menu_item_id, qty: n(line.qty), unit_price: n(line.unit_price), discount_amount: n(line.discount_amount) })),
        p_note: saleNote,
      });
      setSaleLines([{ menu_item_id: '', qty: '1', unit_price: '', discount_amount: '0' }]);
      setSaleNote('');
    });
  };

  const saveExpense = () => {
    if (!day) { toast('روزِ هزینه را انتخاب کنید.', 'err'); return; }
    if (!expense.category.trim() || n(expense.amount) < 0 || expense.amount === '') { toast('دسته و مبلغ هزینه را وارد کنید.', 'err'); return; }
    void run('هزینهٔ عملیاتی ثبت شد و در سود و زیان روز آمد.', async () => {
      await rpc('farya_add_operating_expense', {
        p_occurred_at: localDateTimeISO(day), p_category: expense.category, p_amount: n(expense.amount), p_note: expense.note,
      });
      setExpense({ category: '', amount: '', note: '' });
    });
  };

  const saveTargets = () => void run('هدف‌های عملیاتی به‌روز شدند.', async () => {
    await rpc('farya_update_business_targets', {
      p_monthly_unit_goal: n(targets.monthlyUnits),
      p_daily_revenue_goal: targets.dailyRevenue === '' ? null : n(targets.dailyRevenue),
      p_daily_profit_goal: targets.dailyProfit === '' ? null : n(targets.dailyProfit),
    });
  });

  const openStockSettings = (item: InventoryItem) => {
    setSettingsItem(item);
    setSettingsDraft({ reorder: String(item.reorder_point ?? 0), days: String(item.expiry_warning_days ?? 7), trackExpiry: item.track_expiry });
  };
  const saveStockSettings = () => {
    if (!settingsItem) return;
    void run('نقطهٔ سفارش و هشدار انقضا ذخیره شد.', async () => {
      await rpc('farya_update_inventory_item', {
        p_item_id: settingsItem.id, p_reorder_point: n(settingsDraft.reorder),
        p_expiry_warning_days: Math.floor(n(settingsDraft.days)), p_track_expiry: settingsDraft.trackExpiry,
      });
      setSettingsItem(null);
    });
  };

  const sortedItems = useMemo(() => [...items].sort((a, b) => a.name.localeCompare(b.name, 'fa')), [items]);
  const activeItems = sortedItems.filter((item) => item.active);
  const selectedOpening = activeItem(opening.itemId);
  const selectedPurchase = activeItem(purchase.itemId);
  const selectedAdjustment = activeItem(adjust.itemId);
  const selectedProduction = preparations.find((item) => item.id === production.itemId);
  const pnl = snapshot?.pnl;

  return (
    <div className="view ops-view" dir="rtl">
      <div className="ops-header card card-pad">
        <div className="ops-heading"><div className="ops-heading-icon"><IconLayers size={22} /></div><div><h2>انبار و سود و زیان</h2><p>دفتر گردشِ اتمیک؛ ارزش‌گذاری میانگین موزون، برداشت FEFO و تازه‌سازی برخط.</p></div></div>
        <div className="ops-heading-actions">
          <label className="ops-day">روزِ گزارش <input className="input" type="date" value={day} onChange={(event) => { const next = event.target.value || localToday(); setDay(next); void refresh(next); }} /></label>
          <Button onClick={() => void refresh()} disabled={loading}><IconRefresh size={15} /> {loading ? 'در حال تازه‌سازی…' : 'تازه‌سازی'}</Button>
        </div>
      </div>

      {error && <div className="ops-error" role="alert"><IconAlert size={17} /><span>{error}</span></div>}

      <div className="ops-tabs" role="tablist" aria-label="عملیات انبار و سود و زیان">
        {([
          ['stock', 'انبار و خرید'], ['production', 'تولید سس/نیمه‌ساخته'], ['sales', 'ثبت فروش'], ['pnl', 'سود و زیان روزانه'],
        ] as Array<[Tab, string]>).map(([value, label]) => <button type="button" key={value} className={tab === value ? 'on' : ''} onClick={() => setTab(value)}>{label}</button>)}
      </div>

      {tab === 'stock' && (
        <>
          <div className="ops-kpis">
            <div className="card ops-kpi"><span>ارزش ریالی انبار</span><strong>{money(items.reduce((sum, item) => sum + n(item.stock_value), 0))}</strong><small>بر پایهٔ گردش‌های ثبت‌شده</small></div>
            <div className="card ops-kpi"><span>اقلام فعال در انبار</span><strong>{faDigits(items.length)}</strong><small>مقدار هر قلم با واحد پایهٔ خودش نمایش داده می‌شود.</small></div>
            <div className="card ops-kpi"><span>هشدارهای باز</span><strong className={snapshot?.alerts.length ? 'ops-danger-text' : ''}>{faDigits(snapshot?.alerts.length || 0)}</strong><small>انقضا، نزدیکِ انقضا و نقطهٔ سفارش</small></div>
            <div className="card ops-kpi"><span>هزینهٔ ثابتِ روزِ انتخابی</span><strong>{money(pnl?.daily_fixed_overhead)}</strong><small>سربار ماهانه ÷ روزهای همان ماه</small></div>
          </div>

          {!!snapshot?.alerts.length && <div className="ops-alert-list">{snapshot.alerts.map((alert, index) => <div className={`ops-alert ${alert.alert_type}`} key={`${alert.alert_type}-${alert.lot_id || alert.item_id}-${index}`}><IconAlert size={15} /><div><b>{alert.name}</b><span>{alert.message} {alert.expires_on ? `انقضا: ${alert.expires_on}` : ''}</span></div><strong>{num(n(alert.qty), 2)} {alert.base_unit}</strong></div>)}</div>}

          <div className="ops-callout"><IconAlert size={18} /><div><b>شروع موجودی فقط با شمارش واقعی</b><span>هیچ مقدار اولیه‌ای از یادداشت یا قیمت حدس زده نشده است. موجودی افتتاحیه را برای هر قلم و هر لات با مقدار، ارزش مستند و تاریخ انقضا ثبت کنید؛ برای قلمی که گردش عادی دارد از فرم اصلاح استفاده شود.</span></div></div>
          <section className="card ops-panel">
            <div className="ops-panel-head"><div><h3>ثبت موجودی افتتاحیهٔ شمارش‌شده</h3><p>هر بچ/تاریخ انقضا را در یک لات جدا ثبت کنید؛ تا پیش از نخستین گردش عادی می‌توانید چند لات افتتاحیه وارد کنید.</p></div><IconLayers size={18} /></div>
            <div className="ops-form-grid">
              <Field label="قلمِ انبار"><select className="select" value={opening.itemId} onChange={(event) => setOpening({ ...opening, itemId: event.target.value, expires: '' })}><option value="">انتخاب…</option>{activeItems.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.base_unit}</option>)}</select></Field>
              <Field label={`مقدارِ شمارش‌شده (${selectedOpening?.base_unit || 'واحد پایه'})`}><input className="input mono" type="number" min="0" step="0.001" value={opening.qty} onChange={(event) => setOpening({ ...opening, qty: event.target.value })} /></Field>
              <Field label="ارزشِ کلِ مستند (تومان)"><input className="input mono" type="number" min="0" step="1" value={opening.totalValue} onChange={(event) => setOpening({ ...opening, totalValue: event.target.value })} /></Field>
              <Field label={`تاریخ انقضا${selectedOpening?.track_expiry ? ' · الزامی' : ' · اختیاری'}`}><input className="input" type="date" value={opening.expires} onChange={(event) => setOpening({ ...opening, expires: event.target.value })} /></Field>
              <Field label="کد بچ/لات"><input className="input" value={opening.lot} onChange={(event) => setOpening({ ...opening, lot: event.target.value })} /></Field>
              <Field label="یادداشت شمارش"><input className="input" value={opening.note} onChange={(event) => setOpening({ ...opening, note: event.target.value })} placeholder="تاریخ و مرجع صورت‌برداری" /></Field>
            </div>
            <Button variant="primary" disabled={busy || !opening.itemId} onClick={saveOpening}><IconCheck size={15} /> ثبت افتتاحیهٔ واقعی</Button>
          </section>

          <div className="ops-grid">
            <section className="card ops-panel">
              <div className="ops-panel-head"><div><h3>ثبت خرید / رسید انبار</h3><p>مبلغ خرید به موجودی ریالی و میانگین موزون اضافه می‌شود؛ تاریخ انقضا در سطح هر لات نگهداری می‌شود.</p></div><IconPlus size={18} /></div>
              <div className="ops-form-grid">
                <Field label="قلمِ انبار"><select className="select" value={purchase.itemId} onChange={(event) => setPurchase({ ...purchase, itemId: event.target.value, expires: '' })}><option value="">انتخاب…</option>{activeItems.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.base_unit}</option>)}</select></Field>
                <Field label={`مقدارِ پایه${selectedPurchase ? ` (${selectedPurchase.base_unit})` : ''}`}><input className="input mono" type="number" min="0" step="0.001" value={purchase.qty} onChange={(event) => setPurchase({ ...purchase, qty: event.target.value })} /></Field>
                <Field label="مبلغ کلِ رسید (تومان)"><input className="input mono" type="number" min="0" step="1" value={purchase.totalCost} onChange={(event) => setPurchase({ ...purchase, totalCost: event.target.value })} /></Field>
                <Field label="تاریخ دریافت"><input className="input" type="date" value={purchase.received} onChange={(event) => setPurchase({ ...purchase, received: event.target.value })} /></Field>
                <Field label={`تاریخ انقضا${selectedPurchase?.track_expiry ? ' · الزامی' : ' · اختیاری'}`}><input className="input" type="date" required={selectedPurchase?.track_expiry} value={purchase.expires} onChange={(event) => setPurchase({ ...purchase, expires: event.target.value })} /></Field>
                <Field label="شمارهٔ بچ / فاکتور"><input className="input" value={purchase.lot} onChange={(event) => setPurchase({ ...purchase, lot: event.target.value })} /></Field>
                <Field label="یادداشت" full><input className="input" value={purchase.note} onChange={(event) => setPurchase({ ...purchase, note: event.target.value })} /></Field>
              </div>
              {selectedPurchase && <div className="ops-inline-help">بهای ورودی هر {selectedPurchase.base_unit}: <b>{purchase.qty && purchase.totalCost ? money(n(purchase.totalCost) / n(purchase.qty)) : '—'}</b> · روش ارزش‌گذاری موجودی: میانگین موزون متحرک.</div>}
              <Button variant="primary" disabled={busy || !purchase.itemId} onClick={savePurchase}><IconCheck size={15} /> ثبت رسید و افزایش موجودی</Button>
            </section>

            <section className="card ops-panel">
              <div className="ops-panel-head"><div><h3>شمارش / اصلاح موجودی</h3><p>افزایش با ارزش کل و لات جدید؛ کاهش با بهای میانگین و برداشت FEFO. علت برای ردگیری الزامی است.</p></div><IconRefresh size={18} /></div>
              <div className="ops-form-grid">
                <Field label="قلمِ انبار"><select className="select" value={adjust.itemId} onChange={(event) => setAdjust({ ...adjust, itemId: event.target.value, expires: '' })}><option value="">انتخاب…</option>{activeItems.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.base_unit}</option>)}</select></Field>
                <Field label={`تغییر مقدار (${selectedAdjustment?.base_unit || 'واحد پایه'})`} hint="مثبت=افزودن؛ منفی=کاهش."><input className="input mono" type="number" step="0.001" value={adjust.delta} onChange={(event) => setAdjust({ ...adjust, delta: event.target.value })} /></Field>
                {n(adjust.delta) > 0 && <Field label="ارزش کلِ مقدار افزوده (تومان)"><input className="input mono" type="number" min="0" value={adjust.totalValue} onChange={(event) => setAdjust({ ...adjust, totalValue: event.target.value })} /></Field>}
                {n(adjust.delta) > 0 && selectedAdjustment?.track_expiry && <Field label="تاریخ انقضا · الزامی"><input className="input" type="date" value={adjust.expires} onChange={(event) => setAdjust({ ...adjust, expires: event.target.value })} /></Field>}
                <Field label="علت اصلاح"><input className="input" value={adjust.reason} onChange={(event) => setAdjust({ ...adjust, reason: event.target.value })} placeholder="شمارش دوره‌ای، کسری، اضافه‌موجودی…" /></Field>
                <Field label="یادداشت"><input className="input" value={adjust.note} onChange={(event) => setAdjust({ ...adjust, note: event.target.value })} /></Field>
              </div>
              <Button disabled={busy || !adjust.itemId} onClick={saveAdjustment}><IconCheck size={15} /> ثبت اصلاحِ قابل‌ردگیری</Button>
            </section>

            <section className="card ops-panel">
              <div className="ops-panel-head"><div><h3>ثبت ضایعات</h3><p>موجودی با میانگین موزون کم می‌شود و مبلغ در سود و زیان همان روز به‌عنوان ضایعات می‌آید.</p></div><IconBolt size={18} /></div>
              <div className="ops-form-grid">
                <Field label="قلمِ انبار"><select className="select" value={waste.itemId} onChange={(event) => setWaste({ ...waste, itemId: event.target.value })}><option value="">انتخاب…</option>{sortedItems.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.base_unit}</option>)}</select></Field>
                <Field label={`مقدارِ ضایعات (${activeItem(waste.itemId)?.base_unit || 'واحد پایه'})`}><input className="input mono" type="number" min="0" step="0.001" value={waste.qty} onChange={(event) => setWaste({ ...waste, qty: event.target.value })} /></Field>
                <Field label="علتِ ضایعات"><input className="input" value={waste.reason} onChange={(event) => setWaste({ ...waste, reason: event.target.value })} placeholder="انقضا، آسیب، افت آماده‌سازی…" /></Field>
                <Field label="یادداشت"><input className="input" value={waste.note} onChange={(event) => setWaste({ ...waste, note: event.target.value })} /></Field>
              </div>
              <Button variant="danger" disabled={busy || !waste.itemId} onClick={saveWaste}><IconAlert size={15} /> ثبت و کسر ضایعات</Button>
            </section>
          </div>

          <section className="card ops-table-card">
            <div className="card-head"><div><h3>موجودی تعدادی و ریالی</h3><div className="sub">موجودی ریالی بر اساس گردش‌های دفتر انبار؛ مقدارها در واحد پایهٔ هر قلم هستند.</div></div></div>
            {items.length === 0 ? <Empty icon="📦" title="هنوز کارت انبار ندارید" /> : <div className="table-wrap"><table className="tbl ops-table"><thead><tr><th>قلم</th><th>نوع</th><th>موجودی</th><th>نقطهٔ سفارش</th><th>میانگین واحد</th><th>ارزش موجودی</th><th>انقضا</th><th>تنظیم</th></tr></thead><tbody>{items.map((item) => {
              const itemLots = (snapshot?.lots || []).filter((lot) => lot.item_id === item.id);
              const closest = itemLots.filter((lot) => lot.expires_on).sort((a, b) => String(a.expires_on).localeCompare(String(b.expires_on)))[0];
              return <tr key={item.id}><td><b>{item.name}</b><div className="ops-subtext">{item.id}</div></td><td>{item.item_kind === 'prepared' ? 'سس/نیمه‌ساخته' : 'خام'}{!item.active && <div className="ops-subtext">غیرفعال · فقط تخلیهٔ موجودی باقی‌مانده</div>}</td><td className="n">{num(n(item.on_hand_qty), 3)} {item.base_unit}</td><td className="n">{n(item.reorder_point) > 0 ? `${num(n(item.reorder_point), 3)} ${item.base_unit}` : '—'}</td><td className="n">{money(item.weighted_avg_unit_cost)} / {item.base_unit}</td><td className="n"><b>{money(item.stock_value)}</b></td><td>{closest?.expires_on || (item.track_expiry ? 'لات/تاریخ ندارد' : '—')}</td><td>{item.active ? <Button onClick={() => openStockSettings(item)}>هشدارها</Button> : <span className="chip clay">غیرفعال</span>}</td></tr>;
            })}</tbody></table></div>}
          </section>

          <section className="card ops-table-card"><div className="card-head"><div><h3>لات‌های باز</h3><div className="sub">ترتیب مصرف مواد غذایی: نزدیک‌ترین تاریخ انقضا (FEFO)، سپس قدیمی‌ترین دریافت.</div></div></div>
            {snapshot?.lots.length ? <div className="table-wrap"><table className="tbl ops-table"><thead><tr><th>قلم</th><th>بچ</th><th>باقی‌مانده</th><th>دریافت</th><th>انقضا</th></tr></thead><tbody>{snapshot.lots.map((lot) => <tr key={lot.id}><td>{lot.item_name}</td><td>{lot.lot_code || '—'}</td><td className="n">{num(n(lot.remaining_qty), 3)} {lot.base_unit}</td><td>{new Date(lot.received_at).toLocaleDateString('fa-IR',{timeZone:'Asia/Tehran'})}</td><td>{lot.expires_on || 'بدون انقضا'}</td></tr>)}</tbody></table></div> : <div className="ops-empty-hint">لاتی ثبت نشده است. موجودی اولیه را از فرم افتتاحیهٔ شمارش‌شده وارد کنید.</div>}
          </section>

          <section className="card ops-table-card"><div className="card-head"><div><h3>دفتر آخرین ۱۰۰ گردش انبار</h3><div className="sub">تاریخچهٔ فقط‌افزودنیِ خرید، فروش، تولید، ضایعات و اصلاح موجودی.</div></div></div>
            {snapshot?.transactions.length ? <div className="table-wrap"><table className="tbl ops-table"><thead><tr><th>زمان</th><th>قلم</th><th>گردش</th><th>تغییر تعداد</th><th>تغییر ارزش</th><th>شرح</th></tr></thead><tbody>{snapshot.transactions.map((txn) => <tr key={txn.id}><td>{new Date(txn.occurred_at).toLocaleString('fa-IR',{timeZone:'Asia/Tehran',dateStyle:'short',timeStyle:'short'})}</td><td>{txn.item_name}</td><td>{txnLabels[txn.txn_type] || txn.txn_type}</td><td className="n">{n(txn.qty_delta)>0?'+':''}{num(n(txn.qty_delta),3)} {txn.base_unit}</td><td className="n">{n(txn.value_delta)>0?'+':''}{money(txn.value_delta)}</td><td>{txn.note || '—'}</td></tr>)}</tbody></table></div> : <div className="ops-empty-hint">هنوز گردش انباری ثبت نشده است.</div>}
          </section>
        </>
      )}

      {tab === 'production' && (
        <>
          <div className="ops-callout"><IconLeaf size={18} /><div><b>تولیدِ سس یا نیمه‌ساخته</b><span>مواد خام طبق نسخهٔ دستور از انبار کم و محصولِ تولیدی با بازده واقعی و تاریخ انقضا به‌صورت لات جدید اضافه می‌شود. بهای تولید از میانگین موزونِ مواد مصرفی محاسبه می‌شود.</span></div></div>
          <section className="card ops-panel">
            <div className="ops-form-grid">
              <Field label="دستورِ تولید"><select className="select" value={production.itemId} onChange={(event) => setProduction({ ...production, itemId: event.target.value, output: '' })}><option value="">انتخاب سس/نیمه‌ساخته…</option>{preparations.map((item) => <option key={item.id} value={item.id}>{item.name} · بازدهِ پایه {num(item.yieldQty || 0)} {item.yieldUnit}</option>)}</select></Field>
              <Field label="تعداد بچِ دستور"><input className="input mono" type="number" min="0.001" step="0.1" value={production.batches} onChange={(event) => setProduction({ ...production, batches: event.target.value })} /></Field>
              <Field label={`بازدهٔ واقعیِ تولید${selectedProduction ? ` (${selectedProduction.yieldUnit})` : ''}`} hint="بازده واقعی را ثبت کنید تا افت/تبخیر در هزینهٔ واحد منعکس شود."><input className="input mono" type="number" min="0.001" step="0.1" value={production.output} onChange={(event) => setProduction({ ...production, output: event.target.value })} /></Field>
              <Field label="تاریخ انقضای بچ"><input className="input" type="date" value={production.expires} onChange={(event) => setProduction({ ...production, expires: event.target.value })} /></Field>
              <Field label="کد بچ"><input className="input" value={production.lot} onChange={(event) => setProduction({ ...production, lot: event.target.value })} /></Field>
              <Field label="یادداشت"><input className="input" value={production.note} onChange={(event) => setProduction({ ...production, note: event.target.value })} /></Field>
            </div>
            <Button variant="primary" disabled={busy || !production.itemId} onClick={saveProduction}><IconCheck size={15} /> ثبت تولید و گردش مواد</Button>
          </section>
          <div className="ops-note">اگر موجودی مادهٔ لازم کافی نباشد، کل ثبتِ تولید به‌صورت اتمیک لغو می‌شود؛ موجودی منفی ایجاد نخواهد شد.</div>
        </>
      )}

      {tab === 'sales' && (
        <>
          <div className="ops-callout"><IconCheck size={18} /><div><b>ثبت دستی فروش</b><span>ثبت تعداد پیتزا، قیمت واقعی و تخفیف؛ مواد دستور و جعبه خودکار از انبار کم می‌شوند. فروش تنها وقتی ثبت می‌شود که موجودیِ همهٔ اقلام کافی و معتبر باشد.</span></div></div>
          <section className="card ops-panel">
            <div className="ops-form-grid"><Field label="روز فروش"><input className="input" type="date" value={day} onChange={(event) => { const next = event.target.value || localToday(); setDay(next); void refresh(next); }} /></Field><Field label="یادداشتِ فاکتور"><input className="input" value={saleNote} onChange={(event) => setSaleNote(event.target.value)} placeholder="شمارهٔ سفارش/کانال فروش" /></Field></div>
            <div className="ops-sale-lines">
              {saleLines.map((line, index) => <div className="ops-sale-line" key={index}>
                <select className="select" value={line.menu_item_id} onChange={(event) => setSaleProduct(index, event.target.value)}><option value="">انتخاب پیتزا…</option>{pizzas.map((pizza) => <option key={pizza.id} value={pizza.id}>{pizza.name}</option>)}</select>
                <label><span>تعداد</span><input className="input mono" type="number" min="0.001" step="1" value={line.qty} onChange={(event) => updateSaleLine(index, { qty: event.target.value })} /></label>
                <label><span>قیمت واقعی/عدد</span><input className="input mono" type="number" min="0" step="1000" value={line.unit_price} onChange={(event) => updateSaleLine(index, { unit_price: event.target.value })} /></label>
                <label><span>تخفیفِ ردیف</span><input className="input mono" type="number" min="0" step="1000" value={line.discount_amount} onChange={(event) => updateSaleLine(index, { discount_amount: event.target.value })} /></label>
                <Button variant="danger" onClick={() => setSaleLines((current) => current.length > 1 ? current.filter((_, i) => i !== index) : [{ menu_item_id: '', qty: '1', unit_price: '', discount_amount: '0' }])}>×</Button>
              </div>)}
            </div>
            <div className="ops-panel-actions"><Button onClick={() => setSaleLines((current) => [...current, { menu_item_id: '', qty: '1', unit_price: '', discount_amount: '0' }])}><IconPlus size={15} /> افزودن ردیف</Button><Button variant="primary" disabled={busy} onClick={saveSale}><IconCheck size={15} /> ثبت فروش و کسر BOM</Button></div>
          </section>
          <section className="card ops-panel"><div className="ops-panel-head"><div><h3>ثبت هزینهٔ روزانه</h3><p>هزینه‌های متغیر و موردی را جدا از سربار ماهانه وارد کنید تا در سود خالص همان روز لحاظ شوند.</p></div></div>
            <div className="ops-form-grid"><Field label="دستهٔ هزینه"><input className="input" value={expense.category} onChange={(event) => setExpense({ ...expense, category: event.target.value })} placeholder="مثلاً حمل، کارمزد، خرید متفرقه" /></Field><Field label="مبلغ (تومان)"><input className="input mono" type="number" min="0" value={expense.amount} onChange={(event) => setExpense({ ...expense, amount: event.target.value })} /></Field><Field label="یادداشت"><input className="input" value={expense.note} onChange={(event) => setExpense({ ...expense, note: event.target.value })} /></Field></div>
            <Button onClick={saveExpense} disabled={busy}><IconPlus size={15} /> ثبت هزینه</Button>
          </section>
        </>
      )}

      {tab === 'pnl' && pnl && (
        <>
          <div className="ops-kpis ops-kpis-pnl">
            <div className="card ops-kpi"><span>فروش خالص</span><strong>{money(pnl.net_revenue)}</strong><small>{num(n(pnl.units_sold))} پیتزا</small></div>
            <div className="card ops-kpi"><span>بهای موادِ فروش‌رفته</span><strong>{money(pnl.cogs)}</strong><small>میانگین موزون در لحظهٔ فروش</small></div>
            <div className="card ops-kpi"><span>ضایعات + هزینه‌های روز</span><strong>{money(n(pnl.waste_cost) + n(pnl.operating_expenses))}</strong><small>موردی؛ جدا از اجاره و حقوق ماهانه</small></div>
            <div className={`card ops-kpi ${n(pnl.net_profit) < 0 ? 'is-negative' : 'is-positive'}`}><span>سود/زیان خالصِ روز</span><strong>{money(pnl.net_profit)}</strong><small>پس از سهم روزانهٔ سربار ثابت {money(pnl.daily_fixed_overhead)}</small></div>
          </div>
          <section className="card ops-panel"><div className="ops-panel-head"><div><h3>هدف و عملکرد</h3><p>هدف تعداد روزانه از هدف ماهانه و تعداد روزهای همان ماه محاسبه می‌شود؛ اهداف فروش/سود را خودتان تعیین کنید.</p></div></div>
            <div className="ops-form-grid"><Field label="هدف فروش ماهانه (تعداد پیتزا)"><input className="input mono" type="number" min="0" value={targets.monthlyUnits} onChange={(event) => setTargets({ ...targets, monthlyUnits: event.target.value })} /></Field><Field label="هدف فروش روزانه (تومان) · اختیاری"><input className="input mono" type="number" min="0" value={targets.dailyRevenue} onChange={(event) => setTargets({ ...targets, dailyRevenue: event.target.value })} /></Field><Field label="هدف سود خالص روزانه (تومان) · اختیاری"><input className="input mono" type="number" min="0" value={targets.dailyProfit} onChange={(event) => setTargets({ ...targets, dailyProfit: event.target.value })} /></Field></div>
            <Button onClick={saveTargets} disabled={busy}><IconCheck size={15} /> ذخیرهٔ هدف‌ها</Button>
            <div className="ops-target-grid"><div><span>هدف تعدادی امروز</span><b>{num(n(pnl.daily_unit_goal), 1)} عدد</b></div><div><span>حاشیهٔ ناخالص امروز</span><b>{pnl.gross_margin == null ? '—' : pct(n(pnl.gross_margin), 1)}</b></div><div><span>تحقق هدف فروش</span><b>{pnl.revenue_goal_attainment_pct == null ? 'هدف فروش تعیین نشده' : pct(n(pnl.revenue_goal_attainment_pct) / 100, 1)}</b></div><div><span>تحقق هدف سود</span><b>{pnl.profit_goal_attainment_pct == null ? 'هدف سود تعیین نشده' : pct(n(pnl.profit_goal_attainment_pct) / 100, 1)}</b></div></div>
          </section>
          <section className="card ops-panel"><div className="card-head"><div><h3>فروش‌های ثبت‌شده در روز</h3></div></div>
            {snapshot?.today_sales.length ? <div className="table-wrap"><table className="tbl ops-table"><thead><tr><th>زمان</th><th>پیتزا</th><th>تعداد</th><th>فروش خالص</th><th>بهای مصرف</th></tr></thead><tbody>{snapshot.today_sales.map((sale, index) => <tr key={`${sale.sale_id}-${index}`}><td>{new Date(sale.sold_at).toLocaleTimeString('fa-IR',{timeZone:'Asia/Tehran',hour:'2-digit',minute:'2-digit'})}</td><td>{sale.item_name}</td><td className="n">{num(n(sale.qty),2)}</td><td className="n">{money(sale.net_revenue)}</td><td className="n">{money(sale.cogs)}</td></tr>)}</tbody></table></div> : <div className="ops-empty-hint">فروشی برای این روز ثبت نشده است.</div>}
          </section>
          <section className="card ops-panel"><div className="card-head"><div><h3>هزینه‌های ثبت‌شده در روز</h3></div></div>
            {snapshot?.today_expenses.length ? <div className="table-wrap"><table className="tbl ops-table"><thead><tr><th>ساعت</th><th>دسته</th><th>مبلغ</th><th>یادداشت</th></tr></thead><tbody>{snapshot.today_expenses.map((row) => <tr key={row.id}><td>{new Date(row.occurred_at).toLocaleTimeString('fa-IR',{timeZone:'Asia/Tehran',hour:'2-digit',minute:'2-digit'})}</td><td>{row.category}</td><td className="n">{money(row.amount)}</td><td>{row.note || '—'}</td></tr>)}</tbody></table></div> : <div className="ops-empty-hint">هزینهٔ متغیری برای این روز ثبت نشده است.</div>}
          </section>
        </>
      )}

      {tab === 'pnl' && !pnl && <div className="card card-pad"><Empty icon="📊" title="گزارش سود و زیان آماده نیست" sub="اتصال یا migration عملیاتی را بررسی کنید." /></div>}

      {settingsItem && <div className="overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setSettingsItem(null); }}><section className="modal ops-settings-modal" role="dialog" aria-modal="true"><header className="modal-head"><div><h3>هشدار موجودی: {settingsItem.name}</h3><div className="sub">واحد پایه: {settingsItem.base_unit}</div></div><button className="icon-btn" onClick={() => setSettingsItem(null)} aria-label="بستن">×</button></header><div className="modal-body"><div className="ops-form-grid"><Field label={`نقطهٔ سفارش (${settingsItem.base_unit})`}><input className="input mono" type="number" min="0" step="0.001" value={settingsDraft.reorder} onChange={(event) => setSettingsDraft({ ...settingsDraft, reorder: event.target.value })} /></Field><Field label="هشدار انقضا چند روز مانده"><input className="input mono" type="number" min="0" max="365" value={settingsDraft.days} onChange={(event) => setSettingsDraft({ ...settingsDraft, days: event.target.value })} /></Field><label className="ops-checkbox"><input type="checkbox" checked={settingsDraft.trackExpiry} onChange={(event) => setSettingsDraft({ ...settingsDraft, trackExpiry: event.target.checked })} /> تاریخ انقضا برای خرید و تولید اجباری باشد</label></div></div><footer className="modal-foot"><Button variant="primary" onClick={saveStockSettings} disabled={busy}><IconCheck size={15} /> ذخیره</Button><Button variant="ghost" onClick={() => setSettingsItem(null)}>انصراف</Button></footer></section></div>}
    </div>
  );
}
