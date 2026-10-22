import React, { useEffect, useRef, useState } from 'react';
import { clsx, faDigits, num } from '../lib/format';
import { IconSearch, IconX } from './Icons';

/* --------------------------------------------------------------------- Button */
export function Button({
  children, className, variant, onClick, type = 'button', disabled, title, full, iconOnly, ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string; full?: boolean; iconOnly?: boolean }) {
  const ref = useRef<HTMLButtonElement>(null);
  const ripple = (e: React.MouseEvent<HTMLButtonElement>) => {
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const s = document.createElement('span');
    const size = Math.max(r.width, r.height);
    s.className = 'ripple';
    s.style.width = s.style.height = `${size}px`;
    s.style.left = `${e.clientX - r.left - size / 2}px`;
    s.style.top = `${e.clientY - r.top - size / 2}px`;
    el.appendChild(s);
    setTimeout(() => s.remove(), 620);
  };
  return (
    <button
      ref={ref} type={type} title={title} disabled={disabled}
      className={clsx('btn', variant, full && 'btn-full', iconOnly && 'btn-icon-only', className)}
      onClick={(e) => { ripple(e); onClick?.(e); }} {...rest}
    >
      {children}
    </button>
  );
}

/* ---------------------------------------------------------------------- Modal */
export function Modal({
  open, onClose, title, sub, children, footer, wide,
}: {
  open: boolean; onClose: () => void; title: string; sub?: string;
  children: React.ReactNode; footer?: React.ReactNode; wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    if (open) document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={clsx('modal', wide && 'wide')} role="dialog" aria-modal="true">
        <div className="modal-head">
          <div style={{ flex: 1 }}>
            <h3>{title}</h3>
            {sub && <div className="sub">{sub}</div>}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="بستن"><IconX size={17} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------- Drawer */
export function Drawer({
  open, onClose, title, children, footer,
}: {
  open: boolean; onClose: () => void; title: React.ReactNode;
  children: React.ReactNode; footer?: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    if (open) document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <>
      <div className="overlay" onMouseDown={onClose} />
      <aside className="drawer" style={{ insetInlineStart: 'auto', insetInlineEnd: 0 }}>
        <div className="drawer-head">
          <div style={{ flex: 1 }}>{title}</div>
          <button className="icon-btn" onClick={onClose} aria-label="بستن"><IconX size={17} /></button>
        </div>
        <div className="drawer-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </aside>
    </>
  );
}

/* --------------------------------------------------------------------- Fields */
export function Field({ label, hint, children, full, style }: {
  label?: string; hint?: string; children: React.ReactNode; full?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <div className={clsx('field', full && 'full')} style={style}>
      {label && <label className="label">{label}</label>}
      {children}
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

export function MoneyInput({ value, onChange, ...rest }: {
  value: number | null; onChange: (v: number | null) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const [txt, setTxt] = useState(value == null ? '' : faDigits(String(value)));
  useEffect(() => {
    const incoming = value == null ? '' : faDigits(String(value));
    setTxt((prev) => {
      const cur = prev.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[^\d.-]/g, '');
      return Number(cur) === Number(value) ? prev : incoming;
    });
  }, [value]);
  return (
    <input
      className="input mono"
      inputMode="decimal"
      value={txt}
      onChange={(e) => {
        const raw = e.target.value;
        const cleaned = raw.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
          .replace(/[^\d.]/g, '');
        setTxt(raw.replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]));
        onChange(cleaned === '' ? null : Number(cleaned));
      }}
      {...rest}
    />
  );
}

export function Switch({ checked, onChange, label }: {
  checked: boolean; onChange: (v: boolean) => void; label?: string;
}) {
  return (
    <label className="switch">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="track" />
      {label && <span style={{ fontSize: 13 }}>{label}</span>}
    </label>
  );
}

export function Seg<T extends string>({ value, options, onChange }: {
  value: T; options: Array<{ v: T; l: string }>; onChange: (v: T) => void;
}) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button key={o.v} className={clsx(value === o.v && 'on')} onClick={() => onChange(o.v)}>
          {o.l}
        </button>
      ))}
    </div>
  );
}

export function SearchBox({ value, onChange, placeholder = 'جستجو…' }: {
  value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <div className="search">
      <span style={{ color: 'var(--muted)', display: 'flex' }}><IconSearch size={16} /></span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      {value && (
        <button className="icon-btn" style={{ width: 20, height: 20 }} onClick={() => onChange('')}>
          <IconX size={13} />
        </button>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------- Charts */
export function Ring({ value, label, sub, size = 132 }: {
  value: number; label: string; sub?: string; size?: number;
}) {
  const r = 54;
  const c = 2 * Math.PI * r;
  const [off, setOff] = useState(c);
  useEffect(() => {
    const t = setTimeout(() => setOff(c * (1 - Math.max(0, Math.min(1, value)))), 60);
    return () => clearTimeout(t);
  }, [value, c]);
  return (
    <div className="ring" style={{ width: size, height: size, flexBasis: size }}>
      <svg width={size} height={size} viewBox="0 0 132 132">
        <defs>
          <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#7fbf5a" />
            <stop offset="100%" stopColor="#24563c" />
          </linearGradient>
        </defs>
        <circle className="bg" cx="66" cy="66" r={r} />
        <circle className="fg" cx="66" cy="66" r={r} strokeDasharray={c} strokeDashoffset={off} />
      </svg>
      <div className="ring-label">
        <b>{label}</b>
        {sub && <span>{sub}</span>}
      </div>
    </div>
  );
}

export function Bars({ rows, max }: {
  rows: Array<{ name: string; value: number; display: string; tone?: string }>;
  max?: number;
}) {
  const mx = max || Math.max(1, ...rows.map((r) => r.value));
  const [go, setGo] = useState(false);
  useEffect(() => { const t = setTimeout(() => setGo(true), 80); return () => clearTimeout(t); }, [rows]);
  return (
    <div className="bars">
      {rows.map((r) => (
        <div className="bar-row" key={r.name}>
          <div className="bar-name" title={r.name}>{r.name}</div>
          <div className="bar-track">
            <div
              className={clsx('bar-fill', r.tone === 'warn' && 'warn', r.tone === 'gold' && 'gold')}
              style={{ width: go ? `${Math.max(2, (r.value / mx) * 100)}%` : 0 }}
            />
          </div>
          <div className="bar-val">{r.display}</div>
        </div>
      ))}
    </div>
  );
}

export function Sparkline({ points, w = 120, h = 34, color = '#2f6b4c' }: {
  points: number[]; w?: number; h?: number; color?: string;
}) {
  if (points.length < 2) return <svg className="sparkline" width={w} height={h} />;
  const mn = Math.min(...points), mx = Math.max(...points);
  const span = mx - mn || 1;
  const d = points.map((p, i) => {
    const x = (i / (points.length - 1)) * (w - 4) + 2;
    const y = h - 3 - ((p - mn) / span) * (h - 8);
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const area = `${d} L${w - 2},${h} L2,${h} Z`;
  return (
    <svg className="sparkline" width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <defs>
        <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity=".22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#sparkFill)" />
      <path d={d} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      <circle cx={w - 2} cy={h - 3 - ((points[points.length - 1] - mn) / span) * (h - 8)}
        r="2.6" fill={color} />
    </svg>
  );
}

/* ----------------------------------------------------------------- Count up */
export function CountUp({ value, decimals = 0, suffix = '', duration = 1100 }: {
  value: number; decimals?: number; suffix?: string; duration?: number;
}) {
  const [v, setV] = useState(0);
  const ref = useRef<number>(0);
  useEffect(() => {
    const from = ref.current;
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const e = 1 - Math.pow(1 - p, 3);
      const cur = from + (value - from) * e;
      ref.current = cur;
      setV(cur);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <>{faDigits(v.toFixed(decimals))}{suffix}</>;
}

export function Money({ value, decimals = 0 }: { value: number | null | undefined; decimals?: number }) {
  if (value == null || Number.isNaN(value)) return <span style={{ color: 'var(--muted)' }}>—</span>;
  return <span className="num">{num(value, decimals)}</span>;
}

export function Empty({ icon = '🍽️', title, sub, action }: {
  icon?: string; title: string; sub?: string; action?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <div className="ico">{icon}</div>
      <div style={{ fontWeight: 700, color: 'var(--txt)' }}>{title}</div>
      {sub && <div style={{ fontSize: 12, marginTop: 4 }}>{sub}</div>}
      {action && <div style={{ marginTop: 14, display: 'flex', justifyContent: 'center' }}>{action}</div>}
    </div>
  );
}

export function Skeleton({ h = 16, w = '100%', r = 8 }: { h?: number; w?: string | number; r?: number }) {
  return <div className="skel" style={{ height: h, width: w, borderRadius: r }} />;
}
