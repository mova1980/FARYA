import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CAL_WEEKDAYS, JALALI_MONTHS, fmtJalali, isValidJalali, jalaliMonthLength,
  monthStartOffset, parseJalali, todayJalali, todayJalaliStr, jalaliLong,
} from '../lib/jalali';
import { faDigits } from '../lib/format';
import { IconCalendar, IconCheck, IconX } from './Icons';

interface Props {
  value: string;
  onChange: (v: string) => void;
  label?: string;
  hint?: string;
  id?: string;
}

export function JalaliDatePicker({ value, onChange, label, hint, id }: Props) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const [text, setText] = useState(faDigits(value || ''));
  const sel = parseJalali(value) || todayJalali();
  const [view, setView] = useState<{ y: number; m: number }>({ y: sel.y, m: sel.m });
  const today = todayJalaliStr();

  useEffect(() => { setText(faDigits(value || '')); }, [value]);
  useEffect(() => {
    const s = parseJalali(value);
    if (s) setView({ y: s.y, m: s.m });
  }, [value]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const cells = useMemo(() => {
    const len = jalaliMonthLength(view.y, view.m);
    const off = monthStartOffset(view.y, view.m);
    const out: Array<{ d: number | null }> = [];
    for (let i = 0; i < off; i++) out.push({ d: null });
    for (let d = 1; d <= len; d++) out.push({ d });
    return out;
  }, [view]);

  const commit = (y: number, m: number, d: number) => {
    if (!isValidJalali(y, m, d)) return;
    onChange(fmtJalali({ y, m, d }));
    setOpen(false);
  };

  const shift = (delta: number) => {
    let m = view.m + delta;
    let y = view.y;
    while (m < 1) { m += 12; y -= 1; }
    while (m > 12) { m -= 12; y += 1; }
    setView({ y, m });
  };

  const onText = (raw: string) => {
    // فقط ارقام و جداکننده را نگه می‌داریم و ارقام فارسی را به لاتین برمی‌گردانیم
    const cleaned = raw.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
    setText(raw.replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]));
    const p = parseJalali(cleaned);
    if (p && isValidJalali(p.y, p.m, p.d)) onChange(fmtJalali(p));
  };

  const valid = !!parseJalali(value);

  return (
    <div className="field" ref={box} id={id}>
      {label && <label className="label">{label}</label>}
      <div className="dp">
        <div
          className="input dp-input"
          style={{ display: 'flex', alignItems: 'center', gap: 8, paddingInlineEnd: 8 }}
          onClick={() => setOpen((o) => !o)}
          role="button" tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setOpen((o) => !o); }}
        >
          <input
            value={text}
            onChange={(e) => onText(e.target.value)}
            placeholder="انتخاب از تقویم…"
            style={{ border: 'none', outline: 'none', background: 'transparent', width: '100%', padding: 0 }}
            aria-invalid={!valid && text ? 'true' : 'false'}
          />
          <span style={{ color: 'var(--muted)', display: 'flex' }}><IconCalendar size={17} /></span>
        </div>

        {open && (
          <div className="dp-pop">
            <div className="dp-head">
              <button className="icon-btn" onClick={() => shift(-1)} aria-label="ماه قبل">›</button>
              <button className="icon-btn" onClick={() => { setView({ y: view.y - 1, m: view.m }); }}
                aria-label="سال قبل">»</button>
              <span className="t">
                {JALALI_MONTHS[view.m - 1]} {faDigits(view.y)}
              </span>
              <button className="icon-btn" onClick={() => { setView({ y: view.y + 1, m: view.m }); }}
                aria-label="سال بعد">«</button>
              <button className="icon-btn" onClick={() => shift(1)} aria-label="ماه بعد">‹</button>
            </div>

            <div className="dp-grid">
              {CAL_WEEKDAYS.map((w) => <div key={w} className="dp-wd">{w.slice(0, 1)}</div>)}
              {cells.map((c, i) => c.d === null
                ? <div key={`e${i}`} />
                : (
                  <div
                    key={c.d}
                    className={[
                      'dp-day',
                      fmtJalali({ y: view.y, m: view.m, d: c.d! }) === today ? 'today' : '',
                      fmtJalali({ y: view.y, m: view.m, d: c.d! }) === value ? 'on' : '',
                    ].filter(Boolean).join(' ')}
                    onClick={() => commit(view.y, view.m, c.d!)}
                  >
                    {faDigits(c.d!)}
                  </div>
                ))}
            </div>

            <div className="dp-foot">
              <button className="btn sm" onClick={() => { onChange(today); setOpen(false); }}>
                <IconCheck size={14} /> امروز ({faDigits(today)})
              </button>
              <button className="btn sm ghost" onClick={() => { onChange(''); setOpen(false); }}>
                <IconX size={14} /> پاک‌کردن
              </button>
              <span style={{ marginInlineStart: 'auto', fontSize: 11, color: 'var(--muted)' }}>
                {value ? jalaliLong(value) : ''}
              </span>
            </div>
          </div>
        )}
      </div>
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

export default JalaliDatePicker;
