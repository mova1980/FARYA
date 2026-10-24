import React from 'react';

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

/** Shared FARYA identity: use the exact oven/flame logo asset used on the public site. */
export function Logo({
  size = 'md', tone = 'dark', variant = 'full',
  animated = true, wordmark = true, sub = 'auto',
}: Props) {
  const px = typeof size === 'number' ? size : SIZES[size] ?? SIZES.md;
  const ink = tone === 'light' ? '#ffffff' : '#241c1c';
  const inkSoft = tone === 'light' ? 'rgba(255,255,255,.62)' : 'rgba(36,28,28,.58)';
  const showWords = wordmark && variant !== 'mark';

  return (
    <span className={`logo logo-${variant} logo-${tone}${animated ? ' logo-anim' : ''}`} style={{ ['--logo-h' as string]: `${px}px` }}>
      <span className="logo-mark-wrap">
        <img className="logo-mark logo-mark-image" src="/images/logo-farya.webp" width={px} height={px} alt="نشان فریا" />
      </span>
      {showWords && (
        <span className="logo-word" style={{ color: ink }}>
          <span className="logo-name" style={{ fontSize: Math.max(15, px * .46) }}>FARYA</span>
          {variant === 'stack' ? (
            <span className="logo-stack-fa" style={{ color: inkSoft, fontSize: px * .3 }}>فریا</span>
          ) : (
            <>
              <span className="logo-rule" />
              <span className="logo-fa" style={{ fontSize: Math.max(11, px * .33) }}>فریا</span>
            </>
          )}
          {sub === 'auto' && <span className="logo-sub" style={{ color: inkSoft }}>CHEF CONSOLE</span>}
          {sub && sub !== 'auto' && <span className="logo-sub" style={{ color: inkSoft }}>{sub}</span>}
        </span>
      )}
    </span>
  );
}

export default Logo;
