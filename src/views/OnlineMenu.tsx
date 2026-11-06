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
          ? null
          : 'برای قیمت روز، با فریا تماس بگیرید.';

  return (
    <main className="online-menu online-menu-catalog" dir="rtl">
      <section className="online-pizzas-section" id="online-pizzas">
        <div className="online-section-heading">
          <div><span className="online-section-index">منوی امضای فریا</span><h1>پیتزاهای فریا</h1></div>
          {statusText && <div className={`online-price-status is-${status}`} aria-live="polite">
            <span className="online-status-dot" />
            <p>{statusText}</p>
            <button type="button" onClick={() => setRefresh((value) => value + 1)} aria-label="تازه‌سازی قیمت‌ها">↻</button>
          </div>}
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

    </main>
  );
}
