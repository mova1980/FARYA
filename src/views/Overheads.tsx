import React, { useMemo, useState } from 'react';
import { OVERHEAD_PRESETS, useStore } from '../lib/store';
import { Button, Field, Modal, MoneyInput, Switch } from '../components/ui';
import { faDigits, num, pct, uid } from '../lib/format';
import { IconPlus, IconTrash, IconEdit, IconCheck, IconLayers, IconBolt, IconInfo } from '../components/Icons';
import { useMedia } from '../lib/media';
import type { Overhead } from '../lib/types';

const KIND_LABEL: Record<Overhead['kind'], string> = {
  'per-portion': 'به‌ازای هر پرس',
  monthly: 'ماهانه (تسهیم)',
  percent: 'درصدی از بهای مواد',
};

const blank = (): Overhead => ({
  id: uid('ovh'), name: '', kind: 'monthly', amount: 0, volume: 3000, active: true, note: '',
});

export default function Overheads() {
  const { state, dispatch, engine, toast } = useStore();
  const { mobile } = useMedia();
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<Overhead>(blank());
  const [editing, setEditing] = useState(false);
  const [preset, setPreset] = useState('');
  const [confirm, setConfirm] = useState<Overhead | null>(null);

  const coef = state.settings.overheadExtraCoef || 0;
  const setCoef = (v: number) => dispatch({ type: 'settings', patch: { overheadExtraCoef: v } });

  const menuItems = state.items.filter((i) => i.category !== 'نیمه‌ساخته' && i.active);

  const impact = useMemo(() => {
    const cur = menuItems.reduce((a, i) => a + (engine.byItem[i.id]?.overhead || 0), 0);
    const base = menuItems.reduce((a, i) => a + (engine.byItem[i.id]?.overheadBase || 0), 0);
    const totalCur = menuItems.reduce((a, i) => a + (engine.byItem[i.id]?.total || 0), 0);
    const totalBase = totalCur - (cur - base);
    return {
      base: base / Math.max(1, menuItems.length),
      cur: cur / Math.max(1, menuItems.length),
      totalBase: totalBase / Math.max(1, menuItems.length),
      totalCur: totalCur / Math.max(1, menuItems.length),
      deltaPerItem: (cur - base) / Math.max(1, menuItems.length),
    };
  }, [menuItems, engine]);

  const openCreate = (withPreset?: string) => {
    const p = OVERHEAD_PRESETS.find((x) => x.name === withPreset);
    setEditing(false);
    setForm(p ? { ...blank(), name: p.name, kind: p.kind, note: p.note } : blank());
    setFormOpen(true);
  };

  const openEdit = (o: Overhead) => { setEditing(true); setForm({ ...o }); setFormOpen(true); };

  const save = () => {
    if (!form.name.trim()) { toast('نام آیتم سربار را وارد کنید', 'err'); return; }
    if (editing) {
      dispatch({ type: 'ovh/update', id: form.id, patch: form });
      toast('آیتم سربار به‌روزرسانی شد', 'ok');
    } else {
      dispatch({ type: 'ovh/add', ovh: { ...form, id: uid('ovh') } });
      toast(`«${form.name}» به سربارها اضافه شد`, 'ok');
    }
    setFormOpen(false);
  };

  const allocation = useMemo(() => menuItems
    .map((i) => ({ item: i, c: engine.byItem[i.id] }))
    .filter((x) => x.c)
    .sort((a, b) => b.c.overhead - a.c.overhead), [menuItems, engine]);

  const totalMonthly = state.overheads
    .filter((o) => o.active && o.kind === 'monthly')
    .reduce((a, o) => a + (o.amount || 0), 0);

  return (
    <div className="view">
      {/* ------------------------------------------------- ضریب اضافی سربار */}
      <div className="card card-pad" style={{
        marginBottom: 16, overflow: 'hidden',
        background: 'linear-gradient(120deg,#0c110d 0%, #16301f 60%, #1f4a32 100%)',
        border: 'none', color: '#fff',
      }}>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: '1 1 320px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <IconBolt size={17} />
              <b style={{ fontSize: 15 }}>ضریبِ اضافیِ سربار</b>
              <span className="chip" style={{ background: 'rgba(255,255,255,.12)', color: '#fff', border: 'none' }}>
                سراسری
              </span>
            </div>
            <p style={{ fontSize: 12.5, color: 'rgba(255,255,255,.66)', lineHeight: 1.9 }}>
              هر ضریبی که اینجا وارد کنید، مستقیماً روی <b>جمعِ سربارِ تخصیصی</b> هر آیتم اعمال می‌شود و
              در نتیجه وارد <b>بهای تمام‌شده</b> می‌گردد — مناسب برای خطا، ریسک، تورم یا هزینه‌های پیش‌بینی‌نشده.
            </p>
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              {[0, 5, 10, 15, 25].map((v) => (
                <button key={v} className="btn sm"
                  style={{
                    background: Math.round(coef * 100) === v ? 'var(--leaf)' : 'rgba(255,255,255,.1)',
                    color: '#fff', border: 'none',
                  }}
                  onClick={() => setCoef(v / 100)}>{faDigits(v)}٪</button>
              ))}
            </div>
          </div>

          <div style={{ flex: '0 0 260px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <input
                type="range" min={0} max={100} step={1} value={Math.round(coef * 100)}
                onChange={(e) => setCoef(Number(e.target.value) / 100)}
                style={{ width: '100%', accentColor: '#7fbf5a' }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
              <div style={{
                fontSize: 34, fontWeight: 800, color: 'var(--leaf)',
                fontVariantNumeric: 'tabular-nums',
              }}>{faDigits(Math.round(coef * 100))}٪</div>
              <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,.6)' }}>
                ضریب فعلی
              </div>
            </div>
          </div>

          <div style={{
            flex: '1 1 300px', background: 'rgba(255,255,255,.06)', borderRadius: 16, padding: '14px 16px',
            border: '1px solid rgba(255,255,255,.1)',
          }}>
            <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,.6)', marginBottom: 8 }}>
              اثرِ لحظه‌ای روی هر پرس (میانگین)
            </div>
            {[
              { l: 'سربارِ پایه', v: impact.base, c: 'rgba(255,255,255,.75)' },
              { l: 'سربار پس از ضریب', v: impact.cur, c: '#fff' },
              { l: 'افزایشِ هر پرس', v: impact.deltaPerItem, c: 'var(--gold)' },
            ].map((x) => (
              <div key={x.l} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 12.5 }}>
                <span style={{ color: 'rgba(255,255,255,.6)' }}>{x.l}</span>
                <b style={{ color: x.c, fontVariantNumeric: 'tabular-nums' }}>
                  {x.v >= 0 ? '' : '−'}{faDigits(Math.round(Math.abs(x.v)).toLocaleString('en-US'))}
                </b>
              </div>
            ))}
            <div style={{ borderTop: '1px dashed rgba(255,255,255,.16)', marginTop: 8, paddingTop: 8, display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
              <span style={{ color: 'rgba(255,255,255,.6)' }}>بهای تمام‌شدهٔ هر پرس</span>
              <b className="num" style={{ color: '#fff' }}>
                {faDigits(Math.round(impact.totalBase).toLocaleString('en-US'))}
                {' → '}
                <span style={{ color: 'var(--leaf)' }}>
                  {faDigits(Math.round(impact.totalCur).toLocaleString('en-US'))}
                </span>
              </b>
            </div>
          </div>
        </div>
      </div>

      {/* -------------------------------------------------------- لیست سربار */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <div>
            <h3>آیتم‌های سربار</h3>
            <div className="sub">
              {faDigits(state.overheads.filter((o) => o.active).length)} فعال ·
              مجموعِ ماهانه: {faDigits(Math.round(totalMonthly).toLocaleString('en-US'))} تومان
            </div>
          </div>
          <div className="spacer" />
          <select className="select" style={{ width: 210 }} value={preset}
            onChange={(e) => { setPreset(e.target.value); if (e.target.value) openCreate(e.target.value); }}>
            <option value="">افزودن از لیستِ آماده…</option>
            {OVERHEAD_PRESETS.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
          </select>
          <Button variant="primary" onClick={() => openCreate()}><IconPlus size={16} /> آیتم سربارِ دلخواه</Button>
        </div>

        <div className="card-pad" style={{ paddingTop: 0 }}>
          <div className="grid g3">
            {state.overheads.map((o) => (
              <div key={o.id} className="card card-pad hoverable"
                style={{ opacity: o.active ? 1 : .6 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{o.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                      {KIND_LABEL[o.kind]}
                      {o.kind === 'monthly' && ` · ${faDigits(o.volume || state.settings.monthlyPortions)} پرس/ماه`}
                    </div>
                  </div>
                  <div style={{ marginInlineStart: 'auto' }}>
                    <Switch checked={o.active} onChange={(v) => dispatch({ type: 'ovh/update', id: o.id, patch: { active: v } })} />
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 12 }}>
                  <span style={{ fontSize: 22, fontWeight: 800 }} className="num">
                    {num(Math.round(o.amount))}
                  </span>
                  <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                    {o.kind === 'percent' ? 'درصد' : 'تومان'}
                  </span>
                  {o.kind === 'monthly' && (
                    <span style={{ fontSize: 11.5, color: 'var(--clay)', marginInlineStart: 'auto' }}>
                      ≈ {num(Math.round((o.amount || 0) / (o.volume || state.settings.monthlyPortions || 1)))} / پرس
                    </span>
                  )}
                </div>
                {o.note && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>{o.note}</div>}
                <div style={{ display: 'flex', gap: 4, marginTop: 10, justifyContent: 'flex-end' }}>
                  <button className="icon-btn" onClick={() => openEdit(o)}><IconEdit size={15} /></button>
                  <button className="icon-btn danger" onClick={() => setConfirm(o)}><IconTrash size={15} /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------ تخصیص به آیتم */}
      <div className="card">
        <div className="card-head">
          <div>
            <h3>سهمِ سربار در هر آیتم</h3>
            <div className="sub">بر اساس سربارهای تخصیصیِ هر آیتم و ضریبِ اضافی ({Math.round(coef * 100)}٪)</div>
          </div>
        </div>
        {mobile ? (
          <div className="row-cards" style={{ padding: '0 14px 14px' }}>
            {allocation.map(({ item, c }) => (
              <div className="row-card" key={item.id}>
                <div className="rc-head">
                  <div style={{ minWidth: 0 }}>
                    <div className="rc-title">{item.name}</div>
                    <div className="rc-sub">
                      {item.overheadIds.length
                        ? item.overheadIds.map((id) => state.overheads.find((o) => o.id === id)?.name)
                          .filter(Boolean).join(' · ')
                        : 'بدون سربار'}
                    </div>
                  </div>
                  <div className="rc-side"><span className="badge-soft">{item.category}</span></div>
                </div>
                <div className="rc-metrics">
                  <div className="rc-m">
                    <div className="l">سربارِ پایه</div>
                    <div className="v num">{num(Math.round(c.overheadBase))}</div>
                  </div>
                  <div className="rc-m">
                    <div className="l">با ضریبِ اضافی</div>
                    <div className="v num" style={{ color: 'var(--moss)' }}>{num(Math.round(c.overhead))}</div>
                  </div>
                  <div className="rc-m">
                    <div className="l">سهم از تمام‌شده</div>
                    <div className="v num">{pct(c.total ? c.overhead / c.total : 0, 1)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>آیتم</th>
                <th>سربارهای تخصیصی</th>
                <th className="n">سربار پایه</th>
                <th className="n">با ضریب</th>
                <th className="n">سهم از تمام‌شده</th>
              </tr>
            </thead>
            <tbody>
              {allocation.map(({ item, c }) => (
                <tr key={item.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{item.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>{item.category}</div>
                  </td>
                  <td style={{ fontSize: 11.5, color: 'var(--txt-2)' }}>
                    {item.overheadIds.length
                      ? item.overheadIds
                        .map((id) => state.overheads.find((o) => o.id === id)?.name)
                        .filter(Boolean).join(' · ')
                      : <span style={{ color: 'var(--muted)' }}>بدون سربار</span>}
                  </td>
                  <td className="n">{num(Math.round(c.overheadBase))}</td>
                  <td className="n" style={{ fontWeight: 700 }}>{num(Math.round(c.overhead))}</td>
                  <td className="n">{pct(c.total ? c.overhead / c.total : 0, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </div>

      {/* -------------------------------------------------------------- modal */}
      <Modal
        open={formOpen} onClose={() => { setFormOpen(false); setPreset(''); }}
        title={editing ? `ویرایش «${form.name}»` : 'آیتم سربارِ جدید'}
        sub="نحوهٔ تسهیم هزینه روی هر پرس را مشخص کنید"
        footer={<>
          <Button variant="primary" onClick={save}><IconCheck size={15} /> ذخیره</Button>
          <Button variant="ghost" onClick={() => { setFormOpen(false); setPreset(''); }}>انصراف</Button>
        </>}
      >
        <div className="form-grid">
          <Field label="نام آیتم سربار" full>
            <input className="input" value={form.name} autoFocus
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="مثل: اجاره ماهانه" />
          </Field>
          <Field label="نوعِ تسهیم">
            <select className="select" value={form.kind}
              onChange={(e) => setForm({ ...form, kind: e.target.value as Overhead['kind'] })}>
              {Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <Field label={form.kind === 'percent' ? 'درصد' : 'مبلغ (تومان)'}>
            <MoneyInput value={form.amount} onChange={(v) => setForm({ ...form, amount: v ?? 0 })} />
          </Field>
          {form.kind === 'monthly' && (
            <Field label="تعداد پرس در ماه (مبنای تسهیم)" full
              hint="مبلغ ماهانه تقسیم بر این عدد می‌شود">
              <MoneyInput value={form.volume ?? state.settings.monthlyPortions}
                onChange={(v) => setForm({ ...form, volume: v ?? 1 })} />
            </Field>
          )}
          <Field label="یادداشت" full>
            <input className="input" value={form.note || ''}
              onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </Field>
          <div className="full" style={{
            display: 'flex', gap: 8, alignItems: 'center', fontSize: 12,
            color: 'var(--txt-2)', background: 'var(--paper-2)', padding: '10px 12px', borderRadius: 12,
          }}>
            <IconInfo size={16} />
            {form.kind === 'monthly'
              ? <>سهم هر پرس ≈ {num(Math.round((form.amount || 0) / (form.volume || state.settings.monthlyPortions || 1)))} تومان</>
              : form.kind === 'percent'
                ? <>سهم هر پرس = درصدی از بهای موادِ همان آیتم</>
                : <>این مبلغ مستقیماً به هر پرس اضافه می‌شود</>}
          </div>
        </div>
      </Modal>

      <Modal
        open={!!confirm} onClose={() => setConfirm(null)} title="حذف آیتم سربار" sub={confirm?.name}
        footer={<>
          <Button variant="danger" onClick={() => {
            if (confirm) { dispatch({ type: 'ovh/delete', id: confirm.id }); toast('حذف شد', 'warn'); }
            setConfirm(null);
          }}><IconTrash size={15} /> حذف</Button>
          <Button variant="ghost" onClick={() => setConfirm(null)}>انصراف</Button>
        </>}
      >
        <p style={{ fontSize: 13, color: 'var(--txt-2)' }}>این آیتم از تخصیصِ همهٔ آیتم‌های منو حذف می‌شود.</p>
      </Modal>
    </div>
  );
}
