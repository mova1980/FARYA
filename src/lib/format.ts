const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

export function faDigits(input: string | number): string {
  return String(input).replace(/[0-9]/g, (d) => PERSIAN_DIGITS[+d]);
}

export function toFa(input: string | number): string {
  return faDigits(input);
}

/** جداکنندهٔ هزارگان با ارقام فارسی */
export function num(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const fixed = Math.abs(value) < 0.005 && digits === 0 ? 0 : value;
  const s = Number(fixed).toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return faDigits(s);
}

export function money(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return num(Math.round(value / Math.pow(10, digits)) * Math.pow(10, digits) / 1, 0);
}

export function price(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return faDigits(Math.round(value).toLocaleString('en-US'));
}

export function pct(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return faDigits((value * 100).toFixed(digits)) + '٪';
}

export function signedPct(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const v = value * 100;
  const sign = v > 0 ? '+ ' : v < 0 ? '− ' : '';
  return sign + faDigits(Math.abs(v).toFixed(digits)) + '٪';
}

export function roundTo(value: number, step: number): number {
  if (!step) return Math.round(value);
  return Math.round(value / step) * step;
}

export function clsx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export function uid(prefix = 'id'): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
}

export function slugId(name: string, prefix: string): string {
  const base = name.trim().replace(/\s+/g, '-').slice(0, 26) || 'x';
  return `${prefix}-${base}-${Math.random().toString(36).slice(2, 6)}`;
}
