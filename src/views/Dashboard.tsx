import React, { useMemo } from 'react';
import { useStore } from '../lib/store';
import { summarize } from '../lib/calc';
import { Bars, CountUp, Money, Ring, Sparkline } from '../components/ui';
import { faDigits, num, pct } from '../lib/format';
import { jalaliLong, todayJalaliStr, daysBetween } from '../lib/jalali';
import { IconBolt, IconHeart, IconAlert, IconLeaf, IconScale, IconClock } from '../components/Icons';
import { useMedia } from '../lib/media';

export default function Dashboard({ onNavigate }: { onNavigate: (v: string) => void }) {
  const { state, engine } = useStore();
  const { mobile } = useMedia();
  const sum = useMemo(() => summarize(state, engine), [state, engine]);
  const today = todayJalaliStr();

  const menuItems = state.items.filter((i) => i.category !== 'نیمه‌ساخته' && i.active && i.price);

  const costRows = useMemo(() => [...menuItems]
    .map((i) => ({ item: i, c: engine.byItem[i.id] }))
    .filter((x) => x.c)
    .sort((a, b) => b.c.total - a.c.total)
    .slice(0, 9)
    .map(({ item, c }) => ({
      name: item.name,
      value: c.total,
      display: `${num(Math.round(c.total))} / ${num(Math.round(c.price || 0))}`,
      tone: (c.margin ?? 0) < state.settings.targetMargin ? 'warn' : undefined,
    })), [menuItems, engine, state.settings.targetMargin]);

  const weak = useMemo(() => [...menuItems]
    .map((i) => ({ item: i, c: engine.byItem[i.id] }))
    .filter((x) => x.c && x.c.price)
    .sort((a, b) => (a.c.margin ?? 1) - (b.c.margin ?? 1))
    .slice(0, 6), [menuItems, engine]);

  const priceChanges = useMemo(() => {
    const out: Array<{ name: string; unit: string; price: number; date: string; note?: string }> = [];
    state.ingredients.forEach((ing) => {
      ing.prices.forEach((p) => out.push({
        name: ing.name, unit: ing.unit, price: p.price, date: p.date, note: p.note,
      }));
    });
    return out.sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 14);
  }, [state.ingredients]);

  const staleIngredients = useMemo(() => state.ingredients.filter((ing) => {
    const last = ing.prices[ing.prices.length - 1];
    if (!last || !last.date) return true;
    const d = daysBetween(last.date, today);
    return Number.isNaN(d) ? true : d > 90;
  }).length, [state.ingredients, today]);

  const struct = sum.struct;
  const structTotal = struct.material + struct.overhead + struct.container || 1;

  const health = Math.max(0, Math.min(100, Math.round(
    (1 - Math.max(0, Math.min(1, sum.avgFood))) * 55
    + Math.max(0, Math.min(1, sum.avgMargin / 0.5)) * 45,
  )));

  const heroStats = [
    { v: sum.itemCount, l: 'آیتم فعال در منو' },
    { v: sum.ingredientCount, l: 'مادهٔ اولیه' },
    { v: sum.semiCount, l: 'دستورِ نیمه‌ساخته' },
  ];

  return (
    <div className="view">
      {/* ---------------------------------------------------------------- hero */}
      <section className="hero">
        <img className="hero-img" src="/img/hero.jpg" alt="" />
        <div className="hero-scrim" />
        <div className="hero-grain" />
        <div className="hero-body">
          <span className="hero-eyebrow">
            <IconLeaf size={13} /> Chef Console · {faDigits(jalaliLong(today))}
          </span>
          <h1>
            سلام سرآشپز — <em>بهای تمام‌شده</em> امروزِ فریا<br />
            دقیق، شفاف و به‌اندازه.
          </h1>
          <p>
            هر پرس را با ترازوی عدد بسنج: از بهای موادِ تازه تا سربار و ضریب —
            تا کیفیتِ سالمِ آشپزی، با سودِ پایدار همراه بماند.
          </p>
          <div className="hero-stats">
            {heroStats.map((s) => (
              <div className="hero-stat" key={s.l}>
                <b><CountUp value={s.v} /></b>
                <span>{s.l}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------------- kpi */}
      <div className="grid g4" style={{ marginBottom: 16 }}>
        {[
          {
            label: 'میانگین بهای تمام‌شده هر پرس',
            value: <><CountUp value={sum.avgCost} /> <small>تومان</small></>,
            ico: <IconScale size={18} />, tone: '',
            delta: `${faDigits(menuItems.length)} آیتم قیمت‌دار`,
          },
          {
            label: 'میانگین حاشیهٔ سود',
            value: <CountUp value={sum.avgMargin * 100} decimals={1} suffix="٪" />,
            ico: <IconBolt size={18} />, tone: 'gold',
            delta: `هدف: ${pct(state.settings.targetMargin, 0)}`,
            warn: sum.avgMargin < state.settings.targetMargin,
          },
          {
            label: 'درصد بهای مواد (Food Cost)',
            value: <CountUp value={sum.avgFood * 100} decimals={1} suffix="٪" />,
            ico: <IconHeart size={18} />, tone: 'clay',
            delta: sum.avgFood > 0.4 ? 'بالاتر از استاندارد ۳۰٪' : 'در محدودهٔ استاندارد',
            warn: sum.avgFood > 0.4,
          },
          {
            label: 'میانگین سود خالص هر پرس',
            value: <><CountUp value={sum.avgProfit} /> <small>تومان</small></>,
            ico: <IconLeaf size={18} />, tone: '',
            delta: `${faDigits(sum.belowTarget)} آیتم زیرِ هدف`,
            warn: sum.belowTarget > 0,
          },
        ].map((k, i) => (
          <div className="card kpi fade-up" key={k.label} style={{ animationDelay: `${i * 70}ms` }}>
            <div className="k-top">
              <div className={`k-ico ${k.tone}`}>{k.ico}</div>
              <div>
                <div className="k-label">{k.label}</div>
                <div className="k-value">{k.value}</div>
              </div>
            </div>
            <div className="k-delta" style={{ color: k.warn ? 'var(--berry)' : 'var(--muted)' }}>
              {k.warn && <IconAlert size={13} />}
              {k.delta}
            </div>
          </div>
        ))}
      </div>

      {/* -------------------------------------------------------------- charts */}
      <div className="grid g-2-1" style={{ marginBottom: 16 }}>
        <div className="card card-pad fade-up" style={{ animationDelay: '80ms' }}>
          <div className="card-head" style={{ padding: '0 0 14px' }}>
            <div>
              <h3>ترازِ هزینه و قیمت فروش</h3>
              <div className="sub">بهای تمام‌شده در برابر قیمت منو (۹ آیتمِ گران‌تر)</div>
            </div>
          </div>
          <Bars rows={costRows} />
          <div className="divider" style={{ margin: '14px 0 10px' }} />
          <div style={{ display: 'flex', gap: 16, fontSize: 11.5, color: 'var(--muted)' }}>
            <span>عدد سمت راست: <b style={{ color: 'var(--txt-2)' }}>تمام‌شده / فروش</b></span>
            <span style={{ color: 'var(--berry)' }}>■ حاشیهٔ سودِ کمتر از هدف</span>
          </div>
        </div>

        <div className="card card-pad fade-up" style={{ animationDelay: '140ms' }}>
          <div className="card-head" style={{ padding: '0 0 8px' }}>
            <div>
              <h3>ساختار بهای تمام‌شده</h3>
              <div className="sub">سهم هر بخش در کل منو</div>
            </div>
          </div>
          <div className="ring-wrap" style={{ marginTop: 6 }}>
            <Ring
              value={struct.material / structTotal}
              label={faDigits(Math.round((struct.material / structTotal) * 100)) + '٪'}
              sub="بهای مواد"
            />
            <div className="legend">
              {[
                { l: 'بهای مواد (با ضریب)', v: struct.material, c: 'var(--moss)' },
                { l: 'سربار تخصیصی', v: struct.overhead, c: 'var(--clay)' },
                { l: 'هزینهٔ ظرف', v: struct.container, c: 'var(--gold)' },
              ].map((x) => (
                <div className="legend-item" key={x.l}>
                  <span className="legend-dot" style={{ background: x.c }} />
                  {x.l}
                  <span className="v">{faDigits(Math.round(x.v).toLocaleString('en-US'))}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="divider" style={{ margin: '14px 0 10px' }} />
          <div className="stat-row">
            <span className="l">شاخصِ سلامتِ اقتصادی منو</span>
            <span className="v" style={{ color: health > 70 ? 'var(--moss)' : health > 45 ? 'var(--clay)' : 'var(--berry)' }}>
              {faDigits(health)} / ۱۰۰
            </span>
          </div>
          <div className="progress" style={{ marginTop: 8 }}>
            <i style={{ width: `${health}%`, background: health > 70
              ? 'linear-gradient(90deg,#2f6b4c,#7fbf5a)'
              : health > 45 ? 'linear-gradient(90deg,#b3822c,#dda94f)'
                : 'linear-gradient(90deg,#8f2f3a,#dd7a5a)' }} />
          </div>
        </div>
      </div>

      {/* --------------------------------------------------------------- lists */}
      <div className="grid g2">
        <div className="card fade-up" style={{ animationDelay: '200ms' }}>
          <div className="card-head">
            <div>
              <h3>آیتم‌های نیازمندِ بازنگری قیمت</h3>
              <div className="sub">کمترین حاشیهٔ سود — پیشنهادِ قیمت محاسبه شده است</div>
            </div>
            <div className="spacer" />
            <button className="btn sm" onClick={() => onNavigate('pricing')}>قیمت‌گذاری</button>
          </div>
          {mobile ? (
            <div className="row-cards" style={{ padding: '0 14px 14px' }}>
              {weak.map(({ item, c }) => (
                <div className="row-card" key={item.id} onClick={() => onNavigate('pricing')}>
                  <div className="rc-head">
                    <div style={{ minWidth: 0 }}>
                      <div className="rc-title">{item.name}</div>
                      <div className="rc-sub">{item.category}</div>
                    </div>
                    <div className="rc-side">
                      <span className="chip red" style={{ fontSize: 10.5 }}>نیازمند بازنگری</span>
                    </div>
                  </div>
                  <div className="rc-metrics">
                    <div className="rc-m">
                      <div className="l">تمام‌شده</div>
                      <div className="v num">{num(Math.round(c.total))}</div>
                    </div>
                    <div className="rc-m">
                      <div className="l">فروش</div>
                      <div className="v num">{num(Math.round(c.price || 0))}</div>
                    </div>
                    <div className="rc-m">
                      <div className="l">حاشیه</div>
                      <div className="v num" style={{ color: (c.margin ?? 0) < state.settings.targetMargin ? 'var(--berry)' : 'var(--moss)' }}>
                        {pct(c.margin, 1)}
                      </div>
                    </div>
                    <div className="rc-m">
                      <div className="l">پیشنهاد</div>
                      <div className="v num" style={{ color: 'var(--clay)' }}>{num(Math.round(c.suggested))}</div>
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
                  <th className="n">تمام‌شده</th>
                  <th className="n">فروش</th>
                  <th className="n">حاشیه</th>
                  <th className="n">پیشنهاد</th>
                </tr>
              </thead>
              <tbody>
                {weak.map(({ item, c }) => (
                  <tr key={item.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{item.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{item.category}</div>
                    </td>
                    <td className="n">{num(Math.round(c.total))}</td>
                    <td className="n">{num(Math.round(c.price || 0))}</td>
                    <td className="n" style={{ color: (c.margin ?? 0) < state.settings.targetMargin ? 'var(--berry)' : 'var(--moss)', fontWeight: 700 }}>
                      {pct(c.margin, 1)}
                    </td>
                    <td className="n" style={{ color: 'var(--clay)', fontWeight: 700 }}>
                      {num(Math.round(c.suggested))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
        </div>

        <div className="card fade-up" style={{ animationDelay: '260ms' }}>
          <div className="card-head">
            <div>
              <h3>آخرین ثبت‌های قیمت مواد اولیه</h3>
              <div className="sub">هر قیمت با تاریخ شمسی ذخیره می‌شود و در تاریخچه می‌ماند</div>
            </div>
            <div className="spacer" />
            <button className="btn sm" onClick={() => onNavigate('ingredients')}>مواد اولیه</button>
          </div>
          <div style={{ padding: '4px 20px 18px' }}>
            {priceChanges.map((p, i) => (
              <div className="stat-row" key={`${p.name}-${p.date}-${i}`}>
                <span className="l">
                  {p.name}
                  <span className="badge-soft" style={{ marginInlineStart: 6 }}>{p.unit}</span>
                </span>
                <span className="v">
                  {faDigits(Math.round(p.price).toLocaleString('en-US'))}
                  <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 400, marginInlineStart: 8 }}>
                    {faDigits(p.date)}
                  </span>
                </span>
              </div>
            ))}
          </div>
          {staleIngredients > 0 && (
            <div className="card-foot" style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--clay)' }}>
              <IconClock size={15} />
              <span style={{ fontSize: 12 }}>
                {faDigits(staleIngredients)} مادهٔ اولیه بیش از ۹۰ روز بدون به‌روزرسانی قیمت است.
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
