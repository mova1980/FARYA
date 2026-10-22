import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * اتصال به سوپابیس
 * ---------------------------------------------------------------------------
 * دو متغیرِ محیطی لازم است (در فایل .env.local و در تنظیماتِ Vercel) :
 *   VITE_SUPABASE_URL      مانند  https://xxxxxxxx.supabase.co
 *   VITE_SUPABASE_ANON_KEY کلیدِ عمومی (anon)
 *
 * اگر این دو مقدار تنظیم نشده باشند، برنامه بدون خطا و به‌صورتِ محلی
 * (مرورگر) کار می‌کند؛ به محضِ تنظیم شدن، داده‌ها به پایگاه‌داده منتقل می‌شوند.
 */

const rawUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '';
const rawKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '';

export const SUPABASE_URL = rawUrl.trim();
export const SUPABASE_ANON_KEY = rawKey.trim();

/** آیا اتصال به سوپابیس پیکربندی شده است؟ */
export const isSupabaseConfigured: boolean =
  SUPABASE_URL.length > 0 &&
  SUPABASE_ANON_KEY.length > 0 &&
  /^https?:\/\/.+/i.test(SUPABASE_URL);

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        storageKey: 'farya.supabase.auth',
      },
      realtime: { params: { eventsPerSecond: 5 } },
      global: { headers: { 'x-application-name': 'farya-chef-console' } },
    });
  }
  return client;
}

/** نامِ نمایشیِ پروژه (برای نمایش در رابط) */
export function supabaseHostLabel(): string {
  if (!isSupabaseConfigured) return '';
  try {
    return new URL(SUPABASE_URL).host;
  } catch {
    return SUPABASE_URL;
  }
}
