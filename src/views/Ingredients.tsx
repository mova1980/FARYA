import React, { useMemo, useState } from 'react';
import { useStore, UNITS } from '../lib/store';
import { manualPrice, previousPrice } from '../lib/calc';
import { Button, Drawer, Empty, Field, Modal, MoneyInput, SearchBox, Sparkline, Switch } from '../components/ui';
import { JalaliDatePicker } from '../components/DatePicker';
import { faDigits, num, pct, signedPct, uid } from '../lib/format';
import { todayJalaliStr } from '../lib/jalali';
import { IconEdit, IconPlus, IconTrash, IconLeaf, IconCheck, IconX, IconChevronL } from '../components/Icons';
import { useMedia } from '../lib/media';
import type { Ingredient, PricePoint } from '../lib/types';

const emptyForm = () => ({
  name: '', unit: 'کیلو', price: null as number | null, date: todayJalaliStr(), note: '',
});

export default function Ingredients() {
  const { state, dispatch, engine, toast } = useStore();
  const { mobile } = useMedia();
  const [q, setQ] = useState('');
  const [unitFilter, setUnitFilter] = useState('');
  const [sort, setSort] = useState<'name' | 'price' | 'date'>('name');
  const [open, setOpen] = useState<Ingredient | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [editing, setEditing] = useState<Ingredient | null>(null);
  const [newPrice, setNewPrice] = useState<{ price: number | null; date: string; note: string }>({
    price: null, date: todayJalaliStr(), note: '',
  });
  const [confirmDelete, setConfirmDelete] = useState<Ingredient | null>(null);

  const rows = useMemo(() => {
    const list = state.ingredients.filter((i) => {
      const matchQ = !q || i.name.includes(q) || (i.note || '').includes(q);
      const matchU = !unitFilter || i.unit === unitFilter;
      return matchQ && matchU;
    });
    const withPrice = list.map((i) => ({
      ing: i,
      price: engine.priceOf[i.id] ?? manualPrice(i),
      last: i.prices[i.prices.length - 1],
      prev: previousPrice(i),
    }));
    withPrice.sort((a, b) => {
      if (sort === 'price') return b.price - a.price;
      if (sort === 'date') return (b.last?.date || '').localeCompare(a.last?.date || '');
      return a.ing.name.localeCompare(b.ing.name, 'fa');
    });
    return withPrice;
  }, [state.ingredients, q, unitFilter, sort, engine]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setFormOpen(true);
  };

  const openEdit = (ing: Ingredient) => {
    setEditing(ing);
    const last = ing.prices[ing.prices.length - 1];
    setForm({
      name: ing.name, unit: ing.unit,
      price: last ? last.price : null,
      date: last?.date || todayJalaliStr(),
      note: ing.note || '',
    });
    setFormOpen(true);
  };

  const saveForm = () => {
    if (!form.name.trim()) { toast('نام مادهٔ اولیه را وارد کنید', 'err'); return; }
    const date = form.date && form.date.trim() ? form.date : todayJalaliStr();
    if (editing) {
      dispatch({
        type: 'ing/update', id: editing.id,
        patch: { name: form.name.trim(), unit: form.unit, note: form.note },
      });
      if (form.price != null) {
        const last = editing.prices[editing.prices.length - 1];
        if (!last || last.price !== form.price || last.date !== date) {
          dispatch({
            type: 'ing/addPrice', id: editing.id,
            point: { id: uid('p'), price: form.price, date, note: form.note || 'ویرایش دستی' },
          });
        }
      }
      toast(`«${form.name}» به‌روزرسانی شد`, 'ok');
    } else {
      const id = uid('ing');
      dispatch({
        type: 'ing/add',
        ing: {
          id,
          name: form.name.trim(),
          unit: form.unit,
          note: form.note,
          createdAt: date,
          prices: form.price != null
            ? [{ id: uid('p'), price: form.price, date, note: 'ثبت اولیه' }]
            : [],
        },
      });
      toast(`«${form.name}» با موفقیت افزوده شد`, 'ok');
    }
    setFormOpen(false);
  };

  const addPrice = () => {
    if (!open) return;
    if (newPrice.price == null) { toast('مبلغ قیمت را وارد کنید', 'err'); return; }
    // اگر تاریخ وارد نشده باشد، امروزِ شمسی از تقویم خوانده می‌شود
    const date = (newPrice.date || '').trim() ? newPrice.date : todayJalaliStr();
    const point: PricePoint = {
      id: uid('p'), price: newPrice.price, date, note: newPrice.note || '',
    };
    dispatch({ type: 'ing/addPrice', id: open.id, point });
    const updated = { ...open, prices: [...open.prices, point].sort((a, b) => (a.date < b.date ? -1 : 1)) };
    setOpen(updated);
    setNewPrice({ price: null, date: todayJalaliStr(), note: '' });
    toast(`قیمت جدیدِ «${open.name}» در تاریخ ${faDigits(date)} ثبت شد`, 'ok');
  };

  const delPrice = (pid: string) => {
    if (!open) return;
    dispatch({ type: 'ing/deletePrice', id: open.id, priceId: pid });
    setOpen({ ...open, prices: open.prices.filter((p) => p.id !== pid) });
    toast('ردیفِ قیمت حذف شد', 'warn');
  };

  const doDelete = () => {
    if (!confirmDelete) return;
    dispatch({ type: 'ing/delete', id: confirmDelete.id });
    toast(`«${confirmDelete.name}» حذف شد`, 'warn');
    setConfirmDelete(null);
    setOpen(null);
  };

  return (
    <div className="view">
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <div>
            <h3>مواد اولیه و قیمت‌های روز</h3>
            <div className="sub">
              {faDigits(state.ingredients.length)} ماده — هر قیمت با تاریخ شمسی نگهداری می‌شود
            </div>
          </div>
          <div className="spacer" />
          <SearchBox value={q} onChange={setQ} placeholder="جستجوی نام یا یادداشت…" />
          <select className="select" style={{ width: 120 }} value={unitFilter}
            onChange={(e) => setUnitFilter(e.target.value)}>
            <option value="">همهٔ واحدها</option>
            {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
          <select className="select" style={{ width: 140 }} value={sort}
            onChange={(e) => setSort(e.target.value as any)}>
            <option value="name">مرتب‌سازی: نام</option>
            <option value="price">مرتب‌سازی: قیمت</option>
            <option value="date">مرتب‌سازی: تاریخ</option>
          </select>
          <Button variant="primary" onClick={openCreate}><IconPlus size={16} /> مادهٔ اولیهٔ جدید</Button>
        </div>

        {rows.length === 0 ? (
          <Empty icon="🌿" title="ماده‌ای یافت نشد" sub="با دکمهٔ بالا مادهٔ اولیهٔ تازه‌ای تعریف کنید"
            action={<Button variant="primary" onClick={openCreate}>افزودن مادهٔ اولیه</Button>} />
        ) : mobile ? (
          <div className="row-cards" style={{ padding: '0 14px 14px' }}>
            {rows.map(({ ing, price, last, prev }) => {
              const change = prev && prev > 0 ? (price - prev) / prev : null;
              const auto = engine.sourceOf[ing.id] === 'recipe';
              return (
                <div className="row-card" key={ing.id}
                  onClick={() => { setOpen(ing); setNewPrice({ price: null, date: todayJalaliStr(), note: '' }); }}>
                  <div className="rc-head">
                    <div style={{ minWidth: 0 }}>
                      <div className="rc-title">{ing.name}</div>
                      <div className="rc-sub">
                        {auto ? 'محاسبه از دستور پخت' : (ing.note || 'قیمت‌گذاری دستی')}
                      </div>
                    </div>
                    <div className="rc-side">
                      <span className="badge-soft">{ing.unit}</span>
                      <IconChevronL size={16} />
                    </div>
                  </div>
                  <div className="rc-metrics">
                    <div className="rc-m">
                      <div className="l">قیمت فعلی</div>
                      <div className="v num">{num(Math.round(price))}</div>
                    </div>
                    <div className="rc-m">
                      <div className="l">تغییر</div>
                      <div className="v num" style={{
                        color: change == null ? 'var(--muted)'
                          : change > 0 ? 'var(--berry)' : change < 0 ? 'var(--moss)' : 'var(--muted)',
                      }}>{change == null ? '—' : signedPct(change, 0)}</div>
                    </div>
                    <div className="rc-m">
                      <div className="l">آخرین تاریخ</div>
                      <div className="v num" style={{ fontSize: 12 }}>{faDigits(last?.date || '—')}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>نام مادهٔ اولیه</th>
                  <th>واحد</th>
                  <th className="n">قیمت فعلی</th>
                  <th className="n">تغییر</th>
                  <th>آخرین تاریخ</th>
                  <th style={{ width: 130 }}>روند</th>
                  <th>منبع</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map(({ ing, price, last, prev }) => {
                  const change = prev && prev > 0 ? (price - prev) / prev : null;
                  const auto = engine.sourceOf[ing.id] === 'recipe';
                  return (
                    <tr key={ing.id} onClick={() => { setOpen(ing); setNewPrice({ price: null, date: todayJalaliStr(), note: '' }); }}
                      style={{ cursor: 'pointer' }}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{ing.name}</div>
                        {ing.note && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{ing.note}</div>}
                      </td>
                      <td><span className="badge-soft">{ing.unit}</span></td>
                      <td className="n" style={{ fontWeight: 700 }}>{num(Math.round(price))}</td>
                      <td className="n" style={{
                        color: change == null ? 'var(--muted)'
                          : change > 0 ? 'var(--berry)' : change < 0 ? 'var(--moss)' : 'var(--muted)',
                        fontWeight: 600,
                      }}>
                        {change == null ? '—' : signedPct(change, 0)}
                      </td>
                      <td style={{ fontSize: 12.5 }}>{faDigits(last?.date || '—')}</td>
                      <td>
                        <Sparkline points={ing.prices.map((p) => p.price)} w={110} h={30} />
                      </td>
                      <td>
                        {auto
                          ? <span className="chip green">محاسبه از دستور پخت</span>
                          : <span className="chip">دستی</span>}
                      </td>
                      <td>
                        <div className="row-actions">
                          <button className="icon-btn" title="ویرایش"
                            onClick={(e) => { e.stopPropagation(); openEdit(ing); }}><IconEdit size={15} /></button>
                          <button className="icon-btn danger" title="حذف"
                            onClick={(e) => { e.stopPropagation(); setConfirmDelete(ing); }}><IconTrash size={15} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ---------------------------------------------------------- drawer */}
      <Drawer
        open={!!open}
        onClose={() => setOpen(null)}
        title={open && (
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{open?.name}</div>
            <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
              تاریخچهٔ قیمت‌ها · واحد: {open?.unit}
            </div>
          </div>
        )}
        footer={open && (
          <>
            <Button variant="primary" onClick={addPrice}><IconCheck size={15} /> ثبت قیمت جدید</Button>
            <Button onClick={() => openEdit(open)}><IconEdit size={15} /> ویرایش ماده</Button>
          </>
        )}
      >
        {open && (
          <>
            <div className="card card-pad" style={{ background: 'var(--paper-2)', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 24, fontWeight: 800 }} className="num">
                  {num(Math.round(engine.priceOf[open.id] ?? manualPrice(open)))}
                </span>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>تومان / {open.unit}</span>
                {engine.sourceOf[open.id] === 'recipe' && (
                  <span className="chip green" style={{ marginInlineStart: 'auto' }}><IconLeaf size={12} /> خودکار</span>
                )}
              </div>
              <div style={{ marginTop: 10 }}>
                <Sparkline points={open.prices.map((p) => p.price)} w={400} h={54} />
              </div>
            </div>

            <h4 style={{ fontSize: 13, marginBottom: 10 }}>ثبت قیمت جدید</h4>
            <div className="form-grid" style={{ marginBottom: 6 }}>
              <Field label="قیمت جدید (تومان)">
                <MoneyInput value={newPrice.price} onChange={(v) => setNewPrice({ ...newPrice, price: v })} placeholder="مثل ۹۸۰۰۰" />
              </Field>
              <JalaliDatePicker
                label="تاریخِ اِعمالِ قیمت (شمسی)"
                value={newPrice.date}
                onChange={(d) => setNewPrice({ ...newPrice, date: d })}
                hint="اگر خالی بماند، امروزِ شمسی از تقویم خوانده می‌شود"
              />
              <Field label="یادداشت (اختیاری)" full>
                <input className="input" value={newPrice.note}
                  onChange={(e) => setNewPrice({ ...newPrice, note: e.target.value })}
                  placeholder="مثل: خرید از تأمین‌کنندهٔ جدید" />
              </Field>
            </div>

            <div className="divider" style={{ margin: '16px 0 12px' }} />
            <h4 style={{ fontSize: 13, marginBottom: 8 }}>تاریخچه ({faDigits(open.prices.length)})</h4>
            {open.prices.length === 0 && <div style={{ fontSize: 12, color: 'var(--muted)' }}>هنوز قیمتی ثبت نشده است.</div>}
            {[...open.prices].reverse().map((p, idx) => (
              <div className="stat-row" key={p.id}>
                <span className="l">
                  <b className="num">{num(Math.round(p.price))}</b>
                  <span style={{ color: 'var(--muted)', fontSize: 11, marginInlineStart: 8 }}>
                    {faDigits(p.date)}
                  </span>
                  {p.note && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{p.note}</div>}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {idx === 0 && <span className="chip green">جاری</span>}
                  <button className="icon-btn danger" onClick={() => delPrice(p.id)}><IconTrash size={14} /></button>
                </span>
              </div>
            ))}
          </>
        )}
      </Drawer>

      {/* ----------------------------------------------------------- modal */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? `ویرایش «${editing.name}»` : 'مادهٔ اولیهٔ جدید'}
        sub="قیمتِ اولیه همراه با تاریخِ شمسی ثبت می‌شود"
        footer={<>
          <Button variant="primary" onClick={saveForm}><IconCheck size={15} /> ذخیره</Button>
          <Button variant="ghost" onClick={() => setFormOpen(false)}>انصراف</Button>
        </>}
      >
        <div className="form-grid">
          <Field label="نام مادهٔ اولیه" full>
            <input className="input" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="مثل: پنیر موزارال محلی" autoFocus />
          </Field>
          <Field label="واحد اندازه‌گیری">
            <select className="select" value={form.unit}
              onChange={(e) => setForm({ ...form, unit: e.target.value })}>
              {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </Field>
          <Field label="قیمت واحد (تومان)">
            <MoneyInput value={form.price} onChange={(v) => setForm({ ...form, price: v })} placeholder="۰" />
          </Field>
          <JalaliDatePicker
            label="تاریخِ قیمت (شمسی)"
            value={form.date}
            onChange={(d) => setForm({ ...form, date: d })}
            hint="پیش‌فرض: امروز"
          />
          <Field label="یادداشت" full>
            <input className="input" value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="اختیاری" />
          </Field>
        </div>
      </Modal>

      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="حذف مادهٔ اولیه"
        sub={confirmDelete?.name}
        footer={<>
          <Button variant="danger" onClick={doDelete}><IconTrash size={15} /> حذف</Button>
          <Button variant="ghost" onClick={() => setConfirmDelete(null)}>انصراف</Button>
        </>}
      >
        <p style={{ fontSize: 13, color: 'var(--txt-2)' }}>
          «{confirmDelete?.name}» از همهٔ دستورهای پخت حذف می‌شود. این کار قابل بازگشت نیست
          (مگر با بازیابی فایل پشتیبان).
        </p>
      </Modal>
    </div>
  );
}
