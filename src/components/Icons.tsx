import React from 'react';

/**
 * آیکون‌های فریا
 * -----------------------------------------------------------------------------
 * هر آیکون یک انیمیشنِ مخصوصِ خودش دارد که با هاور روی دکمه/کارت/آیتمِ والد اجرا
 * می‌شود. برای اجرای همیشگی (مثلاً روی کارتِ شاخص سلامت) از propِ live استفاده کنید:
 *      <IconHeart live />
 * همهٔ انیمیشن‌ها به «prefers-reduced-motion» احترام می‌گذارند.
 */

export type IconProps = {
  size?: number;
  className?: string;
  stroke?: number;
  /** اجرای همیشگیِ انیمیشن (بدون نیاز به هاور) */
  live?: boolean;
};

type P = IconProps;

const wrap = (name: string, children: React.ReactNode, { size = 19, className, stroke = 1.7, live }: P) => (
  <svg
    width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round"
    className={['ico', `ico-${name}`, live ? 'ico-live' : '', className || ''].filter(Boolean).join(' ')}
    aria-hidden="true" focusable="false"
  >{children}</svg>
);

/* ------------------------------------------------------------------ پیمایش و داده */
export const IconDashboard = (p: P) => wrap('dashboard', <>
  <rect x="3" y="3" width="7.5" height="8.5" rx="2" />
  <rect x="13.5" y="3" width="7.5" height="5" rx="2" />
  <rect x="3" y="14.5" width="7.5" height="6.5" rx="2" />
  <rect x="13.5" y="11" width="7.5" height="10" rx="2" />
</>, p);

export const IconLeaf = (p: P) => wrap('leaf', <>
  <path className="i-a" d="M11 20A7 7 0 0 1 4 13c0-6 6-9 16-9 0 10-3 16-9 16Z" />
  <path className="i-b" d="M4 20c2-5 5-8 9-10" />
</>, p);

export const IconBook = (p: P) => wrap('book', <>
  <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15H6.5A2.5 2.5 0 0 0 4 20.5Z" />
  <path className="i-a" d="M8 7.5h7" /><path className="i-b" d="M8 11h5" />
</>, p);

export const IconLayers = (p: P) => wrap('layers', <>
  <path className="i-a" d="m12 3 8.5 4.8L12 12.6 3.5 7.8Z" />
  <path className="i-b" d="m4 12.5 8 4.5 8-4.5" />
  <path className="i-c" d="m4 17 8 4.5 8-4.5" />
</>, p);

export const IconTag = (p: P) => wrap('tag', <>
  <path d="M20.6 12.6 12.6 20.6a2 2 0 0 1-2.8 0l-6.4-6.4A2 2 0 0 1 3 12.8V5a2 2 0 0 1 2-2h7.8a2 2 0 0 1 1.4.6l6.4 6.4a2 2 0 0 1 0 2.6Z" />
  <circle className="i-a" cx="7.8" cy="7.8" r="1.4" />
</>, p);

export const IconSliders = (p: P) => wrap('sliders', <>
  <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
  <circle className="i-a" cx="16" cy="7" r="2.2" />
  <circle className="i-b" cx="10" cy="17" r="2.2" />
</>, p);

export const IconBox = (p: P) => wrap('box', <>
  <path className="i-lid" d="M3 7.5 12 3l9 4.5v9L12 21 3 16.5Z" />
  <path d="m3 7.5 9 4.5 9-4.5M12 12v9" />
</>, p);

export const IconGrid = (p: P) => wrap('grid', <>
  <rect className="i-a" x="3.5" y="3.5" width="7" height="7" rx="2" />
  <rect className="i-b" x="13.5" y="3.5" width="7" height="7" rx="2" />
  <rect className="i-c" x="3.5" y="13.5" width="7" height="7" rx="2" />
  <rect className="i-d" x="13.5" y="13.5" width="7" height="7" rx="2" />
</>, p);

export const IconMenu = (p: P) => wrap('menu', <>
  <path className="i-a" d="M4 7h16" /><path className="i-b" d="M4 12h16" /><path className="i-c" d="M4 17h16" />
</>, p);

/* ------------------------------------------------------------------ کنش‌ها */
export const IconPlus = (p: P) => wrap('plus', <path d="M12 5v14M5 12h14" />, p);
export const IconMinus = (p: P) => wrap('minus', <path d="M5 12h14" />, p);
export const IconCheck = (p: P) => wrap('check', <path className="i-draw" d="m4.5 12.5 5 5 10-11" />, p);
export const IconX = (p: P) => wrap('x', <>
  <path className="i-a" d="M6 6l12 12" /><path className="i-b" d="M18 6 6 18" />
</>, p);
export const IconClose = IconX;

export const IconSearch = (p: P) => wrap('search', <>
  <circle className="i-a" cx="11" cy="11" r="6.5" />
  <path className="i-b" d="m16 16 4.5 4.5" />
</>, p);

export const IconEdit = (p: P) => wrap('edit', <>
  <path d="M4 20h4l10.5-10.5a2.5 2.5 0 0 0-3.5-3.5L4.5 16.5Z" />
  <path className="i-a" d="M14.5 6.5 17.5 9.5" />
</>, p);

export const IconTrash = (p: P) => wrap('trash', <>
  <path className="i-lid" d="M4 7h16M9.5 7V5.5A1.5 1.5 0 0 1 11 4h2a1.5 1.5 0 0 1 1.5 1.5V7" />
  <path className="i-body" d="M6.5 7 7.6 19a2 2 0 0 0 2 1.9h4.8a2 2 0 0 0 2-1.9L17.5 7" />
  <path className="i-a" d="M10.5 11v6M13.5 11v6" />
</>, p);

export const IconCopy = (p: P) => wrap('copy', <>
  <rect className="i-a" x="9" y="9" width="11" height="11" rx="2.5" />
  <path className="i-b" d="M6 15H5a1.5 1.5 0 0 1-1.5-1.5V5A1.5 1.5 0 0 1 5 3.5h8.5A1.5 1.5 0 0 1 15 5v1" />
</>, p);

export const IconRefresh = (p: P) => wrap('refresh', <>
  <path d="M20 12a8 8 0 1 1-2.6-5.9" /><path d="M20 4v5h-5" />
</>, p);

export const IconDownload = (p: P) => wrap('download', <>
  <path className="i-a" d="M12 4v11M7.5 10.5 12 15l4.5-4.5" />
  <path className="i-b" d="M4.5 19.5h15" />
</>, p);

export const IconUpload = (p: P) => wrap('upload', <>
  <path className="i-a" d="M12 15V4M7.5 8.5 12 4l4.5 4.5" />
  <path className="i-b" d="M4.5 19.5h15" />
</>, p);

export const IconFilter = (p: P) => wrap('filter', <>
  <path d="M3.5 5h17l-6.5 8v6l-4-2v-4Z" />
</>, p);

export const IconSort = (p: P) => wrap('sort', <>
  <path className="i-a" d="M7 4v16M7 20l-3-3M7 20l3-3" />
  <path className="i-b" d="M17 20V4M17 4l-3 3M17 4l3 3" />
</>, p);

/* ------------------------------------------------------------------ زمان و تقویم */
export const IconCalendar = (p: P) => wrap('calendar', <>
  <rect x="3.5" y="5" width="17" height="16" rx="3" />
  <path d="M3.5 10h17" />
  <path className="i-a" d="M8.5 3v4" /><path className="i-b" d="M15.5 3v4" />
</>, p);

export const IconClock = (p: P) => wrap('clock', <>
  <circle cx="12" cy="12" r="9" />
  <path className="i-hand" d="M12 7.5V12l3.2 2" />
</>, p);

export const IconChevron = (p: P) => wrap('chevron', <path d="m9 6 6 6-6 6" />, p);
export const IconChevronL = (p: P) => wrap('chevron-l', <path d="m15 6-6 6 6 6" />, p);

/* ------------------------------------------------------------------ مفاهیم */
export const IconAlert = (p: P) => wrap('alert', <>
  <path d="M12 4.5 21 19.5H3Z" />
  <path className="i-a" d="M12 10v4M12 17h.01" />
</>, p);

export const IconInfo = (p: P) => wrap('info', <>
  <circle cx="12" cy="12" r="9" />
  <path className="i-a" d="M12 11v5M12 8h.01" />
</>, p);

export const IconFlame = (p: P) => wrap('flame', <>
  <path className="i-a" d="M12 3s5 4.5 5 9a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 1.5 0 2-2 1-4-.5-1.2-.5-2.3 0-3.5Z" />
</>, p);

export const IconBolt = (p: P) => wrap('bolt', <path d="M13.5 3 5 13.5h5l-1.5 7.5L18 10.5h-5Z" />, p);

export const IconHeart = (p: P) => wrap('heart', <>
  <path d="M12 20s-7.5-4.4-7.5-9.4A4.1 4.1 0 0 1 12 8a4.1 4.1 0 0 1 7.5 2.6c0 5-7.5 9.4-7.5 9.4Z" />
</>, p);

export const IconScale = (p: P) => wrap('scale', <>
  <path d="M12 4v16M6 8h12" />
  <path className="i-a" d="M8 8 4.5 16h7Z" />
  <path className="i-b" d="M16 8l-3.5 8h7Z" />
</>, p);

export const IconTarget = (p: P) => wrap('target', <>
  <circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" />
  <path className="i-arrow" d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4" />
</>, p);

export const IconCoins = (p: P) => wrap('coins', <>
  <ellipse className="i-a" cx="12" cy="6.5" rx="7" ry="3" />
  <path className="i-b" d="M5 6.5v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5" />
  <path className="i-c" d="M5 11.5v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5" />
</>, p);

export const IconWallet = (p: P) => wrap('wallet', <>
  <path d="M3.5 7.5A2.5 2.5 0 0 1 6 5h11.5A2.5 2.5 0 0 1 20 7.5v9A2.5 2.5 0 0 1 17.5 19H6a2.5 2.5 0 0 1-2.5-2.5Z" />
  <path className="i-a" d="M16 12h1.5" />
  <path d="M3.5 9.5h17" />
</>, p);

export const IconTrend = (p: P) => wrap('trend', <>
  <path className="i-draw" d="M3.5 16.5 9 10.5l3.5 3L20.5 5" />
  <path className="i-arrow" d="M15 5h5.5v5.5" />
</>, p);

export const IconSparkle = (p: P) => wrap('sparkle', <>
  <path className="i-a" d="M12 3.5c.9 3.6 2.4 5.1 6 6-3.6.9-5.1 2.4-6 6-.9-3.6-2.4-5.1-6-6 3.6-.9 5.1-2.4 6-6Z" />
  <path className="i-b" d="M18.5 15.5c.4 1.6 1.1 2.3 2.7 2.7-1.6.4-2.3 1.1-2.7 2.7-.4-1.6-1.1-2.3-2.7-2.7 1.6-.4 2.3-1.1 2.7-2.7Z" />
</>, p);

export const IconStar = (p: P) => wrap('star', <>
  <path d="m12 3.8 2.6 5.4 5.9.8-4.3 4.1 1.1 5.9-5.3-2.9-5.3 2.9 1.1-5.9L3.5 10l5.9-.8Z" />
</>, p);

export const IconChef = (p: P) => wrap('chef', <>
  <path className="i-hat" d="M6.5 12.5a3.8 3.8 0 0 1 .6-7.5 4.2 4.2 0 0 1 7.6-1.4 3.6 3.6 0 0 1 2.8 8.9Z" />
  <path d="M7 12.5h10v3.5a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2Z" />
  <path className="i-steam" d="M10 4.5c0-1 1-1.4 1-2.5M14 4.5c0-1 1-1.4 1-2.5" />
</>, p);

export const IconSalad = (p: P) => wrap('salad', <>
  <path d="M3.5 11h17a8.5 8.5 0 0 1-8.5 8.5A8.5 8.5 0 0 1 3.5 11Z" />
  <path className="i-a" d="M8 11c0-2.5 1-4 3-5" />
  <path className="i-b" d="M16 11c0-2.5-1-4-3-5" />
</>, p);

export const IconPrinter = (p: P) => wrap('printer', <>
  <path d="M7 9V4h10v5" />
  <rect x="3.5" y="9" width="17" height="7" rx="2" />
  <path className="i-a" d="M7 14h10v6H7Z" />
</>, p);
