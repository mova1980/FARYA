import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { getSupabase, isSupabaseConfigured } from '../lib/supabase';
import { uid, num, faDigits } from '../lib/format';
import { Button, Empty, Field, Modal } from '../components/ui';
import { IconAlert, IconCheck, IconCoins, IconPlus, IconPrinter, IconRefresh, IconSearch, IconWallet, IconX } from '../components/Icons';
import '../styles/sales-finance.css';

type Tab = 'checkout' | 'invoices' | 'cash' | 'catalog' | 'reports';
type PayMethod = 'cash' | 'card' | 'transfer';
type Product = {
  id: string; name: string; category: 'پیتزا' | 'نوشیدنی' | 'محصول نهایی'; sale_type: 'recipe' | 'stock';
  unit_label: string; unit_price: number | string | null; active: boolean; inventory_item_id: string | null;
  on_hand_qty: number | string | null; base_unit: string; stock_value: number | string | null;
};
type InvoiceLine = { product_id: string; name: string; category?: string; qty: number | string; unit_price: number | string; discount_amount: number | string; net_revenue: number | string; cogs?: number | string };
type InvoicePayment = { method: PayMethod; amount: number | string; reference?: string };
type Invoice = {
  id: string; invoice_number: string; sold_at: string; status: string; customer_name: string; customer_phone: string;
  subtotal: number | string; tax_rate: number | string; tax_amount: number | string; total_amount: number | string;
  paid_amount: number | string; balance_due: number | string; payment_status: 'paid' | 'partial' | 'due' | 'legacy';
  note: string; lines: InvoiceLine[]; payments: InvoicePayment[];
};
type Daily = { day: string; revenue: number | string; tax: number | string; gross: number | string; cogs: number | string; expenses: number | string; waste: number | string; net_profit: number | string; invoices: number | string; cash_collected: number | string; card_collected: number | string; transfer_collected: number | string };
type Summary = { invoice_count: number | string; subtotal: number | string; tax: number | string; gross_total: number | string; paid: number | string; receivable: number | string; cogs: number | string; expenses: number | string; waste: number | string; net_profit: number | string };
type CashSession = { id: string; business_day: string; opened_at: string; opening_cash: number | string; open_note: string; cash_collected: number | string; card_collected: number | string; transfer_collected: number | string; cash_in: number | string; cash_out: number | string; expected_cash: number | string };
type CashClosure = { id: string; business_day: string; opened_at: string; closed_at: string; opening_cash: number | string; expected_cash: number | string; counted_cash: number | string; cash_difference: number | string; expected_card: number | string; counted_card: number | string; card_difference: number | string; expected_transfer: number | string; counted_transfer: number | string; transfer_difference: number | string; close_note: string };
type Snapshot = { from: string; to: string; products: Product[]; invoices: Invoice[]; daily: Daily[]; summary: Summary; cash_session: CashSession | null; recent_closures: CashClosure[] };
type CartLine = { product_id: string; qty: string; discount_amount: string };
type PaymentDraft = { method: PayMethod; amount: string; reference: string };
type Receipt = Omit<Invoice, 'payment_status' | 'balance_due' | 'note'> & { balance_due: number | string; payment_status: string; lines: InvoiceLine[]; payments: InvoicePayment[] };

const todayTehran = () => {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const get = (t: string) => p.find((x) => x.type === t)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
};
const value = (v: unknown) => Number(v ?? 0) || 0;
const money = (v: unknown) => `${num(Math.round(value(v)))} تومان`;
const dateFa = (v: string | Date, time = false) => new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
  timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit',
  ...(time ? { hour: '2-digit', minute: '2-digit' } : {}),
}).format(new Date(v));
const methodLabel: Record<PayMethod, string> = { cash: 'نقدی', card: 'کارت‌خوان', transfer: 'انتقال بانکی' };
const statusLabel: Record<string, string> = { paid: 'تسویه‌شده', partial: 'تسویهٔ ناقص', due: 'مانده‌دار', legacy: 'سابقهٔ پیشین' };

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const sb = getSupabase();
  if (!sb) throw new Error('اتصال پایگاه‌داده تنظیم نشده است.');
  const { data, error } = await sb.rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
}

function DailySalesChart({ data }: { data: Daily[] }) {
  if (!data.length) return <div className="sf-chart-empty">برای بازهٔ انتخاب‌شده داده‌ای نیست.</div>;
  const width = Math.max(680, data.length * 54);
  const height = 236; const left = 48; const right = 12; const top = 18; const bottom = 42;
  const plotW = width - left - right; const plotH = height - top - bottom;
  const max = Math.max(1, ...data.map((d) => value(d.gross)));
  const slot = plotW / data.length; const barW = Math.min(24, slot * 0.54);
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  return <div className="sf-chart-scroll"><svg className="sf-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="نمودار فروش و مالیات روزانه">
    <defs><linearGradient id="sfSalesGradient" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#78a875"/><stop offset="1" stopColor="#30563d"/></linearGradient><filter id="sfGlow"><feGaussianBlur stdDeviation="3" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
    {ticks.map((tick) => { const y = top + plotH * (1 - tick); return <g key={tick}><line x1={left} x2={width-right} y1={y} y2={y} className="sf-gridline"/><text x={left-8} y={y+4} textAnchor="end" className="sf-axis-label">{num(Math.round(max*tick),0)}</text></g>; })}
    {data.map((d, i) => {
      const x = left + i * slot + (slot - barW) / 2; const gross = value(d.gross); const rev = value(d.revenue); const tax = value(d.tax);
      const grossH = plotH * gross / max; const revH = plotH * rev / max; const taxH = Math.max(0,grossH-revH);
      return <g key={d.day} className="sf-bar-group"><title>{dateFa(d.day)} · فروش {money(rev)} · مالیات {money(tax)} · {num(value(d.invoices))} فاکتور</title>
        <rect x={x} y={top+plotH-grossH} width={barW} height={Math.max(2,taxH)} rx="5" className="sf-tax-bar"/>
        <rect x={x} y={top+plotH-revH} width={barW} height={Math.max(2,revH)} rx="5" fill="url(#sfSalesGradient)" filter="url(#sfGlow)" className="sf-sales-bar"/>
        <text x={x+barW/2} y={height-15} textAnchor="middle" className="sf-axis-label">{dateFa(d.day).slice(-5)}</text>
      </g>;
    })}
    <line x1={left} x2={width-right} y1={top+plotH} y2={top+plotH} className="sf-axis-line"/>
  </svg></div>;
}

function ProfitChart({ data }: { data: Daily[] }) {
  if (!data.length) return null;
  const width = Math.max(680, data.length * 54); const height = 174; const left = 48; const right = 12; const top = 14; const bottom = 34;
  const values = data.map((d) => value(d.net_profit)); const min = Math.min(0,...values); const max = Math.max(1,...values); const plotH = height-top-bottom; const plotW = width-left-right;
  const y = (v: number) => top + (max-v)/(max-min || 1)*plotH;
  const pts = data.map((d,i) => `${left+(data.length===1?plotW/2:i*plotW/(data.length-1))},${y(value(d.net_profit))}`).join(' ');
  return <div className="sf-chart-scroll"><svg className="sf-chart sf-profit-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="نمودار سود خالص روزانه">
    <defs><linearGradient id="sfProfitGradient" x1="0" x2="1"><stop offset="0" stopColor="#915813"/><stop offset="1" stopColor="#c1832b"/></linearGradient></defs>
    <line x1={left} x2={width-right} y1={y(0)} y2={y(0)} className="sf-axis-line"/>
    <polyline points={pts} fill="none" stroke="url(#sfProfitGradient)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="sf-profit-line"/>
    {data.map((d,i) => { const x=left+(data.length===1?plotW/2:i*plotW/(data.length-1)); return <g key={d.day}><title>{dateFa(d.day)} · سود خالص {money(d.net_profit)}</title><circle cx={x} cy={y(value(d.net_profit))} r="4" className="sf-profit-dot"/><text x={x} y={height-9} textAnchor="middle" className="sf-axis-label">{dateFa(d.day).slice(-5)}</text></g>; })}
  </svg></div>;
}

export default function SalesFinance() {
  const { state, toast } = useStore();
  const [tab, setTab] = useState<Tab>('checkout');
  const [from, setFrom] = useState(todayTehran());
  const [to, setTo] = useState(todayTehran());
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('همه');
  const [invoiceFilter, setInvoiceFilter] = useState('همه');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [payments, setPayments] = useState<PaymentDraft[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [invoiceNote, setInvoiceNote] = useState('');
  const [autoPrint, setAutoPrint] = useState(true);
  const [paper, setPaper] = useState<'58'|'80'>('80');
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [productDraft, setProductDraft] = useState({ id:'', name:'', category:'نوشیدنی', saleType:'stock', unit:'عدد', price:'', inventoryId:'', trackExpiry:true, active:true });
  const [productOpen, setProductOpen] = useState(false);
  const [sessionDraft, setSessionDraft] = useState({ openingCash:'', note:'' });
  const [closeDraft, setCloseDraft] = useState({ cash:'', card:'', transfer:'', note:'' });
  const [movementDraft, setMovementDraft] = useState({ direction:'out', method:'cash' as PayMethod, amount:'', note:'' });
  const [expenseDraft, setExpenseDraft] = useState({ category:'', amount:'', method:'cash' as PayMethod, note:'' });
  const [payInvoice, setPayInvoice] = useState<Invoice | null>(null);
  const [paymentDraft, setPaymentDraft] = useState({ method:'cash' as PayMethod, amount:'', reference:'' });
  const [invoiceQuery, setInvoiceQuery] = useState('');

  const refresh = useCallback(async (start=from,end=to) => {
    if (!isSupabaseConfigured) { setError('برای فعال‌شدن فاکتور و صندوق، اتصال امن Supabase و migrationهای ۱۰ و ۱۱ باید روی محیط staging تنظیم شوند.'); return; }
    setLoading(true);
    try { const data = await rpc<Snapshot>('farya_finance_snapshot',{p_from:start,p_to:end}); setSnapshot(data); setError(''); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  },[from,to]);

  useEffect(() => { void refresh(); },[refresh]);
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const sb=getSupabase(); if(!sb) return;
    const timer=window.setInterval(()=>{ if(document.visibilityState==='visible') void refresh(); },25_000);
    const channel=sb.channel('farya-pos-finance-live')
      .on('postgres_changes',{event:'*',schema:'public',table:'farya_sales'},()=>void refresh())
      .on('postgres_changes',{event:'*',schema:'public',table:'farya_sale_lines'},()=>void refresh())
      .on('postgres_changes',{event:'*',schema:'public',table:'farya_sale_products'},()=>void refresh())
      .on('postgres_changes',{event:'*',schema:'public',table:'farya_sale_payments'},()=>void refresh())
      .on('postgres_changes',{event:'*',schema:'public',table:'farya_cash_sessions'},()=>void refresh())
      .on('postgres_changes',{event:'*',schema:'public',table:'farya_cash_movements'},()=>void refresh())
      .on('postgres_changes',{event:'*',schema:'public',table:'farya_operating_expenses'},()=>void refresh())
      .subscribe();
    return ()=>{window.clearInterval(timer);void sb.removeChannel(channel);};
  },[refresh]);

  const run = async (success:string, action:()=>Promise<unknown>) => {
    setBusy(true); setError('');
    try { const result=await action(); toast(success,'ok'); await refresh(); return result; }
    catch(e){const msg=e instanceof Error?e.message:String(e);setError(msg);toast(msg,'err');return null;}
    finally{setBusy(false);}
  };

  const products=snapshot?.products||[];
  const activeProducts=products.filter((p)=>p.active);
  const productById=(id:string)=>products.find((p)=>p.id===id);
  const cartTotals=useMemo(()=>{
    const subtotal=cart.reduce((sum,line)=>{const p=productById(line.product_id);return sum+Math.max(0,value(p?.unit_price)*value(line.qty)-value(line.discount_amount));},0);
    const tax=Math.round(subtotal*.10);
    return {subtotal,tax,total:subtotal+tax,discount:cart.reduce((sum,l)=>sum+value(l.discount_amount),0)};
  },[cart,products]);
  const paidDraft=payments.reduce((sum,p)=>sum+value(p.amount),0);
  const dueDraft=Math.max(0,cartTotals.total-paidDraft);

  const filteredProducts=activeProducts.filter((p)=>
    (categoryFilter==='همه'||p.category===categoryFilter) && (!search||p.name.toLowerCase().includes(search.toLowerCase()))
  );
  const filteredInvoices=(snapshot?.invoices||[]).filter((invoice)=>
    (!invoiceQuery||invoice.invoice_number.toLowerCase().includes(invoiceQuery.toLowerCase())||invoice.customer_name.toLowerCase().includes(invoiceQuery.toLowerCase())||invoice.customer_phone.includes(invoiceQuery)) &&
    (invoiceFilter==='همه'||invoice.payment_status===invoiceFilter)
  );

  const setRange=(kind:'today'|'week'|'month')=>{
    const end=todayTehran(); const endDate=new Date(`${end}T12:00:00Z`); const startDate=new Date(endDate);
    if(kind==='week') startDate.setUTCDate(startDate.getUTCDate()-6);
    if(kind==='month') startDate.setUTCDate(1);
    const start=startDate.toISOString().slice(0,10);setFrom(start);setTo(end);void refresh(start,end);
  };

  const addProduct=(id:string)=>setCart((current)=>{
    const found=current.find((line)=>line.product_id===id);
    return found?current.map((line)=>line.product_id===id?{...line,qty:String(value(line.qty)+1)}:line):[...current,{product_id:id,qty:'1',discount_amount:'0'}];
  });
  const updateCart=(id:string,patch:Partial<CartLine>)=>setCart((current)=>current.map((line)=>line.product_id===id?{...line,...patch}:line));
  const addPaymentRow=(method:PayMethod)=>setPayments((current)=>[...current,{method,amount:'',reference:''}]);
  const updatePayment=(index:number,patch:Partial<PaymentDraft>)=>setPayments((current)=>current.map((p,i)=>i===index?{...p,...patch}:p));
  const fillPayment=(index:number)=>setPayments((current)=>current.map((p,i)=>i===index?{...p,amount:String(Math.max(0,cartTotals.total-current.reduce((sum,x,j)=>sum+(j===i?0:value(x.amount)),0)))}:p));

  const createInvoice=async()=>{
    if(!cart.length){toast('برای صدور فاکتور دست‌کم یک محصول نهایی انتخاب کنید.','warn');return;}
    if(cart.some((line)=>!productById(line.product_id)||productById(line.product_id)?.unit_price==null)){toast('قیمت یکی از کالاها هنوز در کاتالوگ تأیید نشده است.','err');return;}
    if(payments.some((p)=>value(p.amount)<0)||paidDraft>cartTotals.total){toast('مبالغ پرداخت بیشتر از جمع فاکتور است؛ پرداخت‌ها را اصلاح کنید.','err');return;}
    if(paidDraft>0&&!snapshot?.cash_session){toast('برای ثبت وجه دریافتی ابتدا نوبت صندوق را باز کنید؛ فاکتورِ بدون دریافت را می‌توان به‌صورت مانده‌دار صادر کرد.','err');return;}
    const data=await run('فاکتور صادر شد؛ مالیات ۱۰٪ محاسبه و موجودی براساس BOM کسر شد.',async()=>await rpc<Receipt>('farya_record_invoice',{
      p_lines:cart.map((line)=>({product_id:line.product_id,qty:value(line.qty),discount_amount:value(line.discount_amount)})),
      p_payments:payments.filter((p)=>value(p.amount)>0).map((p)=>({method:p.method,amount:value(p.amount),reference:p.reference})),
      p_customer_name:customerName,p_customer_phone:customerPhone,p_note:invoiceNote,
    }));
    if(!data)return;
    setReceipt(data as Receipt);setReceiptOpen(true);setCart([]);setPayments([]);setCustomerName('');setCustomerPhone('');setInvoiceNote('');
    if(autoPrint) window.setTimeout(()=>window.print(),450);
  };

  const openNewProduct=()=>{
    const id=uid('sale');
    setProductDraft({id,name:'',category:'نوشیدنی',saleType:'stock',unit:'عدد',price:'',inventoryId:uid('finished'),trackExpiry:true,active:true});
    setProductOpen(true);
  };
  const editProduct=(p:Product)=>setProductDraft({id:p.id,name:p.name,category:p.category,saleType:p.sale_type,unit:p.unit_label,price:p.unit_price==null?'':String(p.unit_price),inventoryId:p.inventory_item_id||'',trackExpiry:true,active:p.active});
  const saveProduct=async()=>{
    if(!productDraft.name.trim()||!productDraft.unit.trim()){toast('نام و واحد محصول نهایی را وارد کنید.','err');return;}
    const price=productDraft.price===''?null:Number(productDraft.price);
    if(price!==null&&(!Number.isFinite(price)||price<0)){toast('قیمت فروش باید صفر یا بیشتر باشد.','err');return;}
    const result=await run('کاتالوگِ صندوق ذخیره شد؛ قیمت منوی آنلاین تغییر نکرد.',async()=>await rpc('farya_save_sale_product',{
      p_product_id:productDraft.id,p_product_name:productDraft.name,p_category:productDraft.category,p_sale_type:productDraft.saleType,
      p_unit_label:productDraft.unit,p_unit_price:price,p_inventory_item_id:productDraft.inventoryId||null,
      p_track_expiry:productDraft.trackExpiry,p_active:productDraft.active,
    }));
    if(result!==null)setProductOpen(false);
  };

  const startSession=()=>{
    if(sessionDraft.openingCash===''||value(sessionDraft.openingCash)<0){toast('موجودی نقدِ آغاز نوبت را وارد کنید؛ اگر صفر است صریحاً صفر بنویسید.','err');return;}
    void run('نوبت صندوق باز شد.',async()=>{
      await rpc('farya_open_cash_session',{p_opening_cash:value(sessionDraft.openingCash),p_note:sessionDraft.note});
      setSessionDraft({openingCash:'',note:''});
    });
  };
  const closeSession=()=>{
    if(closeDraft.cash===''||closeDraft.card===''||closeDraft.transfer===''){toast('موجودی شمارش‌شدهٔ نقد، کارت‌خوان و انتقال را وارد کنید.','err');return;}
    void run('نوبت صندوق بسته شد؛ اختلاف هر روش جداگانه ثبت شد.',async()=>{
      const result=await rpc<Record<string,number>>('farya_close_cash_session',{p_counted_cash:value(closeDraft.cash),p_counted_card:value(closeDraft.card),p_counted_transfer:value(closeDraft.transfer),p_note:closeDraft.note});
      setCloseDraft({cash:'',card:'',transfer:'',note:''});
      const diffs=[['نقد',result.cash_difference],['کارت‌خوان',result.card_difference],['انتقال',result.transfer_difference]].map(([label,num])=>`${label}: ${money(num)}`).join(' · ');
      toast(`اختلافِ شمارش نسبت به انتظار — ${diffs}`,'warn');
    });
  };
  const recordMovement=()=>{
    if(value(movementDraft.amount)<=0||!movementDraft.note.trim()){toast('مبلغ مثبت و شرحِ واریز/برداشت الزامی است.','err');return;}
    void run('گردش صندوق ثبت شد.',async()=>{await rpc('farya_cash_movement',{p_direction:movementDraft.direction,p_method:movementDraft.method,p_amount:value(movementDraft.amount),p_note:movementDraft.note});setMovementDraft({...movementDraft,amount:'',note:''});});
  };
  const recordExpense=()=>{
    if(!expenseDraft.category.trim()||value(expenseDraft.amount)<=0){toast('دسته و مبلغِ مثبت هزینه را وارد کنید.','err');return;}
    void run('هزینه ثبت شد و اثر آن در صندوق/بانک و سودوزیان لحاظ شد.',async()=>{await rpc('farya_record_finance_expense',{p_category:expenseDraft.category,p_amount:value(expenseDraft.amount),p_method:expenseDraft.method,p_note:expenseDraft.note});setExpenseDraft({category:'',amount:'',method:'cash',note:''});});
  };
  const saveInvoicePayment=()=>{
    if(!payInvoice||value(paymentDraft.amount)<=0){toast('فاکتور و مبلغ دریافتی را مشخص کنید.','err');return;}
    void run('دریافت به فاکتور اضافه شد و مانده دوباره محاسبه شد.',async()=>{await rpc('farya_record_invoice_payment',{p_sale_id:payInvoice.id,p_method:paymentDraft.method,p_amount:value(paymentDraft.amount),p_reference:paymentDraft.reference});setPayInvoice(null);setPaymentDraft({method:'cash',amount:'',reference:''});});
  };

  const showReceipt=(invoice:Invoice)=>{setReceipt(invoice as Receipt);setReceiptOpen(true);};
  const printReceipt=()=>window.print();
  const days=snapshot?.daily||[]; const summary=snapshot?.summary;
  const visibleProducts=filteredProducts;

  return <div className="view sf-view" dir="rtl">
    <section className="card card-pad sf-topbar pos-no-print">
      <div className="sf-title"><div className="sf-title-icon"><IconWallet size={22}/></div><div><h2>فروش، فاکتور و صندوق</h2><p>کاتالوگِ محصول نهایی، فیش‌پرینت، دریافت چندروشی و گزارش مالیِ زنده.</p><a className="sf-guide-link" href="/guides/farya-pos-cash-guide.html" target="_blank" rel="noreferrer">راهنمای سادهٔ صندوق <span aria-hidden="true">↗</span></a></div></div>
      <div className="sf-range-tools"><label>از <input className="input" type="date" value={from} onChange={(e)=>{setFrom(e.target.value);void refresh(e.target.value,to);}}/></label><label>تا <input className="input" type="date" value={to} onChange={(e)=>{setTo(e.target.value);void refresh(from,e.target.value);}}/></label><Button onClick={()=>setRange('today')}>امروز</Button><Button onClick={()=>setRange('week')}>۷ روز</Button><Button onClick={()=>setRange('month')}>ماه جاری</Button><Button onClick={()=>void refresh()} disabled={loading}><IconRefresh size={15}/>{loading?'در حال دریافت…':'به‌روزرسانی'}</Button></div>
    </section>

    {error&&<div className="sf-error pos-no-print"><IconAlert size={17}/><span>{error}</span></div>}
    <div className="sf-tabs pos-no-print" role="tablist">{([['checkout','صدور فاکتور'],['invoices','فهرست فاکتورها'],['cash','صندوق و هزینه'],['catalog','کاتالوگ نهایی'],['reports','گزارش مالی']] as Array<[Tab,string]>).map(([key,label])=><button type="button" key={key} className={tab===key?'on':''} onClick={()=>setTab(key)}>{label}</button>)}</div>

    {tab==='checkout'&&<div className="sf-checkout-grid pos-no-print">
      <section className="card sf-panel sf-product-picker"><div className="sf-panel-head"><div><h3>انتخاب محصول نهایی</h3><p>مواد خام و نیمه‌ساخته به فاکتور اضافه نمی‌شوند؛ فقط کالاهای نهاییِ فعال.</p></div><span className="sf-badge">{faDigits(activeProducts.length)} قلم فعال</span></div>
        <div className="sf-picker-tools"><label className="sf-search"><IconSearch size={15}/><input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="جست‌وجوی پیتزا، نوشیدنی…"/></label><select className="select" value={categoryFilter} onChange={(e)=>setCategoryFilter(e.target.value)}><option>همه</option><option>پیتزا</option><option>نوشیدنی</option><option>محصول نهایی</option></select></div>
        {visibleProducts.length?<div className="sf-product-grid">{visibleProducts.map((p)=><button className="sf-product-tile" type="button" key={p.id} onClick={()=>addProduct(p.id)} disabled={p.unit_price==null} title={p.unit_price==null?'ابتدا قیمت این محصول را در کاتالوگ تأیید کنید.':'افزودن به فاکتور'}>
          <span className="sf-product-cat">{p.category}</span><b>{p.name}</b><span>{p.unit_price==null?'قیمت تعیین نشده':`${money(p.unit_price)} / ${p.unit_label}`}</span>{p.sale_type==='stock'&&<small>موجودی: {num(value(p.on_hand_qty),2)} {p.base_unit}</small>}
        </button>)}</div>:<Empty icon="🧾" title="محصولی با این فیلتر پیدا نشد"/>}
      </section>
      <section className="card sf-panel sf-checkout"><div className="sf-panel-head"><div><h3>سبد و محاسبهٔ فاکتور</h3><p>قیمت از کاتالوگ صندوق خوانده می‌شود؛ ۱۰٪ مالیات روی مبلغ پس از تخفیف محاسبه می‌شود.</p></div></div>
        {!cart.length?<div className="sf-cart-empty">برای شروع، محصول نهایی را از فهرست سمت راست انتخاب کنید.</div>:<div className="sf-cart-lines">{cart.map((line)=>{const p=productById(line.product_id);if(!p)return null;return <div className="sf-cart-line" key={line.product_id}><div className="sf-cart-name"><b>{p.name}</b><small>{money(p.unit_price)} · هر {p.unit_label}</small></div><label><span>تعداد</span><input className="input mono" type="number" min="0.01" step="1" value={line.qty} onChange={(e)=>updateCart(line.product_id,{qty:e.target.value})}/></label><label><span>تخفیف (تومان)</span><input className="input mono" type="number" min="0" step="1000" value={line.discount_amount} onChange={(e)=>updateCart(line.product_id,{discount_amount:e.target.value})}/></label><b className="sf-line-total">{money(Math.max(0,value(p.unit_price)*value(line.qty)-value(line.discount_amount)))}</b><button className="icon-btn danger" type="button" title="حذف ردیف" onClick={()=>setCart((cur)=>cur.filter((x)=>x.product_id!==line.product_id))}><IconX size={15}/></button></div>;})}</div>}
        <div className="sf-customer-grid"><Field label="نام مشتری · اختیاری"><input className="input" value={customerName} onChange={(e)=>setCustomerName(e.target.value)} placeholder="برای نسخهٔ مشتری"/></Field><Field label="تلفن · اختیاری"><input className="input" inputMode="tel" value={customerPhone} onChange={(e)=>setCustomerPhone(e.target.value)}/></Field><Field label="یادداشت فاکتور" full><input className="input" value={invoiceNote} onChange={(e)=>setInvoiceNote(e.target.value)} placeholder="یادداشت داخلی / شماره سفارش"/></Field></div>
        <div className="sf-payment-box"><div className="sf-payment-title"><b>دریافت هنگام صدور</b><span>{snapshot?.cash_session?'نوبت صندوق باز است':'نوبت صندوق بسته است؛ فقط فاکتورِ مانده‌دار صادر می‌شود.'}</span></div><div className="sf-provisional-note">روش‌های فعلی نقدی / کارت‌خوان / انتقال، تا تأیید مدل پرداخت نهایی اولیه و قابل بازنگری‌اند.</div>
          {payments.map((payment,index)=><div className="sf-pay-row" key={index}><select className="select" value={payment.method} onChange={(e)=>updatePayment(index,{method:e.target.value as PayMethod})}>{Object.entries(methodLabel).map(([k,label])=><option key={k} value={k}>{label}</option>)}</select><input className="input mono" type="number" min="0" step="1000" placeholder="مبلغ دریافتی" value={payment.amount} onChange={(e)=>updatePayment(index,{amount:e.target.value})}/><input className="input" placeholder="شماره رسید/کارت‌خوان" value={payment.reference} onChange={(e)=>updatePayment(index,{reference:e.target.value})}/><Button onClick={()=>fillPayment(index)}>تکمیل مانده</Button><button className="icon-btn danger" onClick={()=>setPayments((cur)=>cur.filter((_,i)=>i!==index))} aria-label="حذف روش پرداخت"><IconX size={14}/></button></div>)}
          <div className="sf-payment-add">{Object.entries(methodLabel).map(([method,label])=><Button key={method} onClick={()=>addPaymentRow(method as PayMethod)}><IconPlus size={13}/>{label}</Button>)}</div>
        </div>
        <div className="sf-totals"><div><span>جمع قبل از تخفیف</span><b>{money(cart.reduce((s,l)=>s+value(productById(l.product_id)?.unit_price)*value(l.qty),0))}</b></div><div><span>تخفیف</span><b>− {money(cartTotals.discount)}</b></div><div><span>جمع مشمول مالیات</span><b>{money(cartTotals.subtotal)}</b></div><div><span>مالیات و عوارض ۱۰٪</span><b>{money(cartTotals.tax)}</b></div><div className="sf-grand-total"><span>قابل پرداخت</span><strong>{money(cartTotals.total)}</strong></div><div><span>دریافتی</span><b>{money(paidDraft)}</b></div><div className="sf-due"><span>ماندهٔ فاکتور</span><b>{money(dueDraft)}</b></div></div>
        <div className="sf-checkout-actions"><label className="sf-check"><input type="checkbox" checked={autoPrint} onChange={(e)=>setAutoPrint(e.target.checked)}/>بعد از صدور، پنجرهٔ چاپ را باز کن</label><label className="sf-paper-choice">عرض چاپ<select className="select" value={paper} onChange={(e)=>setPaper(e.target.value as '58'|'80')}><option value="58">۵۸ میلی‌متر</option><option value="80">۸۰ میلی‌متر</option></select></label><Button variant="primary" disabled={busy||!cart.length} onClick={()=>void createInvoice()}><IconCheck size={15}/>{busy?'در حال صدور…':'صدور فاکتور و کسر موجودی'}</Button></div>
      </section>
    </div>}

    {tab==='invoices'&&<section className="card sf-panel pos-no-print"><div className="sf-panel-head"><div><h3>فاکتورهای صادرشده</h3><p>بازهٔ تاریخ در بالای صفحه اعمال می‌شود؛ وضعیت تسویه از دریافتی‌های ثبت‌شده محاسبه می‌شود.</p></div><span className="sf-badge">{faDigits(filteredInvoices.length)} فاکتور</span></div>
      <div className="sf-picker-tools"><label className="sf-search"><IconSearch size={15}/><input value={invoiceQuery} onChange={(e)=>setInvoiceQuery(e.target.value)} placeholder="شماره فاکتور، نام یا تلفن مشتری"/></label><select className="select" value={invoiceFilter} onChange={(e)=>setInvoiceFilter(e.target.value)}><option value="همه">همه وضعیت‌ها</option><option value="paid">تسویه‌شده</option><option value="partial">تسویهٔ ناقص</option><option value="due">مانده‌دار</option><option value="legacy">سوابق پیشین</option></select></div>
      {filteredInvoices.length?<div className="table-wrap"><table className="tbl sf-table"><thead><tr><th>شماره</th><th>زمان</th><th>مشتری</th><th>اقلام</th><th>جمع با مالیات</th><th>دریافتی</th><th>مانده</th><th>وضعیت</th><th>اقدام</th></tr></thead><tbody>{filteredInvoices.map((invoice)=><tr key={invoice.id}><td className="sf-invoice-no">{invoice.invoice_number}</td><td>{dateFa(invoice.sold_at,true)}</td><td>{invoice.customer_name||'—'}{invoice.customer_phone&&<div className="sf-muted">{invoice.customer_phone}</div>}</td><td>{faDigits(invoice.lines.length)} ردیف</td><td className="n"><b>{money(invoice.total_amount)}</b></td><td className="n">{money(invoice.paid_amount)}</td><td className="n">{money(invoice.balance_due)}</td><td><span className={`sf-status ${invoice.payment_status}`}>{statusLabel[invoice.payment_status]||invoice.payment_status}</span></td><td className="sf-actions"><Button onClick={()=>showReceipt(invoice)}><IconPrinter size={14}/> فیش</Button>{value(invoice.balance_due)>0&&invoice.payment_status!=='legacy'&&<Button variant="primary" onClick={()=>{setPayInvoice(invoice);setPaymentDraft({method:'cash',amount:String(invoice.balance_due),reference:''});}}>ثبت دریافت</Button>}</td></tr>)}</tbody></table></div>:<Empty icon="🧾" title="فاکتوری در این بازه نیست"/>}
    </section>}

    {tab==='cash'&&<div className="sf-cash-grid pos-no-print">
      <section className="card sf-panel"><div className="sf-panel-head"><div><h3>نوبت صندوق</h3><p>برای تطبیق، نقدی، کارت‌خوان و انتقال در ستون‌های جدا ثبت می‌شوند.</p></div><IconWallet size={19}/></div>
        {snapshot?.cash_session?<><div className="sf-session-state"><span className="sf-live-dot"/>صندوق باز · آغاز {dateFa(snapshot.cash_session.opened_at,true)}</div><div className="sf-cash-kpis"><div><span>نقد مورد انتظار</span><b>{money(snapshot.cash_session.expected_cash)}</b></div><div><span>کارت‌خوان ثبت‌شده</span><b>{money(snapshot.cash_session.card_collected)}</b></div><div><span>انتقال ثبت‌شده</span><b>{money(snapshot.cash_session.transfer_collected)}</b></div></div>
          <div className="sf-form-grid"><Field label="نقدِ شمارش‌شده"><input className="input mono" type="number" min="0" value={closeDraft.cash} onChange={(e)=>setCloseDraft({...closeDraft,cash:e.target.value})}/></Field><Field label="جمع نهایی کارت‌خوان"><input className="input mono" type="number" min="0" value={closeDraft.card} onChange={(e)=>setCloseDraft({...closeDraft,card:e.target.value})}/></Field><Field label="جمع انتقال‌ها"><input className="input mono" type="number" min="0" value={closeDraft.transfer} onChange={(e)=>setCloseDraft({...closeDraft,transfer:e.target.value})}/></Field><Field label="یادداشت بستن"><input className="input" value={closeDraft.note} onChange={(e)=>setCloseDraft({...closeDraft,note:e.target.value})}/></Field></div><Button variant="primary" disabled={busy} onClick={closeSession}><IconCheck size={15}/> بستن نوبت و ثبت اختلاف</Button>
        </>:<><div className="sf-empty-session">نوبت صندوقی باز نیست. پیش از ثبت دریافت، وجه آغازِ نوبت را بشمارید و ثبت کنید.</div><div className="sf-form-grid"><Field label="وجه نقد آغاز نوبت (تومان)"><input className="input mono" type="number" min="0" value={sessionDraft.openingCash} onChange={(e)=>setSessionDraft({...sessionDraft,openingCash:e.target.value})} placeholder="اگر صفر است ۰"/></Field><Field label="یادداشت آغاز"><input className="input" value={sessionDraft.note} onChange={(e)=>setSessionDraft({...sessionDraft,note:e.target.value})}/></Field></div><Button variant="primary" disabled={busy} onClick={startSession}><IconPlus size={15}/> بازکردن نوبت صندوق</Button></>}
      </section>
      <section className="card sf-panel"><div className="sf-panel-head"><div><h3>واریز / برداشت و هزینه</h3><p>هزینهٔ نقدی یا بانکی از ماندهٔ همان روش کم می‌شود؛ در سودوزیان هم ثبت می‌ماند.</p></div></div>
        <div className="sf-form-grid"><Field label="نوع گردش"><select className="select" value={movementDraft.direction} onChange={(e)=>setMovementDraft({...movementDraft,direction:e.target.value})}><option value="out">برداشت / واریز به بیرون</option><option value="in">واریز به صندوق/حساب</option></select></Field><Field label="روش"><select className="select" value={movementDraft.method} onChange={(e)=>setMovementDraft({...movementDraft,method:e.target.value as PayMethod})}>{Object.entries(methodLabel).map(([k,l])=><option key={k} value={k}>{l}</option>)}</select></Field><Field label="مبلغ"><input className="input mono" type="number" min="0" value={movementDraft.amount} onChange={(e)=>setMovementDraft({...movementDraft,amount:e.target.value})}/></Field><Field label="شرح الزامی"><input className="input" value={movementDraft.note} onChange={(e)=>setMovementDraft({...movementDraft,note:e.target.value})} placeholder="علت گردش"/></Field></div><Button onClick={recordMovement} disabled={busy||!snapshot?.cash_session}><IconPlus size={14}/> ثبت گردش مالی</Button>
        <div className="sf-divider"/><h4>هزینهٔ عملیاتی</h4><div className="sf-form-grid"><Field label="دسته"><input className="input" value={expenseDraft.category} onChange={(e)=>setExpenseDraft({...expenseDraft,category:e.target.value})} placeholder="حمل، کارمزد، نظافت…"/></Field><Field label="مبلغ"><input className="input mono" type="number" min="0" value={expenseDraft.amount} onChange={(e)=>setExpenseDraft({...expenseDraft,amount:e.target.value})}/></Field><Field label="پرداخت از"><select className="select" value={expenseDraft.method} onChange={(e)=>setExpenseDraft({...expenseDraft,method:e.target.value as PayMethod})}>{Object.entries(methodLabel).map(([k,l])=><option key={k} value={k}>{l}</option>)}</select></Field><Field label="یادداشت"><input className="input" value={expenseDraft.note} onChange={(e)=>setExpenseDraft({...expenseDraft,note:e.target.value})}/></Field></div><Button variant="primary" onClick={recordExpense} disabled={busy||!snapshot?.cash_session}><IconCoins size={15}/> ثبت هزینه و اثر صندوق</Button>
      </section>
      <section className="card sf-panel sf-span-2"><div className="sf-panel-head"><div><h3>بستن‌های اخیر صندوق</h3><p>اختلاف مثبت یعنی موجودی شمارش‌شده بیشتر از انتظار ثبت‌شده است.</p></div></div>{snapshot?.recent_closures.length?<div className="table-wrap"><table className="tbl sf-table"><thead><tr><th>روز</th><th>بسته‌شدن</th><th>نقد مورد انتظار / شمارش</th><th>اختلاف نقد</th><th>اختلاف کارت‌خوان</th><th>اختلاف انتقال</th><th>یادداشت</th></tr></thead><tbody>{snapshot.recent_closures.map((c)=><tr key={c.id}><td>{dateFa(c.business_day)}</td><td>{dateFa(c.closed_at,true)}</td><td>{money(c.expected_cash)} / {money(c.counted_cash)}</td><td className={value(c.cash_difference)===0?'':'sf-diff'}>{money(c.cash_difference)}</td><td className={value(c.card_difference)===0?'':'sf-diff'}>{money(c.card_difference)}</td><td className={value(c.transfer_difference)===0?'':'sf-diff'}>{money(c.transfer_difference)}</td><td>{c.close_note||'—'}</td></tr>)}</tbody></table></div>:<div className="sf-muted sf-pad">هنوز نوبت بسته‌شده‌ای ثبت نشده است.</div>}</section>
    </div>}

    {tab==='catalog'&&<section className="card sf-panel pos-no-print"><div className="sf-panel-head"><div><h3>طبقه‌بندی و کاتالوگ محصولات</h3><p>مواد خام ← مواد اولیه؛ رسپی تولید ← نیمه‌ساخته؛ فقط محصول نهایی در صندوق قابل‌فاکتور است. قیمت‌ها مستقل از منوی آنلاین‌اند.</p></div><Button variant="primary" onClick={openNewProduct}><IconPlus size={15}/> افزودن نوشیدنی / محصول نهایی</Button></div>
      {['پیتزا','نوشیدنی','محصول نهایی'].map((category)=><div className="sf-catalog-section" key={category}><h4>{category}<small>{faDigits(products.filter((p)=>p.category===category).length)} قلم</small></h4><div className="sf-catalog-grid">{products.filter((p)=>p.category===category).map((p)=><article className={`sf-catalog-card ${!p.active?'inactive':''}`} key={p.id}><div><span className="sf-product-cat">{p.sale_type==='recipe'?'رسپی و کسر BOM':'کالای نهاییِ انباری'}</span><b>{p.name}</b><small>{p.unit_label} · {p.unit_price==null?'قیمت تأیید نشده':`${money(p.unit_price)} قیمت داخلی صندوق`}</small>{p.sale_type==='stock'&&<small>موجودی: {num(value(p.on_hand_qty),2)} {p.base_unit}</small>}</div><span className={`sf-status ${p.active?'paid':'due'}`}>{p.active?'فعال':'غیرفعال'}</span><Button onClick={()=>editProduct(p)}>ویرایش</Button></article>)}</div></div>)}
    </section>}

    {tab==='reports'&&<div className="sf-report pos-no-print"><div className="sf-kpis">{[
      ['فاکتورها',faDigits(value(summary?.invoice_count)),'در بازهٔ انتخابی'],['فروش قبل از مالیات',money(summary?.subtotal),'پس از تخفیف'],['مالیات محاسبه‌شده',money(summary?.tax),'نرخ پیش‌فرض ۱۰٪'],['جمع فاکتورها',money(summary?.gross_total),'شامل مالیات'],['دریافت ثبت‌شده',money(summary?.paid),'نقد، کارت، انتقال'],['مطالبات',money(summary?.receivable),'ماندهٔ فاکتور'],['بهای کالای فروخته‌شده',money(summary?.cogs),'بر مبنای WAC'],['سود/زیان عملیاتی',money(summary?.net_profit),'با سربار روزانه']
    ].map(([label,val,sub])=><div className="card sf-kpi" key={label}><span>{label}</span><b>{val}</b><small>{sub}</small></div>)}</div>
      <section className="card sf-panel"><div className="sf-panel-head"><div><h3>فروش و مالیات به تفکیک روز</h3><p>ستون سبز: فروش خالص؛ کلاهک طلایی: مالیاتِ فاکتور؛ انتخاب تاریخ در سربرگ اعمال می‌شود.</p></div><span className="sf-legend"><i/>فروش <i className="tax"/>مالیات</span></div><DailySalesChart data={days}/></section>
      <section className="card sf-panel"><div className="sf-panel-head"><div><h3>سود و زیان روزانه</h3><p>پس از بهای مواد، ضایعات، هزینه‌های موردی و تخصیص سربار ثابت به روزهای ماه.</p></div></div><ProfitChart data={days}/></section>
      <section className="card sf-panel"><div className="sf-panel-head"><div><h3>جدول بستنِ روزانه</h3></div></div>{days.length?<div className="table-wrap"><table className="tbl sf-table"><thead><tr><th>روز</th><th>فاکتور</th><th>فروش</th><th>مالیات</th><th>نقد</th><th>کارت‌خوان</th><th>انتقال</th><th>سود/زیان</th></tr></thead><tbody>{[...days].reverse().map((d)=><tr key={d.day}><td>{dateFa(d.day)}</td><td>{faDigits(value(d.invoices))}</td><td className="n">{money(d.revenue)}</td><td className="n">{money(d.tax)}</td><td className="n">{money(d.cash_collected)}</td><td className="n">{money(d.card_collected)}</td><td className="n">{money(d.transfer_collected)}</td><td className={`n ${value(d.net_profit)<0?'sf-diff':''}`}><b>{money(d.net_profit)}</b></td></tr>)}</tbody></table></div>:<Empty icon="📊" title="گزارشی در این بازه نیست"/>}</section>
    </div>}

    <Modal open={receiptOpen&&!!receipt} onClose={()=>setReceiptOpen(false)} title={`فاکتور ${receipt?.invoice_number||''}`} sub="پیش‌نمایش فیش مشتری — چاپ روی فیش‌پرینتر نصب‌شده از مرورگر" wide footer={<><Button variant="primary" onClick={printReceipt}><IconPrinter size={15}/> چاپ فیش</Button><label className="sf-paper-choice">عرض چاپ<select className="select" value={paper} onChange={(e)=>setPaper(e.target.value as '58'|'80')}><option value="58">۵۸ میلی‌متر</option><option value="80">۸۰ میلی‌متر</option></select></label><Button variant="ghost" onClick={()=>setReceiptOpen(false)}>بستن</Button></>}>
      {receipt&&<ReceiptPaper receipt={receipt} paper={paper} restaurant={state.settings.restaurantFa||state.settings.restaurant||'فریا'} businessPhone={state.settings.restaurantPhone||''} businessAddress={state.settings.restaurantAddress||''} taxpayerId={state.settings.taxpayerId||''} economicCode={state.settings.economicCode||''}/>} 
    </Modal>

    <Modal open={productOpen} onClose={()=>setProductOpen(false)} title={productDraft.saleType==='recipe'?'قیمت صندوقِ پیتزا':'محصول نهایی'} sub="این کاتالوگ مستقل است؛ قیمتِ منوی عمومی سایت را تغییر نمی‌دهد." footer={<><Button variant="primary" disabled={busy} onClick={()=>void saveProduct()}><IconCheck size={15}/> ذخیرهٔ کالا</Button><Button variant="ghost" onClick={()=>setProductOpen(false)}>انصراف</Button></>}>
      <div className="sf-form-grid"><Field label="نام محصول"><input className="input" value={productDraft.name} disabled={productDraft.saleType==='recipe'} onChange={(e)=>setProductDraft({...productDraft,name:e.target.value})}/></Field><Field label="دستهٔ محصول نهایی"><select className="select" disabled={productDraft.saleType==='recipe'} value={productDraft.category} onChange={(e)=>setProductDraft({...productDraft,category:e.target.value})}><option value="نوشیدنی">نوشیدنی</option><option value="محصول نهایی">محصول نهایی</option><option value="پیتزا">پیتزا</option></select></Field><Field label="واحد فروش"><input className="input" value={productDraft.unit} disabled={productDraft.saleType==='recipe'} onChange={(e)=>setProductDraft({...productDraft,unit:e.target.value})}/></Field><Field label="قیمت فروش در صندوق (تومان)" hint="قیمت فعلی یا بهای تمام‌شده به این فیلد منتقل نمی‌شود."><input className="input mono" type="number" min="0" step="1000" value={productDraft.price} onChange={(e)=>setProductDraft({...productDraft,price:e.target.value})}/></Field>{productDraft.saleType==='stock'&&<label className="sf-check sf-span-2"><input type="checkbox" checked={productDraft.trackExpiry} onChange={(e)=>setProductDraft({...productDraft,trackExpiry:e.target.checked})}/>برای هر لاتِ خرید/افتتاحیه، تاریخ انقضا ثبت شود</label>}<label className="sf-check sf-span-2"><input type="checkbox" checked={productDraft.active} onChange={(e)=>setProductDraft({...productDraft,active:e.target.checked})}/>فعال و قابل انتخاب در فاکتور باشد</label></div>
      {productDraft.saleType==='stock'&&<div className="sf-hint">این کالا یک کارتِ انبارِ «محصول نهایی» می‌سازد. موجودی‌اش را جداگانه از بخش انبار با خرید یا شمارش افتتاحیه ثبت کنید؛ تا موجودی کافی نباشد، صدور فاکتور اتمیک رد می‌شود.</div>}
    </Modal>

    <Modal open={!!payInvoice} onClose={()=>setPayInvoice(null)} title="ثبت دریافتِ فاکتور" sub={`${payInvoice?.invoice_number||''} · مانده ${money(payInvoice?.balance_due)}`} footer={<><Button variant="primary" onClick={saveInvoicePayment} disabled={busy||!snapshot?.cash_session}><IconCheck size={15}/> ثبت دریافت</Button><Button variant="ghost" onClick={()=>setPayInvoice(null)}>انصراف</Button></>}>
      <div className="sf-form-grid"><Field label="روش دریافت"><select className="select" value={paymentDraft.method} onChange={(e)=>setPaymentDraft({...paymentDraft,method:e.target.value as PayMethod})}>{Object.entries(methodLabel).map(([k,l])=><option key={k} value={k}>{l}</option>)}</select></Field><Field label="مبلغ دریافتی"><input className="input mono" type="number" min="1" value={paymentDraft.amount} onChange={(e)=>setPaymentDraft({...paymentDraft,amount:e.target.value})}/></Field><Field label="شمارهٔ رسید/پیگیری" full><input className="input" value={paymentDraft.reference} onChange={(e)=>setPaymentDraft({...paymentDraft,reference:e.target.value})}/></Field></div>{!snapshot?.cash_session&&<div className="sf-hint warning">برای ثبت دریافت ابتدا نوبت صندوق را باز کنید.</div>}
    </Modal>
  </div>;
}

function ReceiptPaper({receipt,paper,restaurant,businessPhone,businessAddress,taxpayerId,economicCode}:{
  receipt:Receipt; paper:'58'|'80'; restaurant:string; businessPhone:string; businessAddress:string; taxpayerId:string; economicCode:string;
}){
  const beforeDiscount=receipt.lines.reduce((sum,line)=>sum+value(line.unit_price)*value(line.qty),0);
  const discount=receipt.lines.reduce((sum,line)=>sum+value(line.discount_amount),0);
  return <article className={`sf-receipt receipt-${paper}`}>
    <header><b className="sf-receipt-brand">{restaurant}</b><strong>رسید فروش</strong><span className="sf-receipt-sub">نسخهٔ مشتری · فیش داخلی</span></header>
    {(businessPhone||businessAddress||taxpayerId||economicCode)&&<div className="sf-receipt-seller">
      {businessPhone&&<div><span>تلفن</span><b dir="ltr">{businessPhone}</b></div>}
      {businessAddress&&<div className="address"><span>نشانی</span><b>{businessAddress}</b></div>}
      {taxpayerId&&<div><span>شناسهٔ مالیاتی</span><b dir="ltr">{taxpayerId}</b></div>}
      {economicCode&&<div><span>کد اقتصادی</span><b dir="ltr">{economicCode}</b></div>}
    </div>}
    <div className="sf-receipt-meta"><span>شمارهٔ فاکتور</span><b dir="ltr">{receipt.invoice_number}</b><span>تاریخ و ساعت</span><b>{dateFa(receipt.sold_at,true)}</b>{receipt.customer_name&&<><span>مشتری</span><b>{receipt.customer_name}</b></>}{receipt.customer_phone&&<><span>تلفن مشتری</span><b dir="ltr">{receipt.customer_phone}</b></>}</div>
    <div className="sf-receipt-lines"><div className="sf-receipt-line head"><span>شرح کالا</span><span>تعداد</span><span>مبلغ ردیف</span></div>{receipt.lines.map((line,index)=><div className="sf-receipt-line" key={`${line.product_id}-${index}`}><span>{line.name}<small>{money(line.unit_price)} × {num(value(line.qty),2)}{value(line.discount_amount)>0?` · تخفیف ${money(line.discount_amount)}`:''}</small></span><b>{num(value(line.qty),2)}</b><b>{money(line.net_revenue)}</b></div>)}</div>
    <div className="sf-receipt-totals"><div><span>جمع کالاها قبل از تخفیف</span><b>{money(beforeDiscount)}</b></div>{discount>0&&<div><span>تخفیف کل</span><b>− {money(discount)}</b></div>}<div><span>جمع مشمول مالیات</span><b>{money(receipt.subtotal)}</b></div><div><span>مالیات و عوارض ({num(value(receipt.tax_rate),0)}٪)</span><b>{money(receipt.tax_amount)}</b></div><div className="grand"><span>قابل پرداخت</span><b>{money(receipt.total_amount)}</b></div><div><span>دریافتی</span><b>{money(receipt.paid_amount)}</b></div><div><span>مانده</span><b>{money(receipt.balance_due)}</b></div></div>
    {receipt.payments?.length>0&&<div className="sf-receipt-payment">{receipt.payments.map((payment,index)=><div key={index}><span>{methodLabel[payment.method]}{payment.reference?.trim()?` · ${payment.reference.trim()}`:''}</span><b>{money(payment.amount)}</b></div>)}</div>}
    <footer><b>سپاس از خرید شما</b><small>رسید داخلی فروش است؛ ارسال صورتحساب الکترونیکی به سامانهٔ مؤدیان در این نسخه انجام نمی‌شود.</small></footer>
  </article>;
}
