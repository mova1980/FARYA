import React, { useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { isPreparationCategory, type MenuItem, type RecipeStep } from '../lib/types';
import { hasKnownPrice, manualPrice } from '../lib/calc';
import { Button, Empty, Field, Modal } from '../components/ui';
import { faDigits, num, uid } from '../lib/format';
import { IconEdit, IconPlus, IconTrash, IconSalad, IconCheck } from '../components/Icons';
import '../styles/preparations.css';

type FormState = {
  name: string;
  category: 'سس' | 'نیمه‌ساخته';
  yieldQty: number | null;
  yieldUnit: string;
  note: string;
  recipe: RecipeStep[];
};

const freshForm = (): FormState => ({
  name: '', category: 'سس', yieldQty: null, yieldUnit: 'گرم', note: '', recipe: [],
});

const isSauce = (item: MenuItem) => item.category === 'سس';

export default function Preparations() {
  const { state, dispatch, engine, toast } = useStore();
  const preparations = useMemo(
    () => state.items.filter((item) => isPreparationCategory(item.category)).sort((a, b) => a.name.localeCompare(b.name, 'fa')),
    [state.items],
  );
  const pizzas = useMemo(
    () => state.items.filter((item) => item.category === 'پیتزا' && item.active),
    [state.items],
  );
  const rawIngredients = useMemo(
    () => state.ingredients.filter((ingredient) => !ingredient.subRecipeId),
    [state.ingredients],
  );

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<MenuItem | null>(null);
  const [form, setForm] = useState<FormState>(freshForm());
  const [confirmDelete, setConfirmDelete] = useState<MenuItem | null>(null);
  const [usageSauce, setUsageSauce] = useState<Record<string, string>>({});

  const linkedIngredient = (itemId: string) => state.ingredients.find((ingredient) => ingredient.subRecipeId === itemId);
  const ingredientName = (id: string) => state.ingredients.find((ingredient) => ingredient.id === id)?.name || 'مادهٔ حذف‌شده';

  const startCreate = () => {
    setEditing(null);
    setForm(freshForm());
    setFormOpen(true);
  };

  const startEdit = (item: MenuItem) => {
    setEditing(item);
    setForm({
      name: item.name,
      category: item.category === 'سس' ? 'سس' : 'نیمه‌ساخته',
      yieldQty: item.yieldQty ?? null,
      yieldUnit: item.yieldUnit || item.unitLabel || 'گرم',
      note: item.note || '',
      recipe: item.recipe.map((line) => ({ ...line })),
    });
    setFormOpen(true);
  };

  const addRecipeLine = () => {
    const available = rawIngredients[0];
    if (!available) { toast('ابتدا مواد خام را در بخش «مواد اولیه» ثبت کنید.', 'warn'); return; }
    setForm((current) => ({ ...current, recipe: [...current.recipe, { ingredientId: available.id, qty: 0 }] }));
  };

  const savePreparation = () => {
    if (!form.name.trim()) { toast('نام سس یا نیمه‌ساخته را وارد کنید.', 'err'); return; }
    if (!form.yieldQty || form.yieldQty <= 0) { toast('بازدهٔ واقعیِ یک بچ باید بیشتر از صفر باشد.', 'err'); return; }
    if (!form.yieldUnit.trim()) { toast('واحد بازده را مشخص کنید.', 'err'); return; }
    if (form.recipe.length === 0 || form.recipe.some((line) => !line.ingredientId || !Number.isFinite(line.qty) || line.qty <= 0)) {
      toast('برای هر ردیفِ دستور، مادهٔ خام و مقدارِ بیشتر از صفر وارد کنید.', 'err'); return;
    }
    const normalizedRecipe = form.recipe.map((line) => ({ ingredientId: line.ingredientId, qty: Number(line.qty) }));
    let itemId: string;
    let linked = editing ? linkedIngredient(editing.id) : undefined;
    if (editing) {
      itemId = editing.id;
      dispatch({ type: 'item/update', id: itemId, patch: {
        name: form.name.trim(), category: form.category, yieldQty: Number(form.yieldQty),
        yieldUnit: form.yieldUnit.trim(), unitLabel: form.yieldUnit.trim(), recipe: normalizedRecipe,
        note: form.note.trim(), active: true,
      } });
    } else {
      itemId = uid(form.category === 'سس' ? 'sauce' : 'prep');
      const suffix = itemId.replace(/^(sauce|prep)-/, '').toUpperCase();
      const item: MenuItem = {
        id: itemId,
        code: `${form.category === 'سس' ? 'FARYA-SAUCE' : 'FARYA-PREP'}-${suffix}`,
        name: form.name.trim(), category: form.category, image: '', recipe: normalizedRecipe,
        containerCost: 0, coef: 1, yieldQty: Number(form.yieldQty), yieldUnit: form.yieldUnit.trim(),
        overheadIds: [], overheadFixed: 0, overheadExtraCoef: 0, unitLabel: form.yieldUnit.trim(),
        oldPrice: null, price: null, active: true, note: form.note.trim(),
      };
      dispatch({ type: 'item/add', item });
      linked = undefined;
    }

    const ingredient = {
      id: linked?.id || uid(form.category === 'سس' ? 'ing-sauce' : 'ing-prep'),
      name: `${form.name.trim()} — ${form.category}`,
      unit: form.yieldUnit.trim(), prices: [],
      note: `نیمه‌ساخته با بازده ${num(Number(form.yieldQty))} ${form.yieldUnit.trim()}؛ بهای واحد از دستور تولید محاسبه می‌شود.`,
      subRecipeId: itemId,
    };
    if (linked) dispatch({ type: 'ing/update', id: linked.id, patch: ingredient });
    else dispatch({ type: 'ing/add', ing: ingredient });

    setFormOpen(false);
    setEditing(null);
    toast(editing ? `رسپیِ «${form.name}» به‌روزرسانی شد.` : `«${form.name}» به‌عنوان ${form.category} افزوده شد.`, 'ok');
  };

  const deletePreparation = () => {
    if (!confirmDelete) return;
    const item = confirmDelete;
    const linked = linkedIngredient(item.id);
    if (linked) {
      state.items.filter((candidate) => candidate.category === 'پیتزا' && candidate.recipe.some((step) => step.ingredientId === linked.id)).forEach((pizza) => {
        dispatch({ type: 'item/update', id: pizza.id, patch: { recipe: pizza.recipe.filter((step) => step.ingredientId !== linked.id) } });
      });
    }
    dispatch({ type: 'item/delete', id: item.id });
    if (linked) dispatch({ type: 'ing/delete', id: linked.id });
    setConfirmDelete(null);
    toast(`«${item.name}» حذف شد؛ پیوندهای رسپیِ وابسته نیز حذف شدند.`, 'warn');
  };

  const sauceIngredientId = (itemId: string) => linkedIngredient(itemId)?.id;
  const sauceUsage = (pizza: MenuItem, sauceId: string) => {
    const ingredientId = sauceIngredientId(sauceId);
    if (!ingredientId) return undefined;
    return pizza.recipe.find((step) => step.ingredientId === ingredientId);
  };

  const addSauceToPizza = (pizzaId: string) => {
    const sauceId = usageSauce[pizzaId] || preparations.find(isSauce)?.id;
    if (!sauceId) { toast('ابتدا یک سس بسازید.', 'warn'); return; }
    const ingredientId = sauceIngredientId(sauceId);
    if (!ingredientId) { toast('پیوند موجودیِ این سس پیدا نشد؛ سس را ویرایش و ذخیره کنید.', 'err'); return; }
    const pizza = state.items.find((item) => item.id === pizzaId);
    if (!pizza) return;
    if (pizza.recipe.some((step) => step.ingredientId === ingredientId)) {
      toast('این سس از قبل در دستورِ پیتزا هست؛ مقدارش را در کادر تغییر دهید.', 'warn'); return;
    }
    dispatch({ type: 'item/update', id: pizza.id, patch: { recipe: [...pizza.recipe, { ingredientId, qty: 0 }] } });
    toast(`سس به دستورِ ${pizza.name} اضافه شد؛ مقدارِ هر پیتزا را وارد کنید.`, 'ok');
  };

  const setSauceQty = (pizza: MenuItem, ingredientId: string, qty: number) => {
    dispatch({ type: 'item/update', id: pizza.id, patch: {
      recipe: pizza.recipe.map((step) => step.ingredientId === ingredientId ? { ...step, qty } : step),
    } });
  };

  const removeSauceFromPizza = (pizza: MenuItem, ingredientId: string) => {
    dispatch({ type: 'item/update', id: pizza.id, patch: { recipe: pizza.recipe.filter((step) => step.ingredientId !== ingredientId) } });
    toast(`سس از رسپیِ ${pizza.name} حذف شد.`, 'warn');
  };

  return (
    <div className="view prep-view" dir="rtl">
      <div className="card card-pad prep-intro">
        <div className="prep-intro-icon"><IconSalad size={22} /></div>
        <div>
          <h3>سس‌ها و نیمه‌ساخته‌ها</h3>
          <p>هر سس یک دستور تولید و بازده مشخص دارد؛ هزینهٔ هر گرم/میلی‌لیتر از مواد خام محاسبه می‌شود و به بهای تمام‌شدهٔ پیتزا منتقل خواهد شد.</p>
        </div>
        <Button variant="primary" onClick={startCreate}><IconPlus size={16} /> تعریف سس یا نیمه‌ساخته</Button>
      </div>

      <div className="prep-summary-grid">
        <div className="card card-pad"><span className="prep-label">دستورهای تولید</span><strong>{faDigits(preparations.length)}</strong></div>
        <div className="card card-pad"><span className="prep-label">سس‌های فعال</span><strong>{faDigits(preparations.filter(isSauce).length)}</strong></div>
        <div className="card card-pad"><span className="prep-label">مبنای محاسبه</span><strong>مقدار مصرف × بهای واحد</strong></div>
      </div>

      {preparations.length === 0 ? (
        <Empty icon="🥣" title="هنوز سس یا نیمه‌ساخته‌ای تعریف نشده" sub="با ثبت دستور و بازده، سس را به رسپی پیتزا اضافه کنید." />
      ) : (
        <div className="prep-cards">
          {preparations.map((item) => {
            const cost = engine.byItem[item.id];
            const linked = linkedIngredient(item.id);
            const unpriced = item.recipe.filter((step) => {
              const ingredient = state.ingredients.find((candidate) => candidate.id === step.ingredientId);
              return ingredient && !ingredient.subRecipeId && !hasKnownPrice(ingredient);
            });
            return (
              <article className="card prep-card" key={item.id}>
                <div className="prep-card-head">
                  <div className="prep-symbol">{isSauce(item) ? 'سس' : 'ن/س'}</div>
                  <div className="prep-card-title"><h3>{item.name}</h3><span>{item.category} · بازده {faDigits(item.yieldQty || 0)} {item.yieldUnit || item.unitLabel}</span></div>
                  <div className="prep-actions">
                    <Button onClick={() => startEdit(item)} title="ویرایش دستور"><IconEdit size={15} /></Button>
                    <Button variant="danger" onClick={() => setConfirmDelete(item)} title="حذف دستور"><IconTrash size={15} /></Button>
                  </div>
                </div>
                <div className="prep-cost"><span>بهای هر {item.yieldUnit || 'واحد'}</span><b>{cost?.costComplete ? `${num(Math.round(cost.unitCost))} تومان` : 'ناقص؛ قیمت/دستور بررسی شود'}</b></div>
                <div className="prep-ingredients">
                  {item.recipe.map((step, index) => (
                    <div key={`${step.ingredientId}-${index}`}><span>{ingredientName(step.ingredientId)}</span><b>{faDigits(step.qty)} {state.ingredients.find((ing) => ing.id === step.ingredientId)?.unit || ''}</b></div>
                  ))}
                  {item.recipe.length === 0 && <span className="hint">دستور تولید ثبت نشده است.</span>}
                </div>
                {cost && !cost.costComplete && <div className="prep-warning">هزینه ناقص است: {(cost.missingCostInputs || []).join('، ')}. تا تکمیل قیمت‌های میانگین موزون و دستور، این عدد مبنای قیمت‌گذاری نیست.</div>}
                {unpriced.length > 0 && <div className="prep-warning">{faDigits(unpriced.length)} مادهٔ خام هنوز هیچ قیمت ثبت‌شده‌ای ندارد؛ بهای سس فعلاً ناقص است.</div>}
                {linked && <div className="prep-foot">شناسهٔ مادهٔ محاسباتی: <code dir="ltr">{linked.id}</code> — برای ثبت مصرف در هر پیتزا از جدول زیر استفاده کنید.</div>}
              </article>
            );
          })}
        </div>
      )}

      <div className="card prep-usage-card">
        <div className="card-head">
          <div><h3>مصرف سس در هر پیتزا</h3><div className="sub">مقدارِ سس در BOM هر پیتزا؛ در بهای مواد همان پیتزا لحاظ می‌شود.</div></div>
        </div>
        {!preparations.some(isSauce) ? (
          <div className="card-pad"><Empty icon="🍅" title="ابتدا سس تعریف کنید" /></div>
        ) : (
          <div className="prep-usage-list">
            {pizzas.map((pizza) => {
              const sauceLines = preparations.filter(isSauce).map((sauce) => ({ sauce, ingredientId: sauceIngredientId(sauce.id) }))
                .filter((row): row is { sauce: MenuItem; ingredientId: string } => Boolean(row.ingredientId))
                .map((row) => ({ ...row, step: sauceUsage(pizza, row.sauce.id) }))
                .filter((row) => Boolean(row.step));
              return (
                <section className="prep-pizza-row" key={pizza.id}>
                  <div className="prep-pizza-name"><b>{pizza.name}</b><span>{pizza.code}</span></div>
                  <div className="prep-pizza-sauces">
                    {sauceLines.map(({ sauce, ingredientId, step }) => (
                      <div className="prep-sauce-qty" key={sauce.id}>
                        <span>{sauce.name}</span>
                        <input className="input mono" type="number" min="0" step="0.1" value={step?.qty ?? ''}
                          aria-label={`${sauce.name} مقدار در ${pizza.name}`}
                          onChange={(event) => setSauceQty(pizza, ingredientId, Number(event.target.value))} />
                        <small>{sauce.yieldUnit}</small>
                        <button className="icon-btn danger" type="button" title="حذف سس از این پیتزا"
                          onClick={() => removeSauceFromPizza(pizza, ingredientId)}><IconTrash size={14} /></button>
                      </div>
                    ))}
                    {sauceLines.length === 0 && <span className="hint">هنوز مصرف سسی برای این پیتزا ثبت نشده است.</span>}
                    <div className="prep-add-sauce">
                      <select className="select" value={usageSauce[pizza.id] || ''}
                        onChange={(event) => setUsageSauce((current) => ({ ...current, [pizza.id]: event.target.value }))}>
                        <option value="">انتخاب سس…</option>
                        {preparations.filter(isSauce).map((sauce) => <option key={sauce.id} value={sauce.id}>{sauce.name}</option>)}
                      </select>
                      <Button onClick={() => addSauceToPizza(pizza.id)}><IconPlus size={14} /> افزودن به رسپی</Button>
                    </div>
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editing ? `ویرایش «${editing.name}»` : 'تعریف سس یا نیمه‌ساخته'} sub="قیمت واحدِ خروجی از هزینهٔ مواد خام ÷ بازده واقعی محاسبه می‌شود." wide
        footer={<><Button variant="primary" onClick={savePreparation}><IconCheck size={15} /> ذخیرهٔ دستور</Button><Button variant="ghost" onClick={() => setFormOpen(false)}>انصراف</Button></>}>
        <div className="form-grid">
          <Field label="نام" full><input className="input" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} autoFocus /></Field>
          <Field label="نوعِ نیمه‌ساخته">
            <select className="select" value={form.category} disabled={!!editing}
              onChange={(event) => setForm({ ...form, category: event.target.value as FormState['category'] })}>
              <option value="سس">سس</option><option value="نیمه‌ساخته">نیمه‌ساخته</option>
            </select>
          </Field>
          <Field label="بازدهٔ یک بچ" hint="مقدار واقعیِ خروجی پس از آماده‌سازی، نه جمع وزن مواد خام.">
            <input className="input mono" type="number" min="0.001" step="0.1" value={form.yieldQty ?? ''}
              onChange={(event) => setForm({ ...form, yieldQty: event.target.value === '' ? null : Number(event.target.value) })} />
          </Field>
          <Field label="واحدِ بازده">
            <select className="select" value={form.yieldUnit} onChange={(event) => setForm({ ...form, yieldUnit: event.target.value })}>
              <option value="گرم">گرم</option><option value="میلی‌لیتر">میلی‌لیتر</option><option value="عدد">عدد</option><option value="کیلو">کیلو</option>
            </select>
          </Field>
          <Field label="یادداشتِ تولید" full><input className="input" value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} placeholder="مثلاً تاریخ نسخه یا روش آماده‌سازی" /></Field>
        </div>
        <div className="prep-recipe-head"><div><b>مواد خامِ هر بچ</b><span>هزینهٔ مواد خام بر پایهٔ میانگین موزون جاریِ انبار است.</span></div><Button onClick={addRecipeLine}><IconPlus size={14} /> افزودن ماده</Button></div>
        {form.recipe.length === 0 ? <div className="prep-empty-lines">برای محاسبهٔ بهای سس، دست‌کم یک مادهٔ خام اضافه کنید.</div> : (
          <div className="prep-recipe-lines">
            {form.recipe.map((line, index) => {
              const ingredient = state.ingredients.find((candidate) => candidate.id === line.ingredientId);
              return (
                <div className="prep-recipe-line" key={`${line.ingredientId}-${index}`}>
                  <select className="select" value={line.ingredientId} onChange={(event) => setForm((current) => ({
                    ...current, recipe: current.recipe.map((row, rowIndex) => rowIndex === index ? { ...row, ingredientId: event.target.value } : row),
                  }))}>
                    {rawIngredients.map((raw) => <option key={raw.id} value={raw.id}>{raw.name} · {num(manualPrice(raw))} / {raw.unit}</option>)}
                  </select>
                  <input className="input mono" type="number" min="0" step="0.1" value={line.qty}
                    onChange={(event) => setForm((current) => ({
                      ...current, recipe: current.recipe.map((row, rowIndex) => rowIndex === index ? { ...row, qty: Number(event.target.value) } : row),
                    }))} />
                  <span>{ingredient?.unit || ''}</span>
                  <Button variant="danger" onClick={() => setForm((current) => ({ ...current, recipe: current.recipe.filter((_, rowIndex) => rowIndex !== index) }))}><IconTrash size={14} /></Button>
                </div>
              );
            })}
          </div>
        )}
      </Modal>

      <Modal open={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="حذف دستورِ تولید" sub={confirmDelete?.name}
        footer={<><Button variant="danger" onClick={deletePreparation}><IconTrash size={15} /> حذفِ دائمی</Button><Button variant="ghost" onClick={() => setConfirmDelete(null)}>انصراف</Button></>}>
        <p className="hint">حذفِ سس، ردیفِ لینک‌شده از رسپیِ پیتزاها را هم حذف می‌کند. گردش‌های قبلیِ انبار در سوابق می‌مانند؛ برای سسی که موجودی دارد، ابتدا موجودی را صفر/تعدیل کنید.</p>
      </Modal>
    </div>
  );
}
