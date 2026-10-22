import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

export interface Media {
  w: number;
  h: number;
  /** موبایل: نوارِ پایین + منوی کشویی */
  mobile: boolean;
  /** خیلی کوچک (گوشی‌های باریک) */
  compact: boolean;
  /** تبلت / لپ‌تاپِ کوچک: نوارِ کناریِ باریک */
  tablet: boolean;
  /** دسکتاپِ کامل */
  desktop: boolean;
  touch: boolean;
}

const Ctx = createContext<Media>({ w: 1440, h: 900, mobile: false, compact: false, tablet: false, desktop: true, touch: false });

export function MediaProvider({ children }: { children: React.ReactNode }) {
  const [size, setSize] = useState(() => ({
    w: typeof window === 'undefined' ? 1440 : window.innerWidth,
    h: typeof window === 'undefined' ? 900 : window.innerHeight,
  }));

  useEffect(() => {
    let raf = 0;
    const on = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setSize({ w: window.innerWidth, h: window.innerHeight }));
    };
    window.addEventListener('resize', on);
    window.addEventListener('orientationchange', on);
    on();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', on);
      window.removeEventListener('orientationchange', on);
    };
  }, []);

  const value = useMemo<Media>(() => {
    const { w, h } = size;
    return {
      w, h,
      mobile: w < 900,
      compact: w < 560,
      tablet: w >= 900 && w < 1200,
      desktop: w >= 1200,
      touch: typeof window !== 'undefined'
        && (('ontouchstart' in window) || (navigator.maxTouchPoints || 0) > 0),
    };
  }, [size]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useMedia = () => useContext(Ctx);
export default useMedia;
