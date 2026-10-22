import React, { useId } from 'react';

/**
 * نشانِ فریا (FARYA)
 * -----------------------------------------------------------------------------
 * ایده: حرف F که خودش یک شاخهٔ سبز است — ساقهٔ عمودی و دو برگ که بازوهای حرف را
 * می‌سازند؛ استعاره‌ای از سرآشپزِ ورزشکار و وسواس او بر سلامت و تازگیِ مواد اولیه.
 *
 * افکت‌ها: هالهٔ نوریِ زنده، تابشِ نوری که از نشان می‌گذرد، تکانِ ملایمِ برگ‌ها،
 * و در هاور: بزرگ‌شدنِ لطیفِ کادر و تندتر شدنِ تابش.
 */

type Tone = 'dark' | 'light';
type Variant = 'full' | 'stack' | 'mark';

interface Props {
  size?: number | 'sm' | 'md' | 'lg';
  tone?: Tone;
  variant?: Variant;
  animated?: boolean;
  wordmark?: boolean;
  sub?: string | null;
}

const SIZES: Record<string, number> = { sm: 30, md: 38, lg: 52 };

export function Logo({
  size = 'md', tone = 'dark', variant = 'full',
  animated = true, wordmark = true, sub = 'auto',
}: Props) {
  const uid = useId().replace(/:/g, '');
  const px = typeof size === 'number' ? size : SIZES[size] ?? SIZES.md;
  const g = (n: string) => `${n}-${uid}`;

  const ink = tone === 'light' ? '#ffffff' : '#0E1510';
  const inkSoft = tone === 'light' ? 'rgba(255,255,255,.58)' : 'rgba(14,21,16,.55)';

  const mark = (
    <svg
      className={`logo-mark${animated ? ' anim' : ''}`}
      width={px} height={px} viewBox="0 0 64 64" fill="none"
      aria-hidden="true" focusable="false"
    >
      <defs>
        <linearGradient id={g('tile')} x1="6" y1="2" x2="58" y2="62" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={tone === 'light' ? '#4C9A70' : '#12301F'} />
          <stop offset=".52" stopColor={tone === 'light' ? '#2C6B4A' : '#0C1B12'} />
          <stop offset="1" stopColor={tone === 'light' ? '#173D29' : '#0A1510'} />
        </linearGradient>
        <linearGradient id={g('rim')} x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={tone === 'light' ? 'rgba(255,255,255,.55)' : 'rgba(255,255,255,.42)'} />
          <stop offset=".45" stopColor={tone === 'light' ? 'rgba(255,255,255,.14)' : 'rgba(255,255,255,.06)'} />
          <stop offset="1" stopColor={tone === 'light' ? 'rgba(157,224,113,.55)' : 'rgba(127,191,90,.30)'} />
        </linearGradient>
        <linearGradient id={g('sheen')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="rgba(255,255,255,0)" />
          <stop offset=".46" stopColor="rgba(255,255,255,.55)" />
          <stop offset=".54" stopColor="rgba(255,255,255,.55)" />
          <stop offset="1" stopColor="rgba(255,255,255,0)" />
        </linearGradient>
        <linearGradient id={g('leaf')} x1="26" y1="12" x2="52" y2="42" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#EAF7DC" />
          <stop offset=".55" stopColor="#C9E9A8" />
          <stop offset="1" stopColor="#8FD066" />
        </linearGradient>
        <clipPath id={g('clip')}>
          <rect x="0" y="0" width="64" height="64" rx="18" />
        </clipPath>
      </defs>

      {/* کادرِ نشان */}
      <rect x="0" y="0" width="64" height="64" rx="18" fill={`url(#${g('tile')})`} />
      {/* لبهٔ شیشه‌ای */}
      <rect x=".9" y=".9" width="62.2" height="62.2" rx="17.1" stroke={`url(#${g('rim')})`} strokeWidth="1.8" />
      {/* درخششِ بالای کادر */}
      <path
        d="M0 20C14 4 40 1 64 8L64 0L0 0Z" fill="rgba(255,255,255,.10)" clipPath={`url(#${g('clip')})`}
      />

      <g clipPath={`url(#${g('clip')})`}>
        {/* تابشِ نوری که از نشان می‌گذرد */}
        <g className="logo-sweep">
          <rect x="-30" y="-14" width="26" height="92" fill={`url(#${g('sheen')})`} transform="rotate(18 32 32)" opacity=".5" />
        </g>
      </g>

      {/* ساقهٔ F */}
      <rect className="logo-stem" x="21.6" y="14" width="5.6" height="35" rx="2.8" fill={tone === 'light' ? '#EAF7DC' : '#F2FAE7'} />
      {/* جوانهٔ نوکِ ساقه */}
      <circle className="logo-bud" cx="24.4" cy="11.4" r="2.6" fill="#9BD96F" />

      {/* برگِ بالا */}
      <path
        className="logo-leaf logo-leaf-a"
        d="M25.6 21.2C31.6 12.6 45.4 11.6 52.6 19.4C45.2 27.6 31.4 29 25.6 21.2Z"
        fill={`url(#${g('leaf')})`}
      />
      {/* برگِ پایین */}
      <path
        className="logo-leaf logo-leaf-b"
        d="M25.6 36.2C30.4 29.6 41.6 29.2 46.6 35.6C41.4 42.4 30.6 42.8 25.6 36.2Z"
        fill={`url(#${g('leaf')})`}
        opacity=".9"
      />
      {/* رگبرگ‌ها */}
      <path className="logo-vein" d="M27.4 21.4C34.6 19.6 44.4 19.2 51 19.9" stroke="rgba(12,30,18,.28)" strokeWidth="1.1" strokeLinecap="round" />
      <path className="logo-vein" d="M27.4 36.4C33.4 35.4 40.6 35.4 45.4 35.9" stroke="rgba(12,30,18,.22)" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );

  const words = (
    <span className="logo-word" style={{ color: ink }}>
      <span className="logo-name" style={{ fontSize: Math.max(15, px * 0.46) }}>FARYA</span>
      {variant === 'stack' ? (
        <span className="logo-stack-fa" style={{ color: inkSoft, fontSize: px * 0.3 }}>فریا</span>
      ) : (
        <>
          <span className="logo-rule" />
          <span className="logo-fa" style={{ fontSize: Math.max(11, px * 0.33) }}>فریا</span>
        </>
      )}
      {sub === 'auto' && variant !== 'mark' && (
        <span className="logo-sub" style={{ color: inkSoft }}>
          {variant === 'stack' ? 'CHEF CONSOLE' : 'CHEF CONSOLE'}
        </span>
      )}
      {sub && sub !== 'auto' && <span className="logo-sub" style={{ color: inkSoft }}>{sub}</span>}
    </span>
  );

  return (
    <span
      className={`logo logo-${variant} logo-${tone}${animated ? ' logo-anim' : ''}`}
      style={{ ['--logo-h' as string]: `${px}px` }}
    >
      <span className="logo-mark-wrap">{mark}</span>
      {wordmark && variant !== 'mark' && words}
    </span>
  );
}

export default Logo;
