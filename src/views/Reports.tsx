import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { zipSync } from 'fflate';
import { getSupabase, isSupabaseConfigured } from '../lib/supabase';
import { faDigits, num, pct } from '../lib/format';
import { useStore } from '../lib/store';
import { Button, Empty } from '../components/ui';
import { IconAlert, IconDownload, IconPrinter, IconRefresh } from '../components/Icons';
import '../styles/reports.css';

type InvoiceLine = { product_id: string; name: string; category?: string; qty: number | string; unit_price: number | string; discount_amount: number | string; net_revenue: number | string; cogs?: number | string };
type Invoice = { id: string; invoice_number: string; sold_at: string; customer_name: string; customer_phone: string; subtotal: number | string; tax_rate: number | string; tax_amount: number | string; total_amount: number | string; paid_amount: number | string; balance_due: number | string; payment_status: string; note: string; lines: InvoiceLine[]; payments: Array<{ method: string; amount: number | string; reference?: string }> };
type Daily = { day: string; revenue: number | string; tax: number | string; gross: number | string; cogs: number | string; expenses: number | string; waste: number | string; net_profit: number | string; invoices: number | string; cash_collected: number | string; card_collected: number | string; transfer_collected: number | string };
type Finance = { invoices: Invoice[]; daily: Daily[]; summary: Record<string, number | string> };
type Balance = { item_id: string; name: string; item_kind: string; base_unit: string; on_hand_qty: number | string; stock_value: number | string; weighted_avg_unit_cost: number | string; reorder_point: number | string; active: boolean };
type Transaction = { id: string; item_id: string; item_name: string; item_kind: string; base_unit: string; txn_type: string; qty_delta: number | string; value_delta: number | string; occurred_at: string; reference_type: string; reference_id: string | null; note: string };
type Expense = { id: string; occurred_at: string; category: string; amount: number | string; payment_method: string; note: string };
type Inventory = { balances: Balance[]; transactions: Transaction[]; expenses: Expense[] };
type CostReportRow = { code: string; name: string; category: string; material: number; overhead: number; container: number; total: number; price: number | null; profit: number | null; margin: number | null; complete: boolean; missing: string };
type Tab = 'finance' | 'sales' | 'inventory' | 'expenses' | 'cost';

const todayTehran = () => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const get = (x: string) => parts.find((part) => part.type === x)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
};
const n = (x: unknown) => Number(x ?? 0) || 0;
const money = (x: unknown) => `${num(Math.round(n(x)))} تومان`;
const dateFa = (x: string) => new Intl.DateTimeFormat('fa-IR-u-ca-persian', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(x));
const payLabel: Record<string, string> = { cash: 'نقدی', card: 'کارت‌خوان', transfer: 'انتقال بانکی', unassigned: 'ثبت‌نشده' };
const payStatus: Record<string, string> = { paid: 'تسویه', partial: 'ناقص', due: 'مانده‌دار', legacy: 'قدیمی' };
const movementLabel: Record<string, string> = { purchase: 'خرید', opening: 'موجودی افتتاحیه', preparation_in: 'ورود تولید', preparation_out: 'مصرف تولید', sale: 'فروش', waste: 'ضایعات', adjustment_in: 'اصلاح افزایشی', adjustment_out: 'اصلاح کاهشی' };

async function callRpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const sb = getSupabase();
  if (!sb) throw new Error('اتصال Supabase تنظیم نشده است.');
  const { data, error } = await sb.rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
}

type ExcelCell = string | number | boolean | null | undefined;
type ExcelSheet = { name: string; headers: string[]; rows: ExcelCell[][] };
const xmlEscape = (value: unknown) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const excelCol = (index: number) => {
  let n = index + 1; let out = '';
  while (n > 0) { const rem = (n - 1) % 26; out = String.fromCharCode(65 + rem) + out; n = Math.floor((n - 1) / 26); }
  return out;
};
function worksheetXml(sheet: ExcelSheet) {
  const rows = [sheet.headers, ...sheet.rows];
  const body = rows.map((row, rowIndex) => `<row r="${rowIndex + 1}">${row.map((cell, colIndex) => {
    const ref = `${excelCol(colIndex)}${rowIndex + 1}`;
    if (typeof cell === 'number' && Number.isFinite(cell)) return `<c r="${ref}"><v>${cell}</v></c>`;
    if (typeof cell === 'boolean') return `<c r="${ref}" t="b"><v>${cell ? 1 : 0}</v></c>`;
    return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(cell)}</t></is></c>`;
  }).join('')}</row>`).join('');
  const lastCell = `${excelCol(Math.max(0, sheet.headers.length - 1))}${Math.max(1, rows.length)}`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${lastCell}"/><sheetViews><sheetView workbookViewId="0" rightToLeft="1"/></sheetViews><sheetFormatPr defaultRowHeight="18"/><sheetData>${body}</sheetData></worksheet>`;
}
function exportWorkbook(finance: Finance, inventory: Inventory, costs: CostReportRow[], from: string, to: string) {
  const summaryLabels: Record<string, string> = {
    invoice_count: 'تعداد فاکتور', subtotal: 'فروش خالص پیش از مالیات', tax: 'مالیات و عوارض', gross_total: 'جمع فاکتورها',
    paid: 'دریافت‌شده', receivable: 'ماندهٔ مطالبات', cogs: 'بهای کالای فروش‌رفته', expenses: 'هزینه‌های عملیاتی', waste: 'هزینهٔ ضایعات', net_profit: 'سود/زیان عملیاتی',
  };
  const sheets: ExcelSheet[] = [
    { name: 'خلاصه مالی', headers: ['عنوان', 'مقدار'], rows: [['از تاریخ', from], ['تا تاریخ', to], ...Object.entries(summaryLabels).map(([key, title]) => [title, n(finance.summary?.[key])])] },
    { name: 'روزانه و سودوزیان', headers: ['تاریخ', 'تعداد فاکتور', 'فروش خالص', 'مالیات', 'جمع با مالیات', 'بهای کالا', 'هزینه', 'ضایعات', 'سود/زیان', 'نقدی', 'کارتخوان', 'انتقال'], rows: finance.daily.map((d) => [d.day, n(d.invoices), n(d.revenue), n(d.tax), n(d.gross), n(d.cogs), n(d.expenses), n(d.waste), n(d.net_profit), n(d.cash_collected), n(d.card_collected), n(d.transfer_collected)]) },
    { name: 'فاکتورها', headers: ['شماره', 'تاریخ میلادی', 'تاریخ شمسی', 'مشتری', 'تلفن', 'فروش خالص', 'نرخ درصد', 'مالیات', 'جمع', 'دریافتی', 'مانده', 'وضعیت', 'یادداشت'], rows: finance.invoices.map((i) => [i.invoice_number, i.sold_at, dateFa(i.sold_at), i.customer_name, i.customer_phone, n(i.subtotal), n(i.tax_rate), n(i.tax_amount), n(i.total_amount), n(i.paid_amount), n(i.balance_due), payStatus[i.payment_status] || i.payment_status, i.note]) },
    { name: 'ریز اقلام فروش', headers: ['شماره فاکتور', 'تاریخ', 'کالا', 'دسته', 'تعداد', 'قیمت واحد', 'تخفیف', 'فروش خالص', 'بهای تمام‌شده'], rows: finance.invoices.flatMap((i) => i.lines.map((line) => [i.invoice_number, i.sold_at, line.name, line.category || '', n(line.qty), n(line.unit_price), n(line.discount_amount), n(line.net_revenue), n(line.cogs)])) },
    { name: 'بهای تمام‌شده منو', headers: ['کد', 'نام آیتم', 'دسته', 'بهای مواد', 'سربار', 'ظرف', 'تمام‌شده', 'قیمت فعلی', 'سود', 'حاشیه درصد', 'کامل بودن ورودی', 'ورودی‌های ناقص'], rows: costs.map((c) => [c.code, c.name, c.category, c.material, c.overhead, c.container, c.total, c.price ?? '', c.profit ?? '', c.margin == null ? '' : c.margin * 100, c.complete ? 'کامل' : 'ناقص', c.missing]) },
    { name: 'موجودی فعلی', headers: ['کد', 'قلم', 'نوع', 'واحد', 'موجودی', 'ارزش موجودی', 'میانگین بهای واحد', 'نقطه سفارش', 'فعال'], rows: inventory.balances.map((b) => [b.item_id, b.name, b.item_kind, b.base_unit, n(b.on_hand_qty), n(b.stock_value), n(b.weighted_avg_unit_cost), n(b.reorder_point), b.active ? 'بله' : 'خیر']) },
    { name: 'گردش انبار', headers: ['زمان', 'کد', 'قلم', 'نوع گردش', 'تغییر مقدار', 'واحد', 'تغییر ارزش', 'مرجع', 'شناسه مرجع', 'یادداشت'], rows: inventory.transactions.map((t) => [t.occurred_at, t.item_id, t.item_name, movementLabel[t.txn_type] || t.txn_type, n(t.qty_delta), t.base_unit, n(t.value_delta), t.reference_type, t.reference_id || '', t.note]) },
    { name: 'هزینه‌ها', headers: ['زمان', 'دسته', 'مبلغ', 'روش پرداخت', 'یادداشت'], rows: inventory.expenses.map((e) => [e.occurred_at, e.category, n(e.amount), payLabel[e.payment_method] || e.payment_method, e.note]) },
  ];
  const utf8 = (value: string) => new TextEncoder().encode(value);
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`;
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets>${sheets.map((sheet, i) => `<sheet name="${xmlEscape(sheet.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`;
  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}</Relationships>`;
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': utf8(contentTypes),
    '_rels/.rels': utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    'xl/workbook.xml': utf8(workbook),
    'xl/_rels/workbook.xml.rels': utf8(workbookRels),
  };
  sheets.forEach((sheet, i) => { files[`xl/worksheets/sheet${i + 1}.xml`] = utf8(worksheetXml(sheet)); });
  const data = zipSync(files, { level: 6 });
  const blob = new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `Farya-Reports-${from}-${to}.xlsx`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}
export default function Reports() {
  const { state, engine } = useStore();
  const [from, setFrom] = useState(todayTehran());
  const [to, setTo] = useState(todayTehran());
  const [tab, setTab] = useState<Tab>('finance');
  const [finance, setFinance] = useState<Finance | null>(null);
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async (start = from, end = to) => {
    if (!isSupabaseConfigured) { setError('برای گزارش‌های فروش و موجودی، اتصال امن Supabase و migrationهای عملیاتی ۱۰، ۱۱ و ۱۲ لازم است.'); return; }
    if (!start || !end || start > end) { setError('بازهٔ تاریخ معتبر نیست؛ تاریخ شروع باید قبل یا مساوی پایان باشد.'); return; }
    setLoading(true);
    setError('');
    try {
      const [f, inv] = await Promise.all([
        callRpc<Finance>('farya_finance_snapshot', { p_from: start, p_to: end }),
        callRpc<Inventory>('farya_inventory_report', { p_from: start, p_to: end }),
      ]);
      setFinance(f);
      setInventory(inv);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setLoading(false); }
  }, [from, to]);

  useEffect(() => { void refresh(); }, [refresh]);
  const invoices = finance?.invoices || [];
  const days = finance?.daily || [];
  const balances = inventory?.balances || [];
  const transactions = inventory?.transactions || [];
  const expenses = inventory?.expenses || [];
  const summary = finance?.summary;
  const stockValue = useMemo(() => balances.reduce((sum, b) => sum + n(b.stock_value), 0), [balances]);
  const costs = useMemo<CostReportRow[]>(() => state.items.filter((item) => item.active).flatMap((item) => {
    const c = engine.byItem[item.id];
    return c ? [{
      code: item.code, name: item.name, category: item.category, material: c.material, overhead: c.overhead,
      container: c.container, total: c.total, price: item.price, profit: c.profit, margin: c.margin,
      complete: c.costComplete, missing: c.missingCostInputs.join('، '),
    }] : [];
  }), [state.items, engine]);

  const download = () => {
    if (!finance || !inventory) return;
    exportWorkbook(finance, inventory, costs, from, to);
  };

  return <div className="view reports-view" dir="rtl">
    <section className="card card-pad reports-heading reports-no-print">
      <div><span className="reports-kicker">گزارش‌ساز فریا</span><h2>گزارش فروش، انبار و مالی</h2><p>بازه را انتخاب کنید؛ داده‌های پایگاه‌داده در جدول‌ها و فایل اکسل چندبرگی جمع می‌شوند.</p></div>
      <div className="reports-actions"><label>از <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label><label>تا <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label><Button onClick={() => void refresh()} disabled={loading}><IconRefresh size={15}/>{loading ? 'در حال خواندن…' : 'اعمال بازه'}</Button><Button onClick={download} disabled={!finance || !inventory}><IconDownload size={15}/>خروجی Excel</Button><Button variant="primary" onClick={() => window.print()} disabled={!finance || !inventory}><IconPrinter size={15}/>چاپ / ذخیره PDF</Button></div>
    </section>
    {error && <div className="reports-error reports-no-print" role="alert"><IconAlert size={17}/><span>{error}</span></div>}
    <div className="reports-date-print"><b>بازهٔ گزارش:</b> {from} — {to}</div>
    <div className="reports-kpis">
      <div className="card reports-kpi"><span>فروش پس از تخفیف</span><b>{money(summary?.subtotal)}</b></div>
      <div className="card reports-kpi"><span>مالیات محاسبه‌شده</span><b>{money(summary?.tax)}</b></div>
      <div className="card reports-kpi"><span>دریافت و مطالبات</span><b>{money(summary?.paid)} / {money(summary?.receivable)}</b></div>
      <div className="card reports-kpi"><span>سود/زیان عملیاتی</span><b>{money(summary?.net_profit)}</b></div>
      <div className="card reports-kpi"><span>ارزش موجودی فعلی</span><b>{money(stockValue)}</b></div>
    </div>
    <div className="reports-tabs reports-no-print" role="tablist" aria-label="نوع گزارش">{([
      ['finance','مالی و سودوزیان'],['sales','فروش و فاکتورها'],['inventory','انبار و گردش'],['expenses','هزینه‌ها'],['cost','بهای تمام‌شده'], 
    ] as Array<[Tab,string]>).map(([key,label]) => <button key={key} type="button" className={tab===key?'on':''} onClick={() => setTab(key)}>{label}</button>)}</div>
    {!finance || !inventory ? <section className="card reports-panel"><Empty icon="📊" title={loading ? 'در حال دریافت گزارش‌ها…' : 'برای دریافت گزارش، بازه را اعمال کنید'} /></section> : <>
      {tab === 'finance' && <>
        <section className="card reports-panel"><header><div><h3>خلاصهٔ مالی بازه</h3><p>مبالغ بر اساس فاکتورهای صادرشده، پرداخت‌ها، هزینه‌ها، ضایعات و سهم سربار محاسبه شده‌اند.</p></div></header><div className="table-wrap"><table className="tbl reports-table"><thead><tr><th>شاخص</th><th className="n">مقدار</th></tr></thead><tbody>{[
          ['تعداد فاکتور', faDigits(n(summary?.invoice_count))], ['فروش خالص بدون مالیات', money(summary?.subtotal)], ['مالیات و عوارض', money(summary?.tax)], ['جمع فاکتور با مالیات', money(summary?.gross_total)], ['دریافت‌شده', money(summary?.paid)], ['ماندهٔ مطالبات', money(summary?.receivable)], ['بهای کالای فروخته‌شده', money(summary?.cogs)], ['هزینه‌های ثبت‌شده', money(summary?.expenses)], ['هزینهٔ ضایعات', money(summary?.waste)], ['سود/زیان عملیاتی', money(summary?.net_profit)],
        ].map(([label,value]) => <tr key={label}><td>{label}</td><td className="n"><b>{value}</b></td></tr>)}</tbody></table></div></section>
        <section className="card reports-panel"><header><div><h3>گزارش روزانه و سود و زیان</h3><p>نرخ مالیات ثبت‌شده در فاکتورهای هر روز و روش‌های وصول جداگانه نمایش داده می‌شود.</p></div></header>{days.length ? <div className="table-wrap"><table className="tbl reports-table"><thead><tr><th>روز</th><th>فاکتور</th><th>فروش خالص</th><th>مالیات</th><th>بهای کالا</th><th>هزینه</th><th>ضایعات</th><th>نقد</th><th>کارت‌خوان</th><th>انتقال</th><th>سود/زیان</th></tr></thead><tbody>{[...days].reverse().map((d) => <tr key={d.day}><td>{dateFa(d.day)}</td><td>{faDigits(n(d.invoices))}</td><td>{money(d.revenue)}</td><td>{money(d.tax)}</td><td>{money(d.cogs)}</td><td>{money(d.expenses)}</td><td>{money(d.waste)}</td><td>{money(d.cash_collected)}</td><td>{money(d.card_collected)}</td><td>{money(d.transfer_collected)}</td><td className={n(d.net_profit)<0?'reports-negative':''}><b>{money(d.net_profit)}</b></td></tr>)}</tbody></table></div> : <Empty icon="📈" title="در این بازه داده‌ای نیست"/>}</section>
      </>}
      {tab === 'sales' && <section className="card reports-panel"><header><div><h3>فاکتورهای فروش و ریز اقلام</h3><p>هر ردیف در فهرست فاکتور قابل پیگیری است؛ خروجی اکسل شامل برگهٔ جدا برای ریز کالاهای فاکتورهاست.</p></div><span className="reports-badge">{faDigits(invoices.length)} فاکتور</span></header>{invoices.length ? <div className="table-wrap"><table className="tbl reports-table"><thead><tr><th>شماره</th><th>تاریخ</th><th>مشتری</th><th>تعداد قلم</th><th>فروش خالص</th><th>مالیات</th><th>جمع</th><th>دریافتی</th><th>مانده</th><th>وضعیت</th></tr></thead><tbody>{invoices.map((i) => <tr key={i.id}><td dir="ltr">{i.invoice_number}</td><td>{dateFa(i.sold_at)}</td><td>{i.customer_name || '—'}</td><td>{faDigits(i.lines?.length || 0)}</td><td>{money(i.subtotal)}</td><td>{money(i.tax_amount)}</td><td>{money(i.total_amount)}</td><td>{money(i.paid_amount)}</td><td>{money(i.balance_due)}</td><td>{payStatus[i.payment_status] || i.payment_status}</td></tr>)}</tbody></table></div> : <Empty icon="🧾" title="فاکتوری در این بازه نیست"/>}</section>}
      {tab === 'inventory' && <>
        <section className="card reports-panel"><header><div><h3>موجودی فعلی</h3><p>ماندهٔ فعلی انبار به بهای میانگین موزون است؛ این عدد پایان بازهٔ تاریخی نیست.</p></div><span className="reports-badge">ارزش فعلی: {money(stockValue)}</span></header>{balances.length ? <div className="table-wrap"><table className="tbl reports-table"><thead><tr><th>قلم</th><th>نوع</th><th>موجودی</th><th>واحد</th><th>ارزش موجودی</th><th>میانگین بهای واحد</th><th>نقطه سفارش</th></tr></thead><tbody>{balances.map((b) => <tr key={b.item_id}><td>{b.name}</td><td>{b.item_kind}</td><td>{num(n(b.on_hand_qty),3)}</td><td>{b.base_unit}</td><td>{money(b.stock_value)}</td><td>{money(b.weighted_avg_unit_cost)}</td><td>{num(n(b.reorder_point),3)}</td></tr>)}</tbody></table></div> : <Empty icon="📦" title="قلم انباری برای نمایش نیست"/>}</section>
        <section className="card reports-panel"><header><div><h3>گردش انبار در بازهٔ انتخابی</h3><p>ورودی/خروجی مقدار و ارزش هر گردش بر اساس دفتر ثبت‌شده.</p></div><span className="reports-badge">{faDigits(transactions.length)} گردش</span></header>{transactions.length ? <div className="table-wrap"><table className="tbl reports-table"><thead><tr><th>تاریخ</th><th>قلم</th><th>نوع گردش</th><th>تغییر مقدار</th><th>واحد</th><th>تغییر ارزش</th><th>یادداشت</th></tr></thead><tbody>{transactions.map((t) => <tr key={t.id}><td>{dateFa(t.occurred_at)}</td><td>{t.item_name}</td><td>{movementLabel[t.txn_type] || t.txn_type}</td><td>{num(n(t.qty_delta),3)}</td><td>{t.base_unit}</td><td>{money(t.value_delta)}</td><td>{t.note}</td></tr>)}</tbody></table></div> : <Empty icon="📦" title="گردش انباری در این بازه ثبت نشده"/>}</section>
      </>}
      {tab === 'expenses' && <section className="card reports-panel"><header><div><h3>هزینه‌های عملیاتی</h3><p>هزینهٔ ثبت‌شده، روش پرداخت، تاریخ و شرح در این گزارش آمده است.</p></div><span className="reports-badge">جمع: {money(expenses.reduce((sum, e) => sum + n(e.amount), 0))}</span></header>{expenses.length ? <div className="table-wrap"><table className="tbl reports-table"><thead><tr><th>تاریخ</th><th>دسته</th><th>مبلغ</th><th>روش پرداخت</th><th>یادداشت</th></tr></thead><tbody>{expenses.map((e) => <tr key={e.id}><td>{dateFa(e.occurred_at)}</td><td>{e.category}</td><td>{money(e.amount)}</td><td>{payLabel[e.payment_method] || e.payment_method}</td><td>{e.note}</td></tr>)}</tbody></table></div> : <Empty icon="💸" title="هزینه‌ای در این بازه ثبت نشده"/>}</section>}
      {tab === 'cost' && <section className="card reports-panel"><header><div><h3>بهای تمام‌شده و قیمت منو</h3><p>مبنای محاسبه، دادهٔ فعلیِ رسپی، قیمت خرید مواد و سربار است. ورودی ناقص به‌عنوان قیمت قطعی تلقی نمی‌شود.</p></div><span className="reports-badge">{faDigits(costs.length)} آیتم</span></header>{costs.length ? <div className="table-wrap"><table className="tbl reports-table"><thead><tr><th>کد</th><th>آیتم</th><th>مواد</th><th>سربار</th><th>ظرف</th><th>تمام‌شده</th><th>قیمت فروش</th><th>سود</th><th>حاشیه</th><th>کامل؟</th><th>ورودی ناقص</th></tr></thead><tbody>{costs.map((c) => <tr key={c.code}><td>{c.code}</td><td>{c.name}</td><td>{money(c.material)}</td><td>{money(c.overhead)}</td><td>{money(c.container)}</td><td>{money(c.total)}</td><td>{c.price == null ? 'ثبت نشده' : money(c.price)}</td><td>{c.profit == null ? '—' : money(c.profit)}</td><td>{c.margin == null ? '—' : pct(c.margin, 1)}</td><td>{c.complete ? 'بله' : 'خیر'}</td><td>{c.missing || '—'}</td></tr>)}</tbody></table></div> : <Empty icon="🧮" title="آیتمی برای گزارش نیست"/>}</section>}
    </>}
  </div>;
}
