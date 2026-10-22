import { useStore } from '../lib/store';
import { isSupabaseConfigured } from '../lib/supabase';
import type { SyncStatus } from '../lib/sync';

/**
 * نشانگرِ وضعیتِ اتصال به پایگاه‌داده
 * ---------------------------------------------------------------------------
 * به سرآشپز نشان می‌دهد داده‌ها کجا ذخیره می‌شوند: پایگاه‌دادهٔ سوپابیس
 * یا (در صورت نبودِ اتصال) مرورگرِ محلی. با کلیک، همگام‌سازیِ دستی انجام می‌شود.
 */

const LABEL: Record<SyncStatus, string> = {
  off: 'ذخیره در مرورگر',
  loading: 'در حال اتصال…',
  saving: 'در حال ذخیره…',
  synced: 'ذخیره در پایگاه‌داده',
  offline: 'آفلاین · ذخیره محلی',
  conflict: 'ادغام شد',
  error: 'خطا در اتصال',
};

const SHORT: Record<SyncStatus, string> = {
  off: 'محلی',
  loading: 'در حال اتصال',
  saving: 'در حال ذخیره',
  synced: 'پایگاه‌داده',
  offline: 'آفلاین',
  conflict: 'ادغام شد',
  error: 'خطا',
};

export function CloudBadge({ compact = false }: { compact?: boolean }) {
  const { syncStatus, syncNow, lastSyncAt, syncError } = useStore();

  if (!isSupabaseConfigured) {
    return (
      <span
        className="cloud-badge is-off"
        title="برای اتصال به پایگاه‌داده، VITE_SUPABASE_URL و VITE_SUPABASE_ANON_KEY را تنظیم کنید"
      >
        <span className="cloud-dot" />
        {compact ? SHORT.off : LABEL.off}
      </span>
    );
  }

  const title = [
    syncError ? `خطا: ${syncError}` : '',
    lastSyncAt ? `آخرین همگام‌سازی: ${new Date(lastSyncAt).toLocaleString('fa-IR')}` : '',
    'برای همگام‌سازیِ دستی کلیک کنید',
  ]
    .filter(Boolean)
    .join('\n');

  return (
    <button
      type="button"
      className={`cloud-badge is-${syncStatus}`}
      onClick={() => void syncNow()}
      title={title}
      aria-label={`وضعیت پایگاه‌داده: ${LABEL[syncStatus]}`}
    >
      <span className="cloud-dot" />
      {compact ? SHORT[syncStatus] : LABEL[syncStatus]}
    </button>
  );
}

/** آیکونِ ابر — برای استفاده در بخشِ تنظیمات */
export function CloudIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7 18h10a4 4 0 0 0 .4-7.98A6 6 0 0 0 6.1 9.2A3.9 3.9 0 0 0 7 18Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

