import React, { useMemo, useState } from 'react';
import { useStore, CATEGORIES } from '../lib/store';
import { Button, Empty, MoneyInput, SearchBox, Seg } from '../components/ui';
import { faDigits, num, pct, roundTo } from '../lib/format';
import { IconBolt, IconRefresh, IconDownload } from '../components/Icons';
import { useMedia } from '../lib/media';

type Tab = 'table' | 'cards';

export default function Pricing() {
  const { state, dispatch, engine, toast, exportCsv } = useStore();
  const { mobile } = useMedia();
  const [tab, setTab] = useState<Tab>('table');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [sort, setSort] = useState<'margin' | 'cost' | 'name' | 'food'>('margin');
  const [onlyWeak, setOnlyWeak] = useState(false);

  const rows = useMemo(() => {
    let list = state.items.filter((i) => i.category !== 'نیمه‌ساخته' && i.active);
    if (q) list = list.filter((i) => i.name.includes(q) || i.code.includes(q));
    if (cat) list = list.filter((i) => i.category === cat);
    let mapped = list.map((i) => ({ item: i, c: engine.byItem[i.id] })).filter((x) => x.c);
    if (onlyWeak) {
      mapped = mapped.filter((x) => (x.c.margin ?? 1) < state.settings.targetMargin);
    }
    mapped.sort((a, b) => {
      if (sort === 'margin') return (a.c.margin ?? 1) - (b.c.margin ?? 1);
      if (sort === 'cost') return b.c.total - a.c.total;
      if (sort === 'food') return (b.c.foodCost ?? 0) - (a.c.foodCost ?? 0);
      return a.item.name.localeCompare(b.item.name, 'fa');
    });
    return mapped;
  }, [state.items, engine, q, cat, sort, onlyWeak, state.settings.targetMargin]);

  const setPrice = (id: string, v: number | null) => {
    const it = state.items.find((i) => i.id === id);
    dispatch({ type: 'item/update', id, patch: { price: v, oldPrice: it?.price ?? it?.oldPrice ?? null } });
  };

  const applyAll = () => {
    let n = 0;
    state.items.filter((i) => i.category !== 'نیمه‌ساخته' && i.active).forEach((i) => {
      const c = engine.byItem[i.id];
      if (c && c.suggested && c.suggested !== i.price) {
        dispatch({ type: 'item/update', id: i.id, patch: { oldPrice: i.price ?? null, price: c.suggested } });
        n += 1;
      }
    });
    toast(`قیمتِ ${faDigits(n)} آیتم بر اساسِ حاشیهٔ هدف به‌روزرسانی شد`, 'ok');
  };

  const roundAll = () => {
    let n = 0;
    state.items.filter((i) => i.category !== 'نیمه‌ساخته' && i.active && i.price).forEach((i) => {
      const r = roundTo(i.price as number, 1000);
      if (r !== i.price) {
        dispatch({ type: 'item/update', id: i.id, patch: { oldPrice: i.price ?? null, price: r } });
        n += 1;
      }
    });
    toast(`${faDigits(n)} قیمت به نزدیک‌ترین ۱۰۰۰ تومان گرد شد`, 'ok');
  };

  const bump = (percent: number) => {
    let n = 0;
    state.items.filter((i) => i.category !== 'نیمه‌ساخته' && i.active && i.price).forEach((i) => {
      const v = roundTo((i.price as number) * (1 + percent / 100), 500);
      dispatch({ type: 'item/update', id: i.id, patch: { oldPrice: i.price ?? null, price: v } });
      n += 1;
    });
    toast(`${faDigits(n)} آیتم ${faDigits(percent > 0 ? '+' : '')}${faDigits(percent)}٪ تغییر قیمت گرفتند`, 'ok');
  };

  return (
    <div className="view">
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <div>
            <h3>قیمت‌گذاری و حاشیهٔ سود</h3>
            <div className="sub">
              بهای تمام‌شده در برابر قیمت فروش — حاشیهٔ هدف: {pct(state.settings.targetMargin, 0)}
            </div>
          </div>
          <div className="spacer" />
          <Seg
            value={tab}
            onChange={(v) => setTab(v)}
            options={[{ v: 'table', l: 'جدول تحلیلی' }, { v: 'cards', l: 'کارت‌های منو' }]}
          />
        </div>
        <div className="card-head" style={{ paddingTop: 0, flexWrap: 'wrap', gap: 8 }}>
          <SearchBox value={q} onChange={setQ} placeholder="جستجو…" />
          <select className="select" style={{ width: 150 }} value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="">همهٔ دسته‌ها</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="select" style={{ width: 165 }} value={sort} onChange={(e) => setSort(e.target.value as any)}>
            <option value="margin">مرتب‌سازی: حاشیهٔ سود</option>
            <option value="cost">مرتب‌سازی: بهای تمام‌شده</option>
            <option value="food">مرتب‌سازی: درصد بهای مواد</option>
            <option value="name">مرتب‌سازی: نام</option>
          </select>
          <label className="switch" style={{ fontSize: 12.5 }}>
            <input type="checkbox" checked={onlyWeak} onChange={(e) => setOnlyWeak(e.target.checked)} />
            <span className="track" />
            فقط زیرِ حاشیهٔ هدف
          </label>
          <div className="spacer" />
          <Button onClick={() => bump(5)}>+۵٪</Button>
          <Button onClick={roundAll}><IconRefresh size={15} /> گردکردن</Button>
          <Button onClick={exportCsv}><IconDownload size={15} /> خروجی اکسل</Button>
          <Button variant="primary" onClick={applyAll}><IconBolt size={15} /> اِعمال قیمت پیشنهادی</Button>
        </div>

        {tab === 'table' ? (
          rows.length === 0 ? <Empty icon="🧮" title="آیتمی برای نمایش نیست" /> : mobile ? (
            <div className="row-cards" style={{ padding: '0 14px 14px' }}>
              {rows.map(({ item, c }) => {
                const weak = (c.margin ?? 1) < state.settings.targetMargin;
                const heavy = (c.foodCost ?? 0) > 0.4;
                return (
                  <div className="row-card" key={item.id} style={{ cursor: 'default' }}>
                    <div className="rc-head">
                      <div className="list-thumb" style={{ width: 40, height: 40, flexBasis: 40, borderRadius: 12 }}
                        {...(item.image ? { style: { backgroundImage: `url(/img/${item.image})`, width: 40, height: 40, flexBasis: 40, borderRadius: 12 } } : {})} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div className="rc-title">{item.name}</div>
                        <div className="rc-sub">{item.category}</div>
                      </div>
                      <div className="rc-side">
                        {weak
                          ? <span className="chip red">زیرِ هدف</span>
                          : heavy
                            ? <span className="chip clay">مواد بالا</span>
                            : <span className="chip green">مناسب</span>}
                      </div>
                    </div>
                    <div className="rc-metrics">
                      <div className="rc-m">
                        <div className="l">تمام‌شده</div>
                        <div className="v num">{num(Math.round(c.total))}</div>
                      </div>
                      <div className="rc-m">
                        <div className="l">پیشنهاد</div>
                        <div className="v num" style={{ color: 'var(--clay)' }}>{num(Math.round(c.suggested))}</div>
                      </div>
                      <div className="rc-m">
                        <div className="l">سود</div>
                        <div className="v num" style={{ color: (c.profit ?? 0) < 0 ? 'var(--berry)' : 'var(--txt)' }}>
                          {c.profit == null ? '—' : num(Math.round(c.profit))}
                        </div>
                      </div>
                      <div className="rc-m">
                        <div className="l">حاشیهٔ سود</div>
                        <div className="v num" style={{ color: weak ? 'var(--berry)' : 'var(--moss)' }}>
                          {pct(c.margin, 1)}
                        </div>
                      </div>
                    </div>
                    <div className="rc-price">
                      <span className="l">قیمت فعلی (تومان)</span>
                      <MoneyInput value={item.price} onChange={(v) => setPrice(item.id, v)}
                        style={{ flex: 1, textAlign: 'left' }} />
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
                    <th>آیتم</th>
                    <th className="n">بهای مواد</th>
                    <th className="n">سربار</th>
                    <th className="n">ظرف</th>
                    <th className="n">تمام‌شده</th>
                    <th className="n">قیمت فعلی</th>
                    <th className="n">پیشنهاد</th>
                    <th className="n">سود</th>
                    <th className="n">حاشیه</th>
                    <th className="n">بهای مواد٪</th>
                    <th>وضعیت</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ item, c }) => {
                    const weak = (c.margin ?? 1) < state.settings.targetMargin;
                    const heavy = (c.foodCost ?? 0) > 0.4;
                    return (
                      <tr key={item.id}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div className="list-thumb" style={{ width: 34, height: 34, flexBasis: 34 }}
                              {...(item.image ? { style: { backgroundImage: `url(/img/${item.image})`, width: 34, height: 34, flexBasis: 34 } } : {})} />
                            <div>
                              <div style={{ fontWeight: 600 }}>{item.name}</div>
                              <div style={{ fontSize: 11, color: 'var(--muted)' }}>{item.category}</div>
                            </div>
                          </div>
                        </td>
                        <td className="n">{num(Math.round(c.material))}</td>
                        <td className="n">{num(Math.round(c.overhead))}</td>
                        <td className="n">{num(Math.round(c.container))}</td>
                        <td className="n" style={{ fontWeight: 700 }}>{num(Math.round(c.total))}</td>
                        <td className="n" style={{ padding: '4px 8px' }}>
                          <MoneyInput value={item.price} onChange={(v) => setPrice(item.id, v)}
                            style={{ width: 96, textAlign: 'left' }} />
                        </td>
                        <td className="n" style={{ color: 'var(--clay)', fontWeight: 700 }}>
                          {num(Math.round(c.suggested))}
                        </td>
                        <td className="n" style={{ color: (c.profit ?? 0) < 0 ? 'var(--berry)' : 'var(--txt)' }}>
                          {c.profit == null ? '—' : num(Math.round(c.profit))}
                        </td>
                        <td className="n" style={{ fontWeight: 700, color: weak ? 'var(--berry)' : 'var(--moss)' }}>
                          {pct(c.margin, 1)}
                        </td>
                        <td className="n" style={{ color: heavy ? 'var(--clay)' : 'var(--txt-2)' }}>
                          {pct(c.foodCost, 1)}
                        </td>
                        <td>
                          {weak
                            ? <span className="chip red">زیرِ هدف</span>
                            : heavy
                              ? <span className="chip clay">بهای مواد بالا</span>
                              : <span className="chip green">مناسب</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : (
          <div className="card-pad" style={{ paddingTop: 0 }}>
            <div className="menu-grid">
              {rows.map(({ item, c }) => {
                const weak = (c.margin ?? 1) < state.settings.targetMargin;
                const ings = item.recipe
                  .map((r) => state.ingredients.find((i) => i.id === r.ingredientId)?.name)
                  .filter(Boolean).slice(0, 4).join('، ');
                return (
                  <div className="menu-card" key={item.id}>
                    <div className="ph">
                      {item.image
                        ? <img src={`/img/${item.image}`} alt="" />
                        : <div style={{ width: '100%', height: '100%', background: 'linear-gradient(140deg,#2f6b4c,#0c110d)' }} />}
                      <div className="grad" />
                      <span className="cat">{item.category}</span>
                      <div className="cost">
                        <b>{num(Math.round(c.price || 0))}</b>
                        <span>تومان · هر {item.unitLabel}</span>
                      </div>
                    </div>
                    <div className="body">
                      <div className="name">{item.name}</div>
                      <div className="ing">{ings}{item.recipe.length > 4 ? '…' : ''}</div>
                      <div className="stat-row" style={{ padding: '6px 0' }}>
                        <span className="l">بهای تمام‌شده</span>
                        <span className="v">{num(Math.round(c.total))}</span>
                      </div>
                      <div className="stat-row" style={{ padding: '6px 0' }}>
                        <span className="l">حاشیهٔ سود</span>
                        <span className="v" style={{ color: weak ? 'var(--berry)' : 'var(--moss)' }}>
                          {pct(c.margin, 1)}
                        </span>
                      </div>
                      <div className="foot">
                        <span className={`chip ${weak ? 'red' : 'green'}`}>
                          {weak ? 'نیازمند بازنگری' : 'سودآور'}
                        </span>
                        <span className="chip">بهای مواد {pct(c.foodCost, 0)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {rows.length === 0 && <Empty icon="🍽️" title="کارت آماده‌ای نیست" />}
          </div>
        )}
      </div>
    </div>
  );
}
