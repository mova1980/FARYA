// تقویم جلالی (شمسی) — پیاده‌سازی دقیق بر پایهٔ تبدیل به عدد روزِ جولیَن (JDN)
// الگوریتم: fourmilab calendrical calculations (Reingold & Dershowitz)

const floor = Math.floor;
const mod = (a: number, b: number) => a - floor(a / b) * b;

const PERSIAN_EPOCH = 1948321;      // JDNِ ۱ فروردین سال ۱ هجری شمسی
const DAYS_IN_CYCLE = 1029983;      // تعداد روزهای چرخهٔ ۲۸۲۰ ساله

/* ------------------------------------------------------------- میلادی <-> JDN */
export function gregorianToJdn(y: number, m: number, d: number): number {
  const a = floor((14 - m) / 12);
  const yy = y + 4800 - a;
  const mm = m + 12 * a - 3;
  return d + floor((153 * mm + 2) / 5) + 365 * yy + floor(yy / 4)
    - floor(yy / 100) + floor(yy / 400) - 32045;
}

export function jdnToGregorian(jdn: number): [number, number, number] {
  const a = jdn + 32044;
  const b = floor((4 * a + 3) / 146097);
  const c = a - floor((146097 * b) / 4);
  const d = floor((4 * c + 3) / 1461);
  const e = c - floor((1461 * d) / 4);
  const m = floor((5 * e + 2) / 153);
  const day = e - floor((153 * m + 2) / 5) + 1;
  const month = m + 3 - 12 * floor(m / 10);
  const year = 100 * b + d - 4800 + floor(m / 10);
  return [year, month, day];
}

/* -------------------------------------------------------------- شمسی <-> JDN */
export function jalaliToJdn(jy: number, jm: number, jd: number): number {
  const epbase = jy - (jy >= 0 ? 474 : 473);
  const epyear = 474 + mod(epbase, 2820);
  const mdays = jm <= 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186;
  return (PERSIAN_EPOCH - 1)
    + DAYS_IN_CYCLE * floor(epbase / 2820)
    + 365 * (epyear - 1)
    + floor((682 * epyear - 110) / 2816)
    + mdays
    + jd;
}

const CYCLE_BASE = jalaliToJdn(475, 1, 1);   // شروع چرخهٔ ۲۸۲۰ ساله

export function jdnToJalali(jdn: number): [number, number, number] {
  const depoch = jdn - CYCLE_BASE;
  const cycle = floor(depoch / DAYS_IN_CYCLE);
  const cyear = mod(depoch, DAYS_IN_CYCLE);
  let ycycle: number;
  if (cyear === DAYS_IN_CYCLE - 1) {
    ycycle = 2820;
  } else {
    const aux1 = floor(cyear / 366);
    const aux2 = mod(cyear, 366);
    ycycle = floor((2134 * aux1 + 2816 * aux2 + 2815) / 1028522) + aux1 + 1;
  }
  let year = ycycle + 2820 * cycle + 474;
  if (year <= 0) year -= 1;
  const yday = jdn - jalaliToJdn(year, 1, 1) + 1;
  const month = yday <= 186 ? Math.ceil(yday / 31) : Math.ceil((yday - 186) / 30) + 6;
  const day = jdn - jalaliToJdn(year, month, 1) + 1;
  return [year, month, day];
}

/* ------------------------------------------------------------------- تبدیل‌ها */
export function toJalali(gy: number, gm: number, gd: number): [number, number, number] {
  return jdnToJalali(gregorianToJdn(gy, gm, gd));
}

export function toGregorian(jy: number, jm: number, jd: number): [number, number, number] {
  return jdnToGregorian(jalaliToJdn(jy, jm, jd));
}

export function isLeapJalali(jy: number): boolean {
  return jalaliToJdn(jy + 1, 1, 1) - jalaliToJdn(jy, 1, 1) === 366;
}

export function jalaliMonthLength(jy: number, jm: number): number {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  return isLeapJalali(jy) ? 30 : 29;
}

/* ----------------------------------------------------------------- رشته/تاریخ */
const PAD = (n: number) => String(n).padStart(2, '0');

export interface JDate { y: number; m: number; d: number }

export function parseJalali(s: string): JDate | null {
  if (!s) return null;
  const p = String(s).trim().replace(/[.\-/]/g, '/').split('/');
  if (p.length !== 3) return null;
  const [y, m, d] = p.map((x) => parseInt(x, 10));
  if (!y || !m || !d) return null;
  return { y, m, d };
}

export function isValidJalali(y: number, m: number, d: number): boolean {
  return m >= 1 && m <= 12 && d >= 1 && d <= jalaliMonthLength(y, m);
}

export function fmtJalali(s: string | JDate | null | undefined): string {
  if (!s) return '';
  const j = typeof s === 'string' ? parseJalali(s) : s;
  if (!j) return '';
  return `${j.y}/${PAD(j.m)}/${PAD(j.d)}`;
}

export function todayJalali(): JDate {
  const now = new Date();
  const [y, m, d] = toJalali(now.getFullYear(), now.getMonth() + 1, now.getDate());
  return { y, m, d };
}

export function todayJalaliStr(): string {
  return fmtJalali(todayJalali());
}

export function jalaliToDate(s: string): Date | null {
  const j = parseJalali(s);
  if (!j) return null;
  const [gy, gm, gd] = toGregorian(j.y, j.m, j.d);
  return new Date(gy, gm - 1, gd, 12, 0, 0, 0);
}

export function dateToJalaliStr(dt: Date): string {
  const [y, m, d] = toJalali(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
  return fmtJalali({ y, m, d });
}

export function addDaysJalali(s: string, days: number): string {
  const d = jalaliToDate(s) || new Date();
  d.setDate(d.getDate() + days);
  return dateToJalaliStr(d);
}

export function daysBetween(a: string, b: string): number {
  const da = jalaliToDate(a);
  const db = jalaliToDate(b);
  if (!da || !db) return NaN;
  return Math.round((db.getTime() - da.getTime()) / 86400000);
}

export function addMonthsJalali(y: number, m: number, delta: number): JDate {
  let yy = y + Math.floor((m - 1 + delta) / 12);
  let mm = mod(m - 1 + delta, 12) + 1;
  return { y: yy, m: mm, d: 1 };
}

const MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
const WEEKDAYS = ['دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه', 'یکشنبه'];

export const JALALI_MONTHS = MONTHS;
export const JALALI_WEEKDAYS = WEEKDAYS;
/** ترتیب ستون‌های تقویم: شنبه تا جمعه */
export const CAL_WEEKDAYS = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'];

export function jalaliMonthName(m: number) {
  return MONTHS[m - 1] || '';
}

export function jalaliLong(s: string): string {
  const j = parseJalali(s);
  if (!j) return '';
  const dt = jalaliToDate(s);
  const wd = dt ? WEEKDAYS[(dt.getDay() + 6) % 7] : '';
  return `${wd} ${j.d} ${MONTHS[j.m - 1]} ${j.y}`;
}

/** چند روز از ابتدای ماه باید خالی بماند (ستون‌های شنبه تا جمعه) */
export function monthStartOffset(jy: number, jm: number): number {
  const dt = jalaliToDate(fmtJalali({ y: jy, m: jm, d: 1 }));
  if (!dt) return 0;
  return (dt.getDay() + 1) % 7;
}
