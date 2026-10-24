import React, { useEffect, useState } from 'react';
import { PIZZAS } from '../data/pizzas';
import { getSupabase, isSupabaseConfigured } from '../lib/supabase';
import { price } from '../lib/format';
import '../styles/online-menu.css';

type PublicPrice = { code: string; price: number | string | null };
type MenuStatus = 'loading' | 'ready' | 'unavailable' | 'unconfigured';

const PHONE_HREF = 'tel:02634422723';

export default function OnlineMenu() {
  const [prices, setPrices] = useState<Record<string, number | null>>({});
  const [status, setStatus] = useState<MenuStatus>('loading');
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') setRefresh((value) => value + 1);
    };
    const timer = window.setInterval(refreshWhenVisible, 60_000);
    window.addEventListener('focus', refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refreshWhenVisible);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, []);

  useEffect(() => {
    let active = true;
    const client = getSupabase();
    if (!client) {
      setStatus(isSupabaseConfigured ? 'unavailable' : 'unconfigured');
      return () => { active = false; };
    }
    setStatus('loading');
    void (async () => {
      try {
        const { data, error } = await client.rpc('farya_public_menu');
        if (!active) return;
        if (error) { setStatus('unavailable'); return; }
        const byCode: Record<string, number | null> = {};
        ((data ?? []) as PublicPrice[]).forEach((row) => {
          const value = row.price === null ? null : Number(row.price);
          byCode[row.code] = value !== null && Number.isFinite(value) ? value : null;
        });
        setPrices(byCode);
        setStatus('ready');
      } catch {
        if (active) setStatus('unavailable');
      }
    })();
    return () => { active = false; };
  }, [refresh]);

  const liveCount = PIZZAS.filter((pizza) => (prices[pizza.code] ?? 0) > 0).length;
  const statusText = status === 'loading'
    ? 'در حال دریافت قیمت از دفتر فریا…'
    : status === 'unavailable'
      ? 'قیمت‌ها موقتاً در دسترس نیستند؛ برای اطلاع تماس بگیرید.'
      : status === 'unconfigured'
        ? 'نمایش قیمت آنلاین پس از اتصال امن به دفتر قیمت‌گذاری فعال می‌شود.'
        : liveCount === PIZZAS.length
          ? 'قیمت‌ها از دفتر بهای تمام‌شدهٔ فریا خوانده شده‌اند.'
          : 'برای قیمت روز، با فریا تماس بگیرید.';

  return (
    <main className="online-menu" dir="rtl">
      <header className="online-menu-header">
        <a className="online-menu-brand" href="/" aria-label="بازگشت به سایت فریا">
          <img src="/images/logo-farya.webp" alt="لوگوی FARYA" />
          <span><b>FARYA</b><small>پیتزای تنوری ناپولیتن</small></span>
        </a>
        <nav aria-label="پیمایش منوی آنلاین">
          <a href="/">صفحهٔ اصلی</a>
          <a href="#online-pizzas">پیتزاها</a>
          <a className="online-menu-call" href={PHONE_HREF}>سفارش تلفنی <span aria-hidden="true">↗</span></a>
        </nav>
      </header>

      <section className="online-menu-hero">
        <div className="online-menu-hero-image" aria-hidden="true" />
        <div className="online-menu-hero-shade" />
        <div className="online-menu-hero-content">
          <span className="online-kicker"><i /> FARYA · KARAJ</span>
          <p>هفت قصه، یک تنور</p>
          <h1>منوی آنلاین<br /><em>فریا.</em></h1>
          <span className="online-menu-intro">ترکیب‌ها همان‌اند که در منوی فریا می‌بینی؛ قیمتِ قابل‌نمایش از دفتر قیمت‌گذاری خوانده می‌شود.</span>
          <a href="#online-pizzas" className="online-scroll-link">دیدن پیتزاها <span aria-hidden="true">↓</span></a>
        </div>
        <span className="online-hero-index">01 <i /> 07</span>
      </section>

      <section className="online-pizzas-section" id="online-pizzas">
        <div className="online-section-heading">
          <div><span className="online-section-index">01 / منوی امضا</span><h2>طعمِ محبوبت را<br /><em>پیدا کن.</em></h2></div>
          <div className={`online-price-status is-${status}`} aria-live="polite">
            <span className="online-status-dot" />
            <p>{statusText}</p>
            <button type="button" onClick={() => setRefresh((value) => value + 1)} aria-label="تازه‌سازی قیمت‌ها">↻</button>
          </div>
        </div>

        <div className="online-pizza-grid">
          {PIZZAS.map((pizza, index) => {
            const currentPrice = prices[pizza.code];
            const hasPrice = typeof currentPrice === 'number' && currentPrice > 0;
            return (
              <article className="online-pizza-card" key={pizza.id} style={{ ['--card-index' as string]: index }}>
                <div className="online-pizza-photo">
                  <img src={pizza.image} alt={`پیتزای ${pizza.fa}`} loading={index > 2 ? 'lazy' : 'eager'} />
                  <span className="online-pizza-number">0{index + 1}</span>
                  <span className="online-pizza-meaning">{pizza.meaning}</span>
                </div>
                <div className="online-pizza-content">
                  <div className="online-pizza-title"><div><h3>{pizza.name}</h3><span>{pizza.fa}</span></div><span className="online-pizza-star" aria-hidden="true">✳</span></div>
                  <p className="online-pizza-note">{pizza.note}</p>
                  <div className="online-ingredients-label"><span>ترکیبِ منوی فریا</span><i /></div>
                  <p className="online-ingredients">{pizza.ingredients}</p>
                  <div className="online-pizza-footer">
                    <div className="online-current-price">
                      <small>{hasPrice ? 'قیمتِ ثبت‌شده' : 'قیمت روز'}</small>
                      {hasPrice ? <strong>{price(currentPrice)} <em>تومان</em></strong> : <strong className="price-pending">استعلام تلفنی</strong>}
                    </div>
                    <a href={PHONE_HREF} className="online-order-button">سفارش <span aria-hidden="true">↗</span></a>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
        <p className="online-menu-disclaimer">قیمت فقط زمانی نمایش داده می‌شود که برای همین کدِ پیتزا در دفتر بهای فریا ثبت شده باشد؛ در غیر این صورت از فریا استعلام بگیر.</p>
      </section>

      <section className="online-menu-end">
        <img src="/images/logo-farya.webp" alt="" aria-hidden="true" />
        <span>خمیر آماده‌ست. تنور روشنه.</span>
        <h2>حالا نوبتِ <em>توست.</em></h2>
        <a href={PHONE_HREF}>تماس برای سفارش · ۰۲۶ ۳۴۴۲۲۷۲۳</a>
        <a className="online-back-home" href="/">بازگشت به صفحهٔ اصلی فریا</a>
      </section>
    </main>
  );
}
