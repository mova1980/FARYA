import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import '../styles/restaurant.css';
import { PIZZAS, type Pizza } from '../data/pizzas';

function Arrow({ diagonal = false }: { diagonal?: boolean }) {
  return <svg className="site-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d={diagonal ? 'M7 17 17 7M8 7h9v9' : 'M4 12h15m-6-6 6 6-6 6'} /></svg>;
}

function PizzaDetailModal({ pizza, onClose, callNumber, triggerRef }: { pizza: Pizza; onClose: () => void; callNumber: string; triggerRef: { current: HTMLButtonElement | null } }) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const ingredients = pizza.ingredients.split(/،\s*/);
  const dialogId = `pizza-dialog-${pizza.id}`;

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.classList.add('pizza-modal-open');
    const frame = window.requestAnimationFrame(() => closeRef.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      ));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKeyDown);
      document.body.classList.remove('pizza-modal-open');
      if (triggerRef.current?.isConnected) triggerRef.current.focus();
      else previousFocus?.focus();
    };
  }, [onClose, triggerRef]);

  return createPortal(
    <div className="pizza-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="pizza-modal" role="dialog" aria-modal="true" aria-labelledby={dialogId} ref={dialogRef} dir="rtl">
        <button className="pizza-modal-close" type="button" aria-label="بستن جزئیات پیتزا" onClick={onClose} ref={closeRef}>×</button>
        <div className="pizza-modal-photo">
          <img src={pizza.image} alt={`تصویر نمایشی پیتزای ${pizza.fa}`} />
          <div className="pizza-modal-photo-shade" />
          <span className="pizza-modal-number">FARYA · 0{PIZZAS.findIndex((item) => item.id === pizza.id) + 1}</span>
        </div>
        <div className="pizza-modal-content">
          <span className="pizza-modal-kicker"><i /> منوی امضای فریا</span>
          <p className="pizza-modal-meaning">{pizza.meaning}</p>
          <h2 id={dialogId}><span>{pizza.name}</span><em>{pizza.fa}</em></h2>
          <p className="pizza-modal-note">{pizza.note}</p>
          <div className="pizza-modal-rule"><span>ترکیبِ منوی چاپی</span><i /></div>
          <ul className="pizza-modal-ingredients">
            {ingredients.map((ingredient) => <li key={ingredient}><span />{ingredient}</li>)}
          </ul>
          <a className="pizza-modal-order" href={callNumber}>قیمت روز و سفارش تلفنی <Arrow diagonal /></a>
        </div>
      </section>
    </div>,
    document.body,
  );
}

export default function RestaurantHome() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scroll, setScroll] = useState(0);
  const [activePizza, setActivePizza] = useState<string | null>(null);
  const pizzaTriggerRef = useRef<HTMLButtonElement>(null);
  const heroRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setScroll(max > 0 ? (window.scrollY / max) * 100 : 0);
      // If a hash link jumps past a reveal target, don't leave that content transparent.
      const revealLimit = window.innerHeight * 0.92;
      document.querySelectorAll('[data-reveal]:not(.is-visible)').forEach((el) => {
        if (el.getBoundingClientRect().top < revealLimit) el.classList.add('is-visible');
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    if (!reduce && 'IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      }), { threshold: 0.12, rootMargin: '0px 0px -35px 0px' });
      document.querySelectorAll('[data-reveal]').forEach((el) => io.observe(el));
      return () => { window.removeEventListener('scroll', onScroll); io.disconnect(); };
    }
    document.querySelectorAll('[data-reveal]').forEach((el) => el.classList.add('is-visible'));
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const node = heroRef.current;
    if (!node || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const onMove = (event: PointerEvent) => {
      const rect = node.getBoundingClientRect();
      node.style.setProperty('--pointer-x', `${event.clientX - rect.left}px`);
      node.style.setProperty('--pointer-y', `${event.clientY - rect.top}px`);
    };
    node.addEventListener('pointermove', onMove, { passive: true });
    return () => node.removeEventListener('pointermove', onMove);
  }, []);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenuOpen(false); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, []);

  const closeMenu = () => setMenuOpen(false);
  const closePizzaModal = useCallback(() => setActivePizza(null), []);
  const activePizzaData = PIZZAS.find((pizza) => pizza.id === activePizza) ?? null;
  const callNumber = 'tel:02634422723';
  const mapUrl = 'https://maps.app.goo.gl/6Q6C4EQ8Ugo4gg3v9';

  return (
    <main className="restaurant-site" dir="rtl">
      <div className="site-scroll-progress" style={{ width: `${scroll}%` }} />
      <header className={`site-header${menuOpen ? ' menu-open' : ''}`}>
        <a className="site-brand" href="/" aria-label="فریا، صفحهٔ اصلی">
          <span className="site-brand-mark"><img src="/images/logo-farya.webp" alt="لوگوی پیتزا فریا" /></span>
          <span className="site-brand-copy"><strong>FARYA</strong><small>پیتزای تنوری ناپولیتن</small></span>
        </a>
        <button className="site-menu-toggle" type="button" aria-label={menuOpen ? 'بستن منو' : 'باز کردن منو'} aria-expanded={menuOpen} onClick={() => setMenuOpen((v) => !v)}>
          <span /><span />
        </button>
        <nav className={`site-nav${menuOpen ? ' is-open' : ''}`} aria-label="پیمایش اصلی">
          <a href="#story" onClick={closeMenu}>داستانِ فریا</a>
          <a href="#menu" onClick={closeMenu}>پیتزاها</a>
          <a href="/menu" onClick={closeMenu}>منوی آنلاین</a>
          <a href="#visit" onClick={closeMenu}>ما را پیدا کن</a>
          <a className="site-nav-order" href={callNumber} onClick={closeMenu}>سفارش تلفنی <Arrow diagonal /></a>
        </nav>
      </header>

      <section className="site-hero" ref={heroRef} aria-labelledby="hero-title">
        <div className="site-hero-photo" />
        <div className="site-hero-grain" />
        <div className="site-hero-steam" aria-hidden="true">
          <svg className="site-hero-steam-art" viewBox="0 0 190 160" preserveAspectRatio="none">
            <defs>
              <linearGradient id="farya-steam-fade" x1="0" y1="1" x2="0" y2="0">
                <stop offset="0%" stopColor="#fff4e8" stopOpacity=".02" />
                <stop offset="38%" stopColor="#fff5eb" stopOpacity=".38" />
                <stop offset="72%" stopColor="#fff8f0" stopOpacity=".2" />
                <stop offset="100%" stopColor="#fff8f0" stopOpacity="0" />
              </linearGradient>
              <filter id="farya-steam-soft" x="-45%" y="-25%" width="190%" height="150%">
                <feTurbulence type="fractalNoise" baseFrequency=".022 .055" numOctaves="2" seed="8" result="vapour" />
                <feDisplacementMap in="SourceGraphic" in2="vapour" scale="10" xChannelSelector="R" yChannelSelector="G" result="drift" />
                <feGaussianBlur in="drift" stdDeviation="4" />
              </filter>
            </defs>
            <g className="steam-wisp steam-wisp-one" filter="url(#farya-steam-soft)"><path d="M43 160 C28 143 60 132 48 115 C35 98 69 88 53 70 C41 55 66 43 60 21 C79 43 58 57 75 72 C94 89 61 102 78 119 C92 134 70 147 82 160 Z" fill="url(#farya-steam-fade)" /></g>
            <g className="steam-wisp steam-wisp-two" filter="url(#farya-steam-soft)"><path d="M82 160 C68 142 99 133 88 115 C76 98 105 86 91 67 C80 52 103 38 98 14 C116 38 96 53 112 69 C130 88 101 103 117 119 C131 135 109 148 121 160 Z" fill="url(#farya-steam-fade)" /></g>
            <g className="steam-wisp steam-wisp-three" filter="url(#farya-steam-soft)"><path d="M124 160 C110 145 141 132 130 116 C118 99 148 88 135 71 C124 56 147 45 142 26 C159 46 140 59 155 74 C173 91 144 104 160 121 C174 137 153 148 164 160 Z" fill="url(#farya-steam-fade)" /></g>
          </svg>
        </div>
        <div className="site-hero-glow" />
        <div className="site-hero-content">
          <div className="site-kicker"><span className="kicker-line" /> ایتالیایی، با امضای فریا</div>
          <h1 id="hero-title">یک تکه<br /><em>آتشِ ناپولی</em></h1>
          <p className="site-hero-lead">خمیرِ دست‌ساز، لبه‌های آتش‌دیده و ترکیب‌هایی که هرکدام قصهٔ خودشان را دارند.</p>
          <div className="site-hero-actions">
            <a className="site-button site-button-red" href="#menu">کشفِ منوی فریا <Arrow /></a>
            <a className="site-button site-button-ghost" href={callNumber}>تماس برای سفارش <span className="phone-glyph">↗</span></a>
          </div>
          <div className="site-hero-note"><span className="oven-dot" /> Italian style · Oven baked <span className="note-divider">/</span> گوهردشت، کرج</div>
        </div>
        <a className="site-scroll-cue" href="#story" aria-label="ادامهٔ صفحه"><span /> اسکرول کن</a>
        <div className="site-hero-index"><span>01</span><i /> 07</div>
      </section>

      <section className="site-intro section-shell" id="story">
        <div className="intro-side" data-reveal>
          <span className="section-index">01 / از آتش</span>
          <p className="intro-hand">Good Food <b>♥</b> Good Mood</p>
        </div>
        <div className="intro-main" data-reveal>
          <p className="section-eyebrow">از تنور تا دورهمی</p>
          <h2>آتش، خمیر،<br /><em>یک حالِ خوب.</em></h2>
          <p className="intro-copy intro-copy-write" data-reveal>در فریا، هر پیتزا با الهام از سبک ناپولیتن و برای لحظه‌هایی ساخته می‌شود که دوست داری کمی بیشتر دورِ میز بمانی. موادِ خوش‌طعم، خمیرِ سبک و گرمایِ تنور؛ همین سه‌تا، شروعِ قصه‌اند.</p>
          <a className="text-link" href="#menu">قصهٔ طعم‌ها را ببین <Arrow /></a>
        </div>
        <div className="intro-stamp" aria-hidden="true"><span>WOOD</span><b>F</b><span>FIRE</span><i>•</i><span>NAPOLI</span></div>
      </section>

      <section className="site-menu-section" id="menu">
        <div className="section-shell menu-heading">
          <div data-reveal>
            <span className="section-index">02 / منوی امضا</span>
            <p className="section-eyebrow">هفت قصه، یک تنور</p>
            <h2>ناپولی، به روایتِ <em>فریا.</em></h2>
          </div>
          <p className="menu-intro-copy" data-reveal>هرکدام نامی دارند و حال‌وهوایی. روی پیتزا بزن تا ترکیبش را بشناسی؛ برای قیمتِ روز و سفارش، با ما تماس بگیر.</p>
        </div>
        <div className="pizza-grid section-shell">
          {PIZZAS.map((pizza, index) => (
            <article className="pizza-card" key={pizza.id}>
              <button className="pizza-card-button" type="button" aria-label={`نمایش تصویر و ترکیبات پیتزای ${pizza.fa}`} aria-haspopup="dialog" onClick={(event) => { pizzaTriggerRef.current = event.currentTarget; setActivePizza(pizza.id); }}>
                <span className="pizza-image-wrap"><img src={pizza.image} alt={`پیتزای ناپولیتن ${pizza.fa} با ${pizza.accent}`} loading="lazy" />
                  <span className="pizza-image-shade" /><span className="pizza-number">0{index + 1}</span><span className="pizza-plus" aria-hidden="true">↗</span>
                </span>
                <span className="pizza-card-body">
                  <span className="pizza-name-line"><span className="pizza-name-en">{pizza.name}</span><span className="pizza-meaning">{pizza.meaning}</span></span>
                  <span className="pizza-name-fa">{pizza.fa}</span>
                  <span className="pizza-note">{pizza.note}</span>
                </span>
              </button>
            </article>
          ))}
        </div>
        <div className="menu-bottom-line section-shell" data-reveal><span /> قیمتِ روز را از ما بپرس <a href={callNumber}>۰۲۶ ۳۴۴۲۲۷۲۳ <Arrow diagonal /></a></div>
        <p className="menu-disclaimer">تصاویرِ پیتزاها تصویرسازیِ مفهومی‌اند؛ ترکیب‌های نوشته‌شده بر اساسِ منوی فریا هستند.</p>
      </section>

      <section className="site-craft" aria-labelledby="craft-title">
        <div className="craft-image" role="img" aria-label="پیتزای ناپولیتن در کنار تنورِ آتشین" />
        <div className="craft-copy" data-reveal>
          <span className="section-index">03 / رسمِ تنور</span>
          <p className="section-eyebrow">ساده، صادق، آتشین</p>
          <h2 id="craft-title">بعضی طعم‌ها<br />با <em>عجله</em> جور نیستند.</h2>
          <p>لبهٔ خمیر که از آتش نشان دارد، عطرِ ریحان که تازه بلند می‌شود و اولین برشِ پیتزا؛ فریا برای همین لحظه‌هاست. منوی ما را ورق بزن و طعمِ محبوبت را پیدا کن.</p>
          <a className="text-link light-link" href="#menu">پیتزای امضایت را انتخاب کن <Arrow /></a>
          <div className="craft-orbit" aria-hidden="true"><span>F</span><i /></div>
        </div>
      </section>

      <section className="site-visit section-shell" id="visit">
        <div className="visit-main" data-reveal>
          <span className="section-index">04 / دورهمیِ بعدی</span>
          <p className="section-eyebrow">درِ فریا باز است</p>
          <h2>گوهردشت،<br /><em>کنارِ پارکِ هفتم.</em></h2>
          <p className="visit-copy">برای سفارش یا پیدا کردنِ مسیر، با ما تماس بگیر. خوشحال می‌شویم پیتزای بعدی‌ات را در فریا ببینیم.</p>
          <div className="visit-actions"><a className="site-button site-button-red" href={callNumber}>تماس با فریا <Arrow diagonal /></a><a className="text-link" href={mapUrl} target="_blank" rel="noreferrer">مسیر روی نقشه <Arrow diagonal /></a></div>
        </div>
        <div className="visit-card" data-reveal>
          <div className="visit-card-top"><span className="visit-pin">✳</span><span>FARYA · KARAJ</span></div>
          <div className="visit-map-embed">
            <div className="visit-map-fallback" aria-hidden="true"><span>گوگل مپس · گوهردشت</span><b>35.849030, 50.975500</b></div>
            <iframe title="نقشهٔ فریا در ضلع جنوبی پارک هفتم گوهردشت" src="https://maps.google.com/maps?q=35.849030%2C50.975500&z=16&output=embed" loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
            <div className="map-pin" aria-hidden="true"><span>F</span></div>
            <span className="map-label">فریا · ضلع جنوبی پارک هفتم</span>
          </div>
          <div className="visit-address"><span>نشانی</span><strong>کرج، گوهردشت<br />ضلع جنوبیِ پارکِ هفتم</strong><a href={mapUrl} target="_blank" rel="noreferrer">باز کردنِ نقشه <Arrow diagonal /></a></div>
        </div>
      </section>

      <section className="site-last-call">
        <div className="last-call-glow" />
        <span className="section-eyebrow">خمیر آماده‌ست. تنور روشنه.</span>
        <h2>حالا نوبتِ <em>توست.</em></h2>
        <a href={callNumber} className="site-button site-button-light">سفارش تلفنی <Arrow diagonal /></a>
        <span className="last-call-star" aria-hidden="true">✳</span>
      </section>

      <footer className="site-footer">
        <div className="footer-main section-shell">
          <div className="footer-brand-col"><a href="/" className="footer-logo" aria-label="فریا، صفحهٔ اصلی"><img src="/images/logo-farya.webp" alt="لوگوی FARYA" /></a>
            <p>Italian style. Oven baked.<br />یک حالِ خوب، هر بار.</p></div>
          <div className="footer-links"><span>بچرخ توی فریا</span><a href="#story">داستانِ فریا</a><a href="#menu">پیتزاهای فریا</a><a href="/menu">منوی آنلاین</a><a href="#visit">نشانی و تماس</a><a href="/cost">دفترِ بهای تمام‌شده</a>
            <a className="footer-menu-qr" href="/images/menu-qr.svg" download="farya-online-menu-qr.svg"><img src="/images/menu-qr.svg" alt="کد QR منوی آنلاین فریا" /><span>دریافت کد QR منو</span></a>
          </div>
          <div className="footer-contact"><span>پیدایمان کن</span><a href={callNumber} dir="ltr">026 — 3442 2723 <Arrow diagonal /></a><p>کرج، گوهردشت<br />ضلع جنوبیِ پارکِ هفتم</p><a className="footer-map" href={mapUrl} target="_blank" rel="noreferrer">مسیریابی <Arrow diagonal /></a></div>
        </div>
        <div className="footer-bottom section-shell"><span>© {new Date().getFullYear()} FARYA PIZZA · KARAJ</span><span>Good Food <b>♥</b> Good Mood</span><a href="/cost">ورودِ سرآشپز <Arrow diagonal /></a></div>
      </footer>
      {activePizzaData && <PizzaDetailModal pizza={activePizzaData} onClose={closePizzaModal} callNumber={callNumber} triggerRef={pizzaTriggerRef} />}
    </main>
  );
}
