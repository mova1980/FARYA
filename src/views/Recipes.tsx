import React, { useMemo, useState } from 'react';
import { useStore, CATEGORIES } from '../lib/store';
import { manualPrice } from '../lib/calc';
import { Button, Empty, Field, Modal, MoneyInput, SearchBox, Switch } from '../components/ui';
import { faDigits, num, pct, uid } from '../lib/format';
import { IconPlus, IconTrash, IconEdit, IconCheck, IconCopy, IconLayers, IconBolt, IconChevron } from '../components/Icons';
import { useMedia } from '../lib/media';
import { isPreparationCategory, type MenuItem, type RecipeStep } from '../lib/types';

const IMAGES = ['pizza.jpg', 'burger.jpg', 'pasta.jpg', 'salad.jpg', 'bread.jpg', 'dessert.jpg', 'beef.jpg', ''];

const blankItem = (): MenuItem => ({
  id: uid('item'),
  code: String(Math.floor(Math.random() * 900) + 100),
  name: '',
  category: 'پیش‌غذا',
  image: 'pizza.jpg',
  recipe: [],
  containerCost: 0,
  coef: 3,
  yieldQty: null,
  yieldUnit: null,
  overheadIds: [],
  overheadFixed: null,
  overheadExtraCoef: null,
  unitLabel: 'پرس',
  oldPrice: null,
  price: null,
  active: true,
  note: '',
});

export default function Recipes() {
  const { state, dispatch, engine, toast } = useStore();
  const { mobile } = useMedia();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [selId, setSelId] = useState<string>(state.items[0]?.id || '');
  const [showDetail, setShowDetail] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<MenuItem>(blankItem());
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState<MenuItem | null>(null);
  const [addIng, setAddIng] = useState<{ ingredientId: string; qty: number | null }>({
    ingredientId: state.ingredients[0]?.id || '', qty: null,
  });

  const items = useMemo(() => state.items.filter((i) => {
    if (i.category !== 'پیتزا') return false;
    const mq = !q || i.name.includes(q) || i.code.includes(q) ||
      i.recipe.some((r) => state.ingredients.find((x) => x.id === r.ingredientId)?.name.includes(q));
    const mc = !cat || i.category === cat;
    return mq && mc;
  }), [state.items, state.ingredients, q, cat]);

  const sel = items.find((i) => i.id === selId) || items[0];
  const selIdSafe = sel?.id;
  const comp = sel ? engine.byItem[selIdSafe] : null;

  const ingName = (id: string) => state.ingredients.find((i) => i.id === id)?.name || '—';
  const ingUnit = (id: string) => state.ingredients.find((i) => i.id === id)?.unit || '';
  const ingPrice = (id: string) => engine.priceOf[id] ?? manualPrice(state.ingredients.find((i) => i.id === id));

  const openCreate = () => { toast('منوی فروش عمداً فقط هفت پیتزای اصلی را دارد؛ برای سس/نیمه‌ساخته از بخش مستقل آن‌ها استفاده کنید.', 'warn'); };
  const openEdit = () => { if (!sel) return; setEditing(true); setForm({ ...sel }); setFormOpen(true); };

  const saveForm = () => {
    if (!form.name.trim()) { toast('نام آیتم را وارد کنید', 'err'); return; }
    if (editing) {
      dispatch({ type: 'item/update', id: form.id, patch: form });
      toast(`«${form.name}» به‌روزرسانی شد`, 'ok');
    } else {
      dispatch({ type: 'item/add', item: { ...form, id: uid('item') } });
      setSelId(form.id);
      toast(`«${form.name}» به منو اضافه شد`, 'ok');
    }
    setFormOpen(false);
  };

  const patchSel = (patch: Partial<MenuItem>) => {
    if (!sel) return;
    dispatch({ type: 'item/update', id: sel.id, patch });
  };

  const addStep = () => {
    if (!sel) return;
    if (!addIng.ingredientId) { toast('مادهٔ اولیه را انتخاب کنید', 'err'); return; }
    const qty = addIng.qty == null ? 0 : addIng.qty;
    const steps: RecipeStep[] = [...sel.recipe, { ingredientId: addIng.ingredientId, qty }];
    patchSel({ recipe: steps });
    setAddIng({ ingredientId: addIng.ingredientId, qty: null });
    toast('ماده به دستور پخت اضافه شد', 'ok');
  };

  const updateStep = (idx: number, qty: number | null) => {
    if (!sel) return;
    const steps = sel.recipe.map((s, i) => (i === idx ? { ...s, qty: qty ?? 0 } : s));
    patchSel({ recipe: steps });
  };

  const removeStep = (idx: number) => {
    if (!sel) return;
    patchSel({ recipe: sel.recipe.filter((_, i) => i !== idx) });
    toast('ماده از دستور پخت حذف شد', 'warn');
  };

  const toggleOverhead = (oid: string) => {
    if (!sel) return;
    const has = sel.overheadIds.includes(oid);
    patchSel({
      overheadIds: has ? sel.overheadIds.filter((x) => x !== oid) : [...sel.overheadIds, oid],
    });
  };

  const isSemi = !!sel && isPreparationCategory(sel.category);

  return (
    <div className="view">
      <div className="item-grid">
        {/* ------------------------------------------------------------- list */}
        {(!mobile || !showDetail) && (<div className="card list-card">
          <div className="card-head">
            <div>
              <h3>آیتم‌ها و دستور پخت</h3>
              <div className="sub">{faDigits(state.items.filter((item) => item.category === 'پیتزا' && item.active).length)} پیتزای فروش</div>
            </div>
            <div className="spacer" />
            <button className="btn sm primary" data-quick="item" onClick={openCreate}><IconPlus size={14} /> محصول جدید</button>
          </div>
          <div style={{ padding: '0 14px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <SearchBox value={q} onChange={setQ} placeholder="جستجو در نام یا مواد…" />
            <select className="select" value={cat} onChange={(e) => setCat(e.target.value)}>
              <option value="">همهٔ دسته‌ها</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            {items.map((i) => {
              const c = engine.byItem[i.id];
              return (
                <div key={i.id} className={`list-item ${i.id === selIdSafe ? 'on' : ''}`}
                  onClick={() => { setSelId(i.id); if (mobile) setShowDetail(true); }}>
                  <div className="list-thumb" style={i.image
                    ? { backgroundImage: `url(/img/${i.image})` }
                    : { background: 'linear-gradient(140deg,#2f6b4c,#0c110d)' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="list-title">{i.name}</div>
                    <div className="list-meta">
                      {i.category} · {faDigits(i.code)}
                    </div>
                  </div>
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontSize: 12, fontWeight: 700 }} className="num">
                      {c ? num(Math.round(isSemiCat(i) ? c.unitCost : c.total)) : '—'}
                    </div>
                    <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>
                      {isSemiCat(i) ? `هر ${i.yieldUnit || i.unitLabel}` : 'تمام‌شده'}
                    </div>
                  </div>
                </div>
              );
            })}
            {items.length === 0 && <Empty icon="🍃" title="چیزی یافت نشد" />}
          </div>
        </div>)}

        {/* ----------------------------------------------------------- detail */}
        {(!mobile || showDetail) && (<div>
          {mobile && showDetail && (
            <button className="btn ghost back-btn" onClick={() => setShowDetail(false)}>
              <IconChevron size={16} /> بازگشت به فهرست
            </button>
          )}
          {!sel ? <Empty icon="📖" title="آیتمی انتخاب نشده" /> : (
            <>
              <div className="detail-hero">
                {sel.image
                  ? <img src={`/img/${sel.image}`} alt="" />
                  : <div style={{ width: '100%', height: '100%', background: 'linear-gradient(120deg,#123021,#0c110d)' }} />}
                <div className="scrim" />
                <div className="txt">
                  <h2>{sel.name}</h2>
                  <div className="chips">
                    <span className="chip ink">{sel.category}</span>
                    <span className="chip">کد {faDigits(sel.code)}</span>
                    <span className="chip">{sel.unitLabel}</span>
                    {isSemi && sel.yieldQty
                      ? <span className="chip green">بازدهی: {faDigits(sel.yieldQty)} {sel.yieldUnit}</span>
                      : null}
                  </div>
                </div>
                <div style={{ position: 'absolute', top: 14, insetInlineEnd: 14, display: 'flex', gap: 6 }}>
                  <button className="btn sm dark" onClick={openEdit}><IconEdit size={14} /> ویرایش</button>
                  <button className="btn sm dark" onClick={() => {
                    dispatch({ type: 'item/duplicate', id: sel.id });
                    toast('کپیِ آیتم ساخته شد', 'ok');
                  }}><IconCopy size={14} /></button>
                  <button className="btn sm dark" onClick={() => setConfirm(sel)}><IconTrash size={14} /></button>
                </div>
              </div>

              {comp && (
                <>
                  <div className="cost-breakdown" style={{ marginBottom: 16 }}>
                    <div className="cb">
                      <div className="l">بهای مواد</div>
                      <div className="v">{num(Math.round(comp.material))}</div>
                    </div>
                    <div className="cb">
                      <div className="l">ضریب ×{faDigits(comp.coefValue)}</div>
                      <div className="v">{num(Math.round(comp.afterCoef))}</div>
                    </div>
                    <div className="cb">
                      <div className="l">سربار{comp.extraCoef ? ` (+${Math.round(comp.extraCoef * 100)}٪)` : ''}</div>
                      <div className="v">{num(Math.round(comp.overhead))}</div>
                    </div>
                    <div className="cb">
                      <div className="l">هزینهٔ ظرف</div>
                      <div className="v">{num(Math.round(comp.container))}</div>
                    </div>
                    <div className="cb hi">
                      <div className="l">{isSemi ? `بهای هر ${sel.yieldUnit || 'واحد'}` : 'بهای تمام‌شده'}</div>
                      <div className="v">{num(Math.round(isSemi ? comp.unitCost : comp.total))}</div>
                    </div>
                  </div>

                  <div className="grid g2" style={{ marginBottom: 16 }}>
                    {/* ----------------------------------------------- recipe */}
                    <div className="card">
                      <div className="card-head">
                        <div>
                          <h3>مواد مصرفی</h3>
                          <div className="sub">مقدار مصرف بر حسب واحدِ هر ماده</div>
                        </div>
                      </div>
                      {mobile ? (
                        <div className="step-list">
                          {sel.recipe.map((s, idx) => (
                            <div className="step-row" key={idx}>
                              <div className="sr-top">
                                <div className="sr-name">{ingName(s.ingredientId)}</div>
                                <button className="icon-btn danger" onClick={() => removeStep(idx)}>
                                  <IconTrash size={14} />
                                </button>
                              </div>
                              <div className="sr-bottom">
                                <label className="sr-qty">
                                  <span>مقدار ({ingUnit(s.ingredientId)})</span>
                                  <input
                                    className="input mono"
                                    style={{ height: 34, textAlign: 'left', width: '100%' }}
                                    value={s.qty}
                                    onChange={(e) => updateStep(idx, Number(e.target.value.replace(/[۰-۹]/g,
                                      (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))) || 0)}
                                  />
                                </label>
                                <div className="sr-num">
                                  <span>قیمت واحد</span>
                                  <b className="num">{num(Math.round(ingPrice(s.ingredientId)))}</b>
                                </div>
                                <div className="sr-num">
                                  <span>بها</span>
                                  <b className="num" style={{ color: 'var(--moss)' }}>
                                    {num(Math.round(s.qty * ingPrice(s.ingredientId)))}
                                  </b>
                                </div>
                              </div>
                            </div>
                          ))}
                          {sel.recipe.length === 0 && (
                            <div style={{ fontSize: 12, color: 'var(--muted)', padding: '10px 14px' }}>
                              هنوز ماده‌ای برای این آیتم ثبت نشده است.
                            </div>
                          )}
                        </div>
                      ) : (
                      <div className="table-wrap">
                        <table className="tbl">
                          <thead>
                            <tr>
                              <th>ماده</th>
                              <th className="n">مقدار</th>
                              <th className="n">قیمت واحد</th>
                              <th className="n">بها</th>
                              <th />
                            </tr>
                          </thead>
                          <tbody>
                            {sel.recipe.map((s, idx) => (
                              <tr key={idx}>
                                <td>{ingName(s.ingredientId)}</td>
                                <td className="n" style={{ padding: '4px 8px' }}>
                                  <input
                                    className="input mono"
                                    style={{ height: 30, textAlign: 'left', width: 78 }}
                                    value={s.qty}
                                    onChange={(e) => updateStep(idx, Number(e.target.value.replace(/[۰-۹]/g,
                                      (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))) || 0)}
                                  />
                                </td>
                                <td className="n">{num(Math.round(ingPrice(s.ingredientId)))}</td>
                                <td className="n" style={{ fontWeight: 700 }}>
                                  {num(Math.round(s.qty * ingPrice(s.ingredientId)))}
                                </td>
                                <td>
                                  <div className="row-actions">
                                    <button className="icon-btn danger" onClick={() => removeStep(idx)}>
                                      <IconTrash size={14} />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      )}
                      <div className="card-foot">
                        <Field label="افزودن مادهٔ اولیه" style={{ flex: '1 1 150px', minWidth: 130 }}>
                          <select className="select" style={{ minWidth: 150, flex: '1 1 150px' }}
                            value={addIng.ingredientId}
                            onChange={(e) => setAddIng({ ...addIng, ingredientId: e.target.value })}>
                            {state.ingredients.map((i) => (
                              <option key={i.id} value={i.id}>
                                {i.name} ({i.unit} · {num(Math.round(ingPrice(i.id)))})
                              </option>
                            ))}
                          </select>
                        </Field>
                        <Field label="مقدار مصرف">
                          <MoneyInput style={{ width: 96, flex: '0 0 96px' }} value={addIng.qty}
                            onChange={(v) => setAddIng({ ...addIng, qty: v })} placeholder="۰" />
                        </Field>
                        <Button variant="primary" onClick={addStep}><IconPlus size={15} /> افزودن</Button>
                      </div>
                    </div>

                    {/* -------------------------------------------- settings */}
                    <div className="card card-pad">
                      <div className="card-head" style={{ padding: '0 0 12px' }}>
                        <div>
                          <h3>تنظیمات محاسبه</h3>
                          <div className="sub">ضریب، بازدهی، ظرف و سربار</div>
                        </div>
                      </div>
                      <div className="form-grid">
                        <Field label="ضریب تبدیل (افت/پخت)">
                          <input className="input mono" type="number" step="0.01" min="0.1"
                            value={sel.coef}
                            onChange={(e) => patchSel({ coef: Number(e.target.value) || 1 })} />
                        </Field>
                        <Field label="هزینهٔ ظرف (تومان)">
                          <MoneyInput value={sel.containerCost}
                            onChange={(v) => patchSel({ containerCost: v ?? 0 })} />
                        </Field>
                        {isSemi && (
                          <>
                            <Field label="بازدهیِ دستور">
                              <input className="input mono" type="number" step="0.001"
                                value={sel.yieldQty ?? 1}
                                onChange={(e) => patchSel({ yieldQty: Number(e.target.value) || 1 })} />
                            </Field>
                            <Field label="واحد بازدهی">
                              <input className="input" value={sel.yieldUnit || ''}
                                onChange={(e) => patchSel({ yieldUnit: e.target.value, unitLabel: e.target.value })} />
                            </Field>
                          </>
                        )}
                        <Field label="قیمت فروش فعلی (تومان)">
                          <MoneyInput value={sel.price}
                            onChange={(v) => patchSel({ price: v })} placeholder="—" />
                        </Field>
                        <Field label="قیمت قدیم">
                          <MoneyInput value={sel.oldPrice}
                            onChange={(v) => patchSel({ oldPrice: v })} placeholder="—" />
                        </Field>
                        <Field label="ضریب اضافیِ سربار (این آیتم)" full
                          hint={`اگر خالی باشد از تنظیم سراسری (${Math.round(state.settings.overheadExtraCoef * 100)}٪) استفاده می‌شود`}>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <input className="input mono" type="number" step="1"
                              placeholder="درصد"
                              value={sel.overheadExtraCoef == null ? '' : Math.round(sel.overheadExtraCoef * 100)}
                              onChange={(e) => patchSel({
                                overheadExtraCoef: e.target.value === '' ? null
                                  : (Number(e.target.value) || 0) / 100,
                              })} />
                            <Button variant="ghost" onClick={() => patchSel({ overheadExtraCoef: null })}>
                              سراسری
                            </Button>
                          </div>
                        </Field>
                      </div>

                      <div className="divider" style={{ margin: '14px 0' }} />
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <IconLayers size={16} />
                        <b style={{ fontSize: 13 }}>سربارهای تخصیصی</b>
                        <span className="spacer" style={{ marginInlineStart: 'auto' }} />
                        <Switch checked={!!sel.active} onChange={(v) => patchSel({ active: v })} label="فعال در منو" />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {state.overheads.map((o) => {
                          const on = sel.overheadIds.includes(o.id);
                          return (
                            <label key={o.id} className="switch"
                              style={{
                                padding: '7px 10px', borderRadius: 10, cursor: 'pointer',
                                background: on ? 'var(--leaf-100)' : 'var(--paper-2)',
                                border: `1px solid ${on ? '#cfe8bd' : 'var(--line-2)'}`,
                              }}>
                              <input type="checkbox" checked={on} onChange={() => toggleOverhead(o.id)} />
                              <span className="track" />
                              <span style={{ flex: 1, fontSize: 12.5 }}>{o.name}</span>
                              <span style={{ fontSize: 11.5, color: 'var(--muted)' }} className="num">
                                {num(Math.round(o.amount))}
                                {o.kind === 'percent' ? '٪' : o.kind === 'monthly' ? ' ماهانه' : ''}
                              </span>
                            </label>
                          );
                        })}
                        {state.overheads.length === 0 && (
                          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                            هنوز آیتم سرباری تعریف نشده است.
                          </div>
                        )}
                      </div>

                      <div className="divider" style={{ margin: '14px 0' }} />
                      <Field label="سربارِ ثابتِ دستی (اختیاری)"
                        hint="اگر پر شود، مجموعِ سربارهای بالا نادیده گرفته می‌شود">
                        <MoneyInput value={sel.overheadFixed}
                          onChange={(v) => patchSel({ overheadFixed: v })} placeholder="خالی = محاسبهٔ خودکار" />
                      </Field>
                    </div>
                  </div>

                  {/* ----------------------------------------------- summary */}
                  {!isSemi && (
                    <div className="card card-pad">
                      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center' }}>
                        {[
                          { l: 'بهای تمام‌شده', v: num(Math.round(comp.total)), hi: true },
                          { l: 'قیمت فروش', v: comp.price ? num(Math.round(comp.price)) : '—' },
                          { l: 'سود هر پرس', v: comp.profit == null ? '—' : num(Math.round(comp.profit)) },
                          { l: 'حاشیهٔ سود', v: pct(comp.margin, 1) },
                          { l: 'درصد بهای مواد', v: pct(comp.foodCost, 1) },
                          { l: 'قیمت پیشنهادی', v: num(Math.round(comp.suggested)) },
                        ].map((x) => (
                          <div key={x.l}>
                            <div style={{ fontSize: 11, color: 'var(--muted)' }}>{x.l}</div>
                            <div style={{
                              fontSize: 18, fontWeight: 800,
                              color: x.hi ? 'var(--moss)' : 'var(--txt)',
                            }} className="num">{x.v}</div>
                          </div>
                        ))}
                        <div style={{ marginInlineStart: 'auto' }}>
                          <Button variant="primary" onClick={() => patchSel({ price: comp.suggested })}>
                            <IconBolt size={15} /> اِعمالِ قیمت پیشنهادی
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>)}
      </div>

      {/* ------------------------------------------------------------- modal */}
      <Modal
        open={formOpen} onClose={() => setFormOpen(false)} wide
        title={editing ? `ویرایش «${form.name}»` : 'آیتم جدیدِ منو'}
        sub="دسته، تصویر، واحد و قیمت‌ها"
        footer={<>
          <Button variant="primary" onClick={saveForm}><IconCheck size={15} /> ذخیره</Button>
          <Button variant="ghost" onClick={() => setFormOpen(false)}>انصراف</Button>
        </>}
      >
        <div className="form-grid">
          <Field label="نام آیتم" full>
            <input className="input" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="مثل: پیتزا بیسترو" autoFocus />
          </Field>
          <Field label="کد">
            <input className="input mono" value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })} />
          </Field>
          <Field label="دسته">
            <select className="select" value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="واحد فروش">
            <input className="input" value={form.unitLabel}
              onChange={(e) => setForm({ ...form, unitLabel: e.target.value })} />
          </Field>
          <Field label="ضریب تبدیل">
            <input className="input mono" type="number" step="0.01" value={form.coef}
              onChange={(e) => setForm({ ...form, coef: Number(e.target.value) || 1 })} />
          </Field>
          <Field label="هزینهٔ ظرف">
            <MoneyInput value={form.containerCost} onChange={(v) => setForm({ ...form, containerCost: v ?? 0 })} />
          </Field>
          <Field label="قیمت فروش">
            <MoneyInput value={form.price} onChange={(v) => setForm({ ...form, price: v })} />
          </Field>
          {isPreparationCategory(form.category) && (
            <>
              <Field label="بازدهی">
                <input className="input mono" type="number" step="0.001" value={form.yieldQty ?? 1}
                  onChange={(e) => setForm({ ...form, yieldQty: Number(e.target.value) || 1 })} />
              </Field>
              <Field label="واحد بازدهی">
                <input className="input" value={form.yieldUnit || ''}
                  onChange={(e) => setForm({ ...form, yieldUnit: e.target.value })} />
              </Field>
            </>
          )}
          <Field label="تصویر" full>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {IMAGES.map((im) => (
                <button key={im || 'none'} type="button"
                  onClick={() => setForm({ ...form, image: im })}
                  style={{
                    width: 76, height: 52, borderRadius: 10, overflow: 'hidden', padding: 0,
                    border: form.image === im ? '2px solid var(--moss)' : '1px solid var(--line)',
                    background: im ? `url(/img/${im}) center/cover no-repeat` : 'var(--linen)',
                    display: 'grid', placeItems: im ? 'none' : 'center', fontSize: 11, color: 'var(--muted)',
                    transition: 'transform .25s var(--ease)',
                  }}>
                  {!im && 'بدون تصویر'}
                </button>
              ))}
            </div>
          </Field>
          <Field label="یادداشت" full>
            <input className="input" value={form.note || ''}
              onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </Field>
        </div>
      </Modal>

      <Modal
        open={!!confirm} onClose={() => setConfirm(null)} title="حذف آیتم" sub={confirm?.name}
        footer={<>
          <Button variant="danger" onClick={() => {
            if (confirm) { dispatch({ type: 'item/delete', id: confirm.id }); toast('آیتم حذف شد', 'warn'); }
            setConfirm(null); setSelId('');
          }}><IconTrash size={15} /> حذف</Button>
          <Button variant="ghost" onClick={() => setConfirm(null)}>انصراف</Button>
        </>}
      >
        <p style={{ fontSize: 13, color: 'var(--txt-2)' }}>این آیتم و دستور پخت آن حذف خواهد شد.</p>
      </Modal>
    </div>
  );
}

function isSemiCat(i: MenuItem) { return isPreparationCategory(i.category); }
