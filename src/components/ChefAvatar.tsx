import React, { useId } from 'react';

/**
 * آواتارِ سرآشپز — «فرناز»
 * یک تصویرِ خطیِ مینیمال از سرآشپزِ زنِ خندان با کلاهِ آشپزی،
 * کاملاً وکتور و بدون وابستگی به تصویرِ خارجی.
 */
export function ChefAvatar({ size = 38, className = '' }: { size?: number; className?: string }) {
  const uid = useId().replace(/:/g, '');
  const g = (n: string) => `${n}-${uid}`;

  return (
    <svg
      className={`chef-avatar ${className}`}
      width={size} height={size} viewBox="0 0 48 48"
      role="img" aria-label="سرآشپز فرناز"
    >
      <defs>
        <linearGradient id={g('bg')} x1="8" y1="4" x2="40" y2="44" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#EAF6E0" />
          <stop offset=".55" stopColor="#CFE9BC" />
          <stop offset="1" stopColor="#A9D98A" />
        </linearGradient>
        <linearGradient id={g('puff')} x1="14" y1="2" x2="34" y2="16" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#EDF3E7" />
        </linearGradient>
        <linearGradient id={g('skin')} x1="16" y1="16" x2="32" y2="34" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FBDCBE" />
          <stop offset="1" stopColor="#F0BE97" />
        </linearGradient>
        <clipPath id={g('clip')}><circle cx="24" cy="24" r="24" /></clipPath>
      </defs>

      <g clipPath={`url(#${g('clip')})`}>
        {/* پس‌زمینه */}
        <circle cx="24" cy="24" r="24" fill={`url(#${g('bg')})`} />

        {/* کتِ آشپزی */}
        <path d="M6.5 48c1.6-8.4 8.6-12.6 17.5-12.6S39.9 39.6 41.5 48Z" fill="#FCFDFA" />
        <path d="M24 35.4v12.6" stroke="#E4EADC" strokeWidth="1.1" />
        <path d="M19.5 36.2 24 41.4l4.5-5.2" fill="none" stroke="#E4EADC" strokeWidth="1.1" strokeLinecap="round" />

        {/* گردن */}
        <path d="M21 30.5h6v5h-6z" fill="#EFBB93" />

        {/* گوش‌ها */}
        <circle cx="15.8" cy="24.6" r="1.7" fill="#F0BE97" />
        <circle cx="32.2" cy="24.6" r="1.7" fill="#F0BE97" />

        {/* صورت */}
        <ellipse cx="24" cy="23.2" rx="8.3" ry="9" fill={`url(#${g('skin')})`} />

        {/* مویِ پشتِ سر (کوچک) */}
        <path d="M15.8 22.5c-.6-6.4 3.4-10.4 8.2-10.4s8.8 4 8.2 10.4c-.3 1.6-1.4 1.3-1.7-.2-.5-3.4-3.2-5.6-6.5-5.6s-6 2.2-6.5 5.6c-.3 1.5-1.4 1.8-1.7.2Z"
          fill="#4A3226" />

        {/* کلاهِ آشپزی */}
        <g className="chef-hat">
          <circle cx="18.4" cy="9.4" r="5.1" fill={`url(#${g('puff')})`} />
          <circle cx="29.6" cy="9.4" r="5.1" fill={`url(#${g('puff')})`} />
          <circle cx="24" cy="6.6" r="5.9" fill={`url(#${g('puff')})`} />
          <rect x="17" y="9" width="14" height="6" fill={`url(#${g('puff')})`} />
          <rect x="15.2" y="13.6" width="17.6" height="5" rx="1.8" fill="#FFFFFF" />
          <path d="M15.6 16.9h16.8" stroke="#E7EDE1" strokeWidth="1" strokeLinecap="round" />
        </g>

        {/* چشم‌ها */}
        <circle cx="20.7" cy="23.4" r="1.25" fill="#3E2A20" />
        <circle cx="27.3" cy="23.4" r="1.25" fill="#3E2A20" />

        {/* ابروها */}
        <path d="M18.8 20.2c.9-.7 2.2-.7 3.1 0M26.1 20.2c.9-.7 2.2-.7 3.1 0"
          stroke="#4A3226" strokeWidth="1.05" strokeLinecap="round" fill="none" />

        {/* گونه‌ها */}
        <circle cx="18.3" cy="26.3" r="1.9" fill="#EE9C92" opacity=".32" />
        <circle cx="29.7" cy="26.3" r="1.9" fill="#EE9C92" opacity=".32" />

        {/* لبخند */}
        <path className="chef-smile" d="M20.9 27.6c1.4 1.9 4.8 1.9 6.2 0"
          stroke="#B8574A" strokeWidth="1.5" strokeLinecap="round" fill="none" />
      </g>

      {/* حلقهٔ دور */}
      <circle cx="24" cy="24" r="23.2" fill="none" stroke="rgba(255,255,255,.28)" strokeWidth="1.6" />
    </svg>
  );
}

export default ChefAvatar;
