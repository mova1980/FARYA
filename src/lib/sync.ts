import { getSupabase, isSupabaseConfigured } from './supabase';
import type { AppState, Ingredient, MenuItem, Overhead } from './types';

/* ==========================================================================
 *  همگام‌سازیِ وضعیتِ برنامه با پایگاه‌دادهٔ سوپابیس
 * --------------------------------------------------------------------------
 *  مدل : یک ردیفِ واحد (app_state.id = 1) که وضعیتِ کامل را نگه می‌دارد و
 *  رویهٔ save_state آن را به جدول‌های رابطه‌ای تجزیه می‌کند.
 *
 *  سیاستِ حلِ تعارض (دو تب/دو دستگاه به‌طور همزمان) :
 *    • موجودیت‌ها با هم ادغام می‌شوند (union بر اساسِ شناسه) → چیزی حذف نمی‌شود
 *    • در صورتِ تفاوتِ مقدارهایِ اسکالر، نسخهٔ محلی (صفحهٔ فعلیِ سرآشپز) برنده است
 *    • بعد از ادغام، نتیجه بلافاصله به سرور بازگردانده می‌شود
 * ========================================================================== */

export type SyncStatus =
  | 'off'        // سوپابیس پیکربندی نشده
  | 'loading'    // در حالِ دریافت
  | 'saving'     // در حالِ ارسال
  | 'synced'     // همگام
  | 'offline'    // اتصالِ اینترنت قطع است (تغییرات در صف می‌مانند)
  | 'conflict'   // تعارض حل شد و ادغام شد
  | 'error';     // خطا

export interface RemoteRow {
  data: AppState;
  rev: number;
  updated_at: string;
}

const STATE_ID = 1;

/* ------------------------------------------------------------------ خواندن */
export async function remoteRead(): Promise<{ row: RemoteRow | null; error?: string }> {
  const sb = getSupabase();
  if (!sb) return { row: null, error: 'not-configured' };

  const { data, error } = await sb
    .from('app_state')
    .select('data, rev, updated_at')
    .eq('id', STATE_ID)
    .maybeSingle();

  if (error) return { row: null, error: error.message };
  if (!data) return { row: null };

  return {
    row: {
      data: data.data as AppState,
      rev: Number(data.rev) || 0,
      updated_at: String(data.updated_at ?? ''),
    },
  };
}

/* ------------------------------------------------------------------ نوشتن */
export type PushResult =
  | { ok: true;  kind: 'saved';    rev: number }
  | { ok: false; kind: 'conflict'; remote: RemoteRow }
  | { ok: false; kind: 'offline' }
  | { ok: false; kind: 'error';    message: string };

export async function remoteWrite(
  state: AppState,
  reason = 'edit',
  baseRev: number | null = null,
): Promise<PushResult> {
  const sb = getSupabase();
  if (!sb) return { ok: false, kind: 'error', message: 'not-configured' };

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { ok: false, kind: 'offline' };
  }

  // اگر نسخهٔ پایه داریم و سرور جلوتر رفته، اول تعارض را حل کن
  if (baseRev !== null) {
    const cur = await remoteRead();
    if (cur.error) return { ok: false, kind: 'error', message: cur.error };
    if (cur.row && cur.row.rev > baseRev) {
      return { ok: false, kind: 'conflict', remote: cur.row };
    }
  }

  const { data, error } = await sb.rpc('save_state', {
    p_state: state as unknown as Record<string, unknown>,
    p_reason: reason,
  });

  if (error) {
    const offline =
      typeof navigator !== 'undefined' && navigator.onLine === false;
    return offline
      ? { ok: false, kind: 'offline' }
      : { ok: false, kind: 'error', message: error.message };
  }

  return { ok: true, kind: 'saved', rev: Number(data) || 0 };
}

/* ------------------------------------------------------- گوش‌دادنِ لحظه‌ای */
export function subscribeRemote(onChange: (row: RemoteRow) => void): () => void {
  const sb = getSupabase();
  if (!sb) return () => {};

  const channel = sb
    .channel('farya-state')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'app_state' },
      () => {
        void remoteRead().then((r) => {
          if (r.row) onChange(r.row);
        });
      },
    )
    .subscribe();

  return () => {
    void sb.removeChannel(channel);
  };
}

/* ==========================================================================
 *  ادغامِ دو وضعیت — هیچ داده‌ای از دست نمی‌رود
 * ========================================================================== */

function unionBy<T>(a: T[], b: T[], key: (x: T) => string, pick: (l: T, r: T) => T): T[] {
  const out: T[] = [];
  const seen = new Map<string, number>(); // key -> index in out
  for (const x of a) {
    const k = key(x);
    if (seen.has(k)) continue;
    seen.set(k, out.length);
    out.push(x);
  }
  for (const x of b) {
    const k = key(x);
    const idx = seen.get(k);
    if (idx === undefined) {
      seen.set(k, out.length);
      out.push(x);
    } else {
      out[idx] = pick(out[idx], x);
    }
  }
  return out;
}

function unionPrices(local: Ingredient['prices'], remote: Ingredient['prices']) {
  return unionBy(
    local ?? [],
    remote ?? [],
    (p) => `${p.date}|${p.price}`,
    (l) => l, // نسخهٔ محلی برنده است
  );
}

function mergeIngredients(local: Ingredient[], remote: Ingredient[]): Ingredient[] {
  return unionBy(
    local,
    remote,
    (i) => i.id,
    (l, r) => ({ ...l, prices: unionPrices(l.prices, r.prices) }),
  );
}

function mergeItems(local: MenuItem[], remote: MenuItem[]): MenuItem[] {
  return unionBy(
    local,
    remote,
    (i) => i.id,
    (l, r) => ({
      ...l,
      // ردیف‌های دستورِ پخت ادغام می‌شوند؛ مقدارِ محلی برایِ هر ماده برنده است
      recipe: unionBy(l.recipe ?? [], r.recipe ?? [], (s) => s.ingredientId, (a) => a),
      // فهرستِ سربارها اجتماع گرفته می‌شود
      overheadIds: Array.from(new Set([...(l.overheadIds ?? []), ...(r.overheadIds ?? [])])),
    }),
  );
}

function mergeOverheads(local: Overhead[], remote: Overhead[]): Overhead[] {
  return unionBy(local, remote, (o) => o.id, (l) => l);
}

/** ادغامِ وضعیتِ محلی و راه‌دور (نسخهٔ محلی برای مقدارهای اسکالر برنده است) */
export function mergeStates(local: AppState, remote: AppState): AppState {
  return {
    ...local,
    settings: { ...remote.settings, ...local.settings },
    ingredients: mergeIngredients(local.ingredients ?? [], remote.ingredients ?? []),
    items: mergeItems(local.items ?? [], remote.items ?? []),
    overheads: mergeOverheads(local.overheads ?? [], remote.overheads ?? []),
    updatedAt: local.updatedAt ?? remote.updatedAt,
  };
}

/* ------------------------------------------------------------- پاک‌سازی */
/** اطمینان از اینکه ساختارِ دریافتی از سرور برای برنامه قابلِ استفاده است */
export function normalizeState(raw: unknown): AppState | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Partial<AppState>;
  if (!Array.isArray(s.items) || !Array.isArray(s.ingredients)) return null;
  return {
    settings: s.settings ?? ({} as AppState['settings']),
    ingredients: (s.ingredients ?? []).map((i) => ({
      ...i,
      prices: Array.isArray(i.prices) ? i.prices : [],
    })),
    items: (s.items ?? []).map((i) => ({
      ...i,
      recipe: Array.isArray(i.recipe) ? i.recipe : [],
      overheadIds: Array.isArray(i.overheadIds) ? i.overheadIds : [],
    })),
    overheads: s.overheads ?? [],
    updatedAt: s.updatedAt ?? '',
  };
}

export { isSupabaseConfigured };
