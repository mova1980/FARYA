import React, { useEffect, useRef, useState } from 'react';
import { useStore } from './lib/store';
import { MediaProvider, useMedia } from './lib/media';
import { Logo } from './components/Logo';
import { ChefAvatar } from './components/ChefAvatar';
import { CloudBadge } from './components/CloudBadge';
import { Button } from './components/ui';
import { faDigits } from './lib/format';
import { jalaliLong, todayJalaliStr } from './lib/jalali';
import {
  IconDashboard, IconLeaf, IconBook, IconLayers, IconTag, IconSliders,
  IconPlus, IconBolt, IconCheck, IconAlert, IconMenu, IconX, IconSalad,
} from './components/Icons';
import Dashboard from './views/Dashboard';
import Ingredients from './views/Ingredients';
import Recipes from './views/Recipes';
import Overheads from './views/Overheads';
import Pricing from './views/Pricing';
import Settings from './views/Settings';

type ViewKey = 'dashboard' | 'ingredients' | 'recipes' | 'overheads' | 'pricing' | 'settings';

const NAV: Array<{ key: ViewKey; label: string; short: string; sub: string; ico: any; group: string }> = [
  { key: 'dashboard', label: 'نمای کلی', short: 'خانه', sub: 'شاخص‌ها و تحلیل', ico: IconDashboard, group: 'نگاه کلان' },
  { key: 'ingredients', label: 'مواد اولیه', short: 'مواد', sub: 'قیمت‌ها و تاریخچه', ico: IconLeaf, group: 'پایهٔ داده' },
  { key: 'recipes', label: 'آیتم‌ها و دستور پخت', short: 'آیتم‌ها', sub: 'رسپی و محاسبه', ico: IconBook, group: 'پایهٔ داده' },
  { key: 'overheads', label: 'هزینه‌های سربار', short: 'سربار', sub: 'ضریب و تسهیم', ico: IconLayers, group: 'محاسبه' },
  { key: 'pricing', label: 'قیمت‌گذاری منو', short: 'قیمت', sub: 'حاشیهٔ سود', ico: IconTag, group: 'محاسبه' },
  { key: 'settings', label: 'تنظیمات', short: 'تنظیمات', sub: 'پارامترها و داده', ico: IconSliders, group: 'سیستم' },
];

const GROUPS = ['نگاه کلان', 'پایهٔ داده', 'محاسبه', 'سیستم'];

const TITLES: Record<ViewKey, { t: string; s: string }> = {
  dashboard: { t: 'نمای کلی', s: 'شاخص‌های کلیدی بهای تمام‌شده و سلامتِ اقتصادی منو' },
  ingredients: { t: 'مواد اولیه', s: 'مدیریت قیمت‌ها با تاریخِ شمسی و تاریخچهٔ کامل' },
  recipes: { t: 'آیتم‌ها و دستور پخت', s: 'تعریف مواد مصرفی، ضریب، بازدهی و سربار هر آیتم' },
  overheads: { t: 'هزینه‌های سربار', s: 'تعریف آیتم‌های سربار، ضریبِ اضافی و نحوهٔ تسهیم' },
  pricing: { t: 'قیمت‌گذاری منو', s: 'محاسبهٔ بهای تمام‌شده، قیمت پیشنهادی و حاشیهٔ سود' },
  settings: { t: 'تنظیمات', s: 'پارامترهای محاسبه، پشتیبان و مدیریت داده‌ها' },
};

function Shell() {
  const { state, toasts, dismiss, engine } = useStore();
  const { mobile, compact, tablet, touch } = useMedia();
  const [view, setView] = useState<ViewKey>('dashboard');
  const [booting, setBooting] = useState(true);
  const [quick, setQuick] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const today = todayJalaliStr();
  const contentRef = useRef<HTMLDivElement>(null);
  const spotRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setBooting(false), 520);
    return () => clearTimeout(t);
  }, []);

  /* نمایشِ تدریجیِ کارت‌ها هنگام پیمایش */
  useEffect(() => {
    if (booting) return;
    if (typeof IntersectionObserver === 'undefined') return;
    const root = contentRef.current;
    const cards = Array.from(document.querySelectorAll('.content .card:not(.fade-up), .content .menu-card'));
    if (!cards.length) return;
    cards.forEach((c) => c.classList.add('reveal'));
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e, i) => {
        if (e.isIntersecting) {
          const el = e.target as HTMLElement;
          setTimeout(() => el.classList.add('reveal-in'), Math.min(i * 60, 260));
          io.unobserve(el);
        }
      });
    }, { root, rootMargin: '0px 0px -8% 0px', threshold: 0.02 });
    cards.forEach((c) => io.observe(c));
    return () => io.disconnect();
  }, [view, booting]);

  /* نورِ دنبال‌کنندهٔ نشانگر روی کارت‌ها (فقط دسکتاپ) */
  useEffect(() => {
    if (mobile || touch) return;
    const onMove = (e: MouseEvent) => {
      const target = (e.target as HTMLElement)?.closest?.('.card, .menu-card, .kpi, .row-card') as HTMLElement | null;
      if (spotRef.current && spotRef.current !== target) {
        spotRef.current.classList.remove('spot');
        spotRef.current = null;
      }
      if (!target) return;
      const r = target.getBoundingClientRect();
      target.style.setProperty('--mx', `${e.clientX - r.left}px`);
      target.style.setProperty('--my', `${e.clientY - r.top}px`);
      target.classList.add('spot');
      spotRef.current = target;
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    return () => window.removeEventListener('mousemove', onMove);
  }, [mobile, touch]);

  /* بستنِ منو با تغییرِ نما */
  const go = (v: ViewKey) => { setView(v); setDrawer(false); setQuick(false); contentRef.current?.scrollTo({ top: 0 }); };

  const counts: Record<string, number> = {
    ingredients: state.ingredients.length,
    recipes: state.items.length,
    overheads: state.overheads.filter((o) => o.active).length,
    pricing: state.items.filter((i) => i.category !== 'نیمه‌ساخته' && i.active).length,
  };

  const menuItems = state.items.filter((i) => i.category !== 'نیمه‌ساخته' && i.active && i.price);
  const weakCount = menuItems.filter((i) => {
    const c = engine.byItem[i.id];
    return c && (c.margin ?? 1) < state.settings.targetMargin;
  }).length;

  const quickAdd = (kind: 'ing' | 'item') => {
    setQuick(false); setDrawer(false);
    if (kind === 'ing') setView('ingredients');
    else setView('recipes');
    setTimeout(() => {
      document.querySelector<HTMLButtonElement>(`[data-quick="${kind}"]`)?.click();
    }, 160);
  };

  const navList = (variant: 'side' | 'drawer') => (
    <nav className="nav">
      {GROUPS.map((g) => (
        <React.Fragment key={g}>
          <div className="nav-group-title">{g}</div>
          {NAV.filter((n) => n.group === g).map((n) => {
            const Ico = n.ico;
            return (
              <button key={n.key} className={`nav-item drawer-item ${view === n.key ? 'on' : ''}`}
                onClick={() => go(n.key)} aria-current={view === n.key ? 'page' : undefined}>
                <Ico className="nav-ico" />
                <span>{n.label}</span>
                {counts[n.key] != null && <span className="ni-badge">{faDigits(counts[n.key])}</span>}
              </button>
            );
          })}
        </React.Fragment>
      ))}
    </nav>
  );

  return (
    <div className={`app${mobile ? ' is-mobile' : ''}${tablet ? ' is-tablet' : ''}${compact ? ' is-compact' : ''}`}>
      {/* هاله‌های رنگیِ پس‌زمینه */}
      {!mobile && (
        <div className="aurora" aria-hidden="true">
          <span className="aurora-blob b1" /><span className="aurora-blob b2" /><span className="aurora-blob b3" />
        </div>
      )}

      {/* ------------------------------------------------------- نوارِ کناری */}
      {!mobile && (
        <aside className="sidebar">
          <div className="brand"><Logo tone="light" size={46} /></div>
          {navList('side')}
          <div className="side-footer">
            <div className="chef-card">
              <div className="avatar"><ChefAvatar size={38} /></div>
              <div className="txt">
                <div className="chef-name">{state.settings.chef}</div>
                <div className="chef-sub" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span className="pulse-dot" /> آنلاین · {faDigits(today)}
                </div>
                <div style={{ marginTop: 7 }}><CloudBadge /></div>
              </div>
            </div>
          </div>
        </aside>
      )}

      {/* ------------------------------------------------------- منوی کشویی */}
      {mobile && (
        <>
          <div className={`scrim${drawer ? ' on' : ''}`} onClick={() => setDrawer(false)} />
          <aside className={`nav-drawer${drawer ? ' on' : ''}`}>
            <div className="nav-drawer-head">
              <Logo tone="dark" size={40} />
              <button className="icon-btn" onClick={() => setDrawer(false)} aria-label="بستن"><IconX size={18} /></button>
            </div>
            {navList('drawer')}
            <div className="nav-drawer-foot">
              <Button variant="primary" full onClick={() => quickAdd('ing')}>
                <IconPlus size={16} /> مادهٔ اولیهٔ جدید
              </Button>
              <Button full onClick={() => quickAdd('item')}><IconBook size={16} /> آیتمِ جدیدِ منو</Button>
              <div className="chef-card" style={{ marginTop: 6 }}>
                <div className="avatar"><ChefAvatar size={40} /></div>
                <div className="txt">
                  <div className="chef-name">{state.settings.chef}</div>
                  <div className="chef-sub" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span className="pulse-dot" /> آنلاین · {faDigits(today)}
                  </div>
                  <div style={{ marginTop: 7 }}><CloudBadge /></div>
                </div>
              </div>
            </div>
          </aside>
        </>
      )}

      <main className="main">
        <header className="topbar">
          {mobile && (
            <button className="icon-btn menu-btn" onClick={() => setDrawer(true)} aria-label="منو">
              <IconMenu size={20} />
            </button>
          )}
          <div className="topbar-title">
            <div className="page-title">{TITLES[view].t}</div>
            {!compact && <div className="page-sub">{TITLES[view].s}</div>}
          </div>
          <div className="topbar-actions">
            {!mobile && (
              <span className="chip" title={jalaliLong(today)}>{faDigits(jalaliLong(today))}</span>
            )}
            {weakCount > 0 && view !== 'pricing' && !compact && (
              <button className="chip red" style={{ cursor: 'pointer', border: '1px solid #f3ccd0' }}
                onClick={() => go('pricing')}>
                <IconAlert size={12} /> {faDigits(weakCount)} آیتم زیرِ هدف
              </button>
            )}
            {mobile ? (
              <Button variant="primary" iconOnly onClick={() => quickAdd('ing')} aria-label="افزودن">
                <IconPlus size={18} />
              </Button>
            ) : (
              <div style={{ position: 'relative' }}>
                <Button variant="primary" onClick={() => setQuick((q) => !q)}>
                  <IconPlus size={16} /> افزودن
                </Button>
                {quick && (
                  <div className="dp-pop" style={{ top: 'calc(100% + 10px)', insetInlineEnd: 0, insetInlineStart: 'auto', width: 220 }}>
                    <button className="list-item" style={{ borderRadius: 10 }} onClick={() => quickAdd('ing')}>
                      <IconLeaf size={16} /> مادهٔ اولیهٔ جدید
                    </button>
                    <button className="list-item" style={{ borderRadius: 10 }} onClick={() => quickAdd('item')}>
                      <IconBook size={16} /> آیتمِ جدیدِ منو
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </header>

        <div className="content" ref={contentRef}>
          {booting ? (
            <div className="grid g4">
              {[0, 1, 2, 3].map((i) => (
                <div className="card card-pad" key={i}>
                  <div className="skel" style={{ height: 14, width: '60%', marginBottom: 12 }} />
                  <div className="skel" style={{ height: 28, width: '80%' }} />
                </div>
              ))}
            </div>
          ) : (
            <>
              {view === 'dashboard' && <Dashboard key="v-dashboard" onNavigate={(v) => go(v as ViewKey)} />}
              {view === 'ingredients' && <Ingredients key="v-ing" />}
              {view === 'recipes' && <Recipes key="v-rec" />}
              {view === 'overheads' && <Overheads key="v-ovh" />}
              {view === 'pricing' && <Pricing key="v-pri" />}
              {view === 'settings' && <Settings key="v-set" />}
            </>
          )}
        </div>
      </main>

      {/* ------------------------------------------------------- نوارِ پایین */}
      {mobile && (
        <nav className="bottom-nav">
          {NAV.map((n) => {
            const Ico = n.ico;
            return (
              <button key={n.key} className={`bottom-nav-item${view === n.key ? ' on' : ''}`}
                onClick={() => go(n.key)}>
                <span className="bni-wrap"><Ico size={21} /></span>
                <span className="bni-label">{n.short}</span>
              </button>
            );
          })}
        </nav>
      )}

      <div className="toast-wrap">
        {toasts.map((t) => (
          <div className={`toast ${t.kind}`} key={t.id} onClick={() => dismiss(t.id)} style={{ cursor: 'pointer' }}>
            <span className="dot" />
            {t.kind === 'ok' && <IconCheck size={15} />}
            {t.kind === 'err' && <IconAlert size={15} />}
            {t.kind === 'warn' && <IconBolt size={15} />}
            {t.msg}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <MediaProvider>
      <Shell />
    </MediaProvider>
  );
}
