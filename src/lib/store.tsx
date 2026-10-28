import React, { createContext, useContext, useEffect, useMemo, useReducer, useRef, useState, useCallback } from 'react';
import type { AppState, Ingredient, MenuItem, Overhead, Settings, PricePoint } from './types';
import { seedIngredients, seedItems, seedOverheads, seedSettings } from '../data/seed';
import { computeAll } from './calc';
import { todayJalaliStr } from './jalali';
import { uid } from './format';
import { isSupabaseConfigured } from './supabase';
import {
  mergeStates, normalizeState, remoteRead, remoteWrite, subscribeRemote,
  type SyncStatus,
} from './sync';

const STORAGE_KEY = 'farya.chef.state.v2';

const INITIAL: AppState = {
  ingredients: seedIngredients as Ingredient[],
  items: seedItems as MenuItem[],
  overheads: seedOverheads as Overhead[],
  settings: seedSettings as Settings,
  updatedAt: '',
};

export const UNITS = ['کیلو', 'گرم', 'لیتر', 'میلی‌لیتر', 'عدد', 'پرس', 'بسته', 'شاخه', 'قاشق'];
export const CATEGORIES = ['پیش‌غذا', 'سالاد', 'پیتزا', 'پوچوآ', 'پاستا', 'برگر', 'غذای اصلی', 'دسر', 'نوشیدنی', 'سس', 'نیمه‌ساخته'];

export const OVERHEAD_PRESETS: Array<{ name: string; kind: Overhead['kind']; note: string }> = [
  { name: 'اجاره ماهانه', kind: 'monthly', note: 'بر اساس تعداد پرس ماهانه تسهیم می‌شود' },
  { name: 'حقوق و دستمزد پرسنل', kind: 'monthly', note: '' },
  { name: 'آب، برق و گاز', kind: 'monthly', note: '' },
  { name: 'بیمه و مالیات', kind: 'monthly', note: '' },
  { name: 'مواد مصرفی و نظافت', kind: 'monthly', note: '' },
  { name: 'بسته‌بندی و ظروف', kind: 'per-portion', note: 'به‌ازای هر پرس' },
  { name: 'استهلاک تجهیزات', kind: 'monthly', note: '' },
  { name: 'تبلیغات و بازاریابی', kind: 'monthly', note: '' },
  { name: 'نگهداری و تعمیرات', kind: 'monthly', note: '' },
  { name: 'ضایعات و پرت مواد', kind: 'percent', note: 'درصدی از بهای مواد' },
  { name: 'کمیسیون پلتفرم‌های سفارش', kind: 'percent', note: 'درصدی از بهای مواد' },
];

type Action =
  | { type: 'replace'; state: AppState }
  | { type: 'reset' }
  | { type: 'settings'; patch: Partial<Settings> }
  // ingredients
  | { type: 'ing/add'; ing: Ingredient }
  | { type: 'ing/update'; id: string; patch: Partial<Ingredient> }
  | { type: 'ing/delete'; id: string }
  | { type: 'ing/addPrice'; id: string; point: PricePoint }
  | { type: 'ing/updatePrice'; id: string; priceId: string; patch: Partial<PricePoint> }
  | { type: 'ing/deletePrice'; id: string; priceId: string }
  // items
  | { type: 'item/add'; item: MenuItem }
  | { type: 'item/update'; id: string; patch: Partial<MenuItem> }
  | { type: 'item/delete'; id: string }
  | { type: 'item/duplicate'; id: string }
  // overheads
  | { type: 'ovh/add'; ovh: Overhead }
  | { type: 'ovh/update'; id: string; patch: Partial<Overhead> }
  | { type: 'ovh/delete'; id: string };

function reducer(state: AppState, action: Action): AppState {
  const touch = (s: AppState): AppState => ({ ...s, updatedAt: todayJalaliStr() });
  switch (action.type) {
    case 'replace':
      return action.state;
    case 'reset':
      return { ...INITIAL, updatedAt: todayJalaliStr() };
    case 'settings':
      return touch({ ...state, settings: { ...state.settings, ...action.patch } });

    case 'ing/add':
      return touch({ ...state, ingredients: [...state.ingredients, action.ing] });
    case 'ing/update':
      return touch({
        ...state,
        ingredients: state.ingredients.map((i) => (i.id === action.id ? { ...i, ...action.patch } : i)),
      });
    case 'ing/delete':
      return touch({
        ...state,
        ingredients: state.ingredients.filter((i) => i.id !== action.id),
        items: state.items.map((it) => ({
          ...it,
          recipe: it.recipe.filter((r) => r.ingredientId !== action.id),
        })),
      });
    case 'ing/addPrice':
      return touch({
        ...state,
        ingredients: state.ingredients.map((i) => (i.id === action.id
          ? { ...i, prices: [...i.prices, action.point].sort((a, b) => (a.date < b.date ? -1 : 1)) }
          : i)),
      });
    case 'ing/updatePrice':
      return touch({
        ...state,
        ingredients: state.ingredients.map((i) => (i.id === action.id
          ? {
            ...i,
            prices: i.prices.map((p) => (p.id === action.priceId ? { ...p, ...action.patch } : p))
              .sort((a, b) => (a.date < b.date ? -1 : 1)),
          }
          : i)),
      });
    case 'ing/deletePrice':
      return touch({
        ...state,
        ingredients: state.ingredients.map((i) => (i.id === action.id
          ? { ...i, prices: i.prices.filter((p) => p.id !== action.priceId) }
          : i)),
      });

    case 'item/add':
      return touch({ ...state, items: [...state.items, action.item] });
    case 'item/update':
      return touch({
        ...state,
        items: state.items.map((i) => (i.id === action.id ? { ...i, ...action.patch } : i)),
      });
    case 'item/delete':
      return touch({
        ...state,
        items: state.items.filter((i) => i.id !== action.id),
        ingredients: state.ingredients.map((ing) => (ing.subRecipeId === action.id
          ? { ...ing, subRecipeId: null } : ing)),
      });
    case 'item/duplicate': {
      const src = state.items.find((i) => i.id === action.id);
      if (!src) return state;
      const copy: MenuItem = {
        ...src,
        id: uid('item'),
        code: `${src.code}-copy`,
        name: `${src.name} (کپی)`,
        recipe: src.recipe.map((r) => ({ ...r })),
      };
      return touch({ ...state, items: [...state.items, copy] });
    }

    case 'ovh/add':
      return touch({ ...state, overheads: [...state.overheads, action.ovh] });
    case 'ovh/update':
      return touch({
        ...state,
        overheads: state.overheads.map((o) => (o.id === action.id ? { ...o, ...action.patch } : o)),
      });
    case 'ovh/delete':
      return touch({
        ...state,
        overheads: state.overheads.filter((o) => o.id !== action.id),
        items: state.items.map((i) => ({
          ...i,
          overheadIds: i.overheadIds.filter((x) => x !== action.id),
        })),
      });
    default:
      return state;
  }
}

function load(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...INITIAL, updatedAt: todayJalaliStr() };
    const parsed = JSON.parse(raw) as AppState;
    if (!parsed.items || !parsed.ingredients) return { ...INITIAL, updatedAt: todayJalaliStr() };
    return parsed;
  } catch {
    return { ...INITIAL, updatedAt: todayJalaliStr() };
  }
}

interface Ctx {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  engine: ReturnType<typeof computeAll>;
  toast: (msg: string, kind?: 'ok' | 'warn' | 'err') => void;
  toasts: Array<{ id: number; msg: string; kind: string }>;
  dismiss: (id: number) => void;
  exportJson: () => void;
  importJson: (file: File) => void;
  exportCsv: () => void;
  /* ---- همگام‌سازی با پایگاه‌دادهٔ سوپابیس ---- */
  cloudEnabled: boolean;
  syncStatus: SyncStatus;
  lastSyncAt: string | null;
  syncError: string | null;
  syncNow: () => Promise<void>;
}

const StoreCtx = createContext<Ctx | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, load);
  const [toasts, setToasts] = useState<Array<{ id: number; msg: string; kind: string }>>([]);
  const tid = useRef(1);

  /* ================= وضعیتِ همگام‌سازی ================= */
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(
    isSupabaseConfigured ? 'loading' : 'off');
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const baseRev = useRef<number | null>(null);
  const skipNextPush = useRef(false);
  const ready = useRef(false);
  const stateRef = useRef<AppState>(state);
  stateRef.current = state;

  const engine = useMemo(() => computeAll(state), [state]);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* ignore */ }
  }, [state]);

  const dismiss = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const toast = useCallback((msg: string, kind: 'ok' | 'warn' | 'err' = 'ok') => {
    const id = tid.current++;
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => dismiss(id), 3600);
  }, [dismiss]);

  const exportJson = useCallback(() => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `farya-backup-${todayJalaliStr().replace(/\//g, '-')}.json`;
    a.click();
    toast('فایل پشتیبان با موفقیت ساخته شد', 'ok');
  }, [state, toast]);

  const importJson = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as AppState;
        if (!parsed.items || !parsed.ingredients) throw new Error('bad');
        dispatch({ type: 'replace', state: { ...parsed, updatedAt: todayJalaliStr() } });
        toast('داده‌ها با موفقیت بازیابی شدند', 'ok');
      } catch {
        toast('فایل انتخابی معتبر نیست', 'err');
      }
    };
    reader.readAsText(file);
  }, [toast]);

  const exportCsv = useCallback(() => {
    const rows: string[][] = [[
      'کد', 'نام آیتم', 'دسته', 'بهای مواد', 'ضریب', 'سربار', 'هزینه ظرف',
      'بهای تمام شده', 'قیمت فعلی', 'قیمت پیشنهادی', 'سود', 'حاشیه سود', 'درصد بهای مواد',
    ]];
    state.items.forEach((it) => {
      const c = engine.byItem[it.id];
      if (!c) return;
      rows.push([
        it.code, it.name, it.category,
        String(Math.round(c.material)), String(c.coefValue), String(Math.round(c.overhead)),
        String(Math.round(c.container)), String(Math.round(c.total)),
        it.price ? String(Math.round(it.price)) : '',
        String(Math.round(c.suggested)),
        c.profit != null ? String(Math.round(c.profit)) : '',
        c.margin != null ? (c.margin * 100).toFixed(1) : '',
        c.foodCost != null ? (c.foodCost * 100).toFixed(1) : '',
      ]);
    });
    const csv = '﻿' + rows.map((r) => r.map((x) => `"${x.replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `farya-menu-cost-${todayJalaliStr().replace(/\//g, '-')}.csv`;
    a.click();
    toast('خروجی اکسل (CSV) آماده شد', 'ok');
  }, [state, engine, toast]);

  /* ======================================================================
   *  ارسالِ وضعیت به پایگاه‌داده (با حلِ تعارض)
   * ==================================================================== */
  const push = useCallback(async (reason: string) => {
    if (!isSupabaseConfigured) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setSyncStatus('offline');
      return;
    }
    setSyncStatus('saving');
    const res = await remoteWrite(stateRef.current, reason, baseRev.current);

    if (res.kind === 'saved') {
      baseRev.current = res.rev;
      setSyncStatus('synced');
      setSyncError(null);
      setLastSyncAt(new Date().toISOString());
      return;
    }

    if (res.kind === 'conflict') {
      // دو دستگاه همزمان ویرایش کرده‌اند → ادغامِ بدونِ از دست رفتنِ داده
      const merged = mergeStates(stateRef.current, res.remote.data);
      baseRev.current = res.remote.rev;
      skipNextPush.current = true;
      dispatch({ type: 'replace', state: { ...merged, updatedAt: todayJalaliStr() } });
      const retry = await remoteWrite(merged, reason + ' (ادغام)', res.remote.rev);
      if (retry.ok) {
        baseRev.current = retry.rev;
        setSyncStatus('synced');
        setSyncError(null);
        setLastSyncAt(new Date().toISOString());
      } else {
        setSyncStatus('error');
        setSyncError(retry.kind === 'error' ? retry.message : 'خطا در ادغام');
      }
      return;
    }

    if (res.kind === 'offline') { setSyncStatus('offline'); return; }
    setSyncStatus('error');
    setSyncError(res.message);
  }, []);

  /* ======================================================================
   *  بارگذاریِ اولیه + گوش دادن به تغییراتِ لحظه‌ایِ پایگاه‌داده
   * ==================================================================== */
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let alive = true;

    (async () => {
      setSyncStatus('loading');
      const r = await remoteRead();
      if (!alive) return;

      if (r.error) {
        setSyncStatus('error');
        setSyncError(r.error);
        ready.current = true;
        return;
      }

      if (r.row) {
        const st = normalizeState(r.row.data);
        if (st && (st.items.length > 0 || st.ingredients.length > 0)) {
          ready.current = true;
          baseRev.current = r.row.rev;
          skipNextPush.current = true;
          dispatch({ type: 'replace', state: st });
          setLastSyncAt(r.row.updated_at || new Date().toISOString());
          setSyncStatus('synced');
          return;
        }
      }

      // داده‌ای در پایگاه‌داده نیست → بارگذاریِ اولیهٔ داده‌های برنامه
      const res = await remoteWrite(stateRef.current, 'بارگذاریِ اولیه');
      ready.current = true;
      if (res.ok) {
        baseRev.current = res.rev;
        setSyncStatus('synced');
        setLastSyncAt(new Date().toISOString());
      } else {
        setSyncStatus('error');
        setSyncError(res.kind === 'error' ? res.message : 'خطا در ارسالِ اولیه');
      }
    })();

    const unsubscribe = subscribeRemote((row) => {
      const st = normalizeState(row.data);
      if (!st) return;
      if (baseRev.current !== null && row.rev <= baseRev.current) return; // تغییرِ خودمان
      baseRev.current = row.rev;
      skipNextPush.current = true;
      dispatch({ type: 'replace', state: st });
      setLastSyncAt(row.updated_at || new Date().toISOString());
      setSyncStatus('synced');
    });

    return () => { alive = false; unsubscribe(); };
  }, []);

  /* ======================================================================
   *  ارسالِ خودکارِ تغییرات (با تأخیرِ کوتاه برای جلوگیری از ارسالِ پشتِ سر هم)
   * ==================================================================== */
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    if (!ready.current) return;
    if (skipNextPush.current) { skipNextPush.current = false; return; }
    const t = setTimeout(() => { void push('ویرایش'); }, 1000);
    return () => clearTimeout(t);
  }, [state, push]);

  /* ----------- بازیابیِ خودکار بعد از وصل شدنِ دوبارهٔ اینترنت ----------- */
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const goOnline = () => { void push('بازیابیِ اتصال'); };
    const goOffline = () => setSyncStatus('offline');
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, [push]);

  /* ------------------- همگام‌سازیِ دستی (دکمه در رابط) ------------------- */
  const syncNow = useCallback(async () => {
    if (!isSupabaseConfigured) {
      toast('اتصال به پایگاه‌داده تنظیم نشده است', 'warn');
      return;
    }
    setSyncStatus('loading');
    const r = await remoteRead();
    if (r.error) {
      setSyncStatus('error');
      setSyncError(r.error);
      toast('خطا در دریافت از پایگاه‌داده', 'err');
      return;
    }
    if (r.row && (baseRev.current === null || r.row.rev > baseRev.current)) {
      const st = normalizeState(r.row.data);
      if (st) {
        const merged = mergeStates(stateRef.current, st);
        baseRev.current = r.row.rev;
        skipNextPush.current = true;
        dispatch({ type: 'replace', state: { ...merged, updatedAt: todayJalaliStr() } });
        toast('داده‌ها از پایگاه‌داده دریافت و ادغام شدند', 'ok');
      }
    }
    await push('همگام‌سازیِ دستی');
  }, [push, toast]);

  const value: Ctx = {
    state, dispatch, engine, toast, toasts, dismiss, exportJson, importJson, exportCsv,
    cloudEnabled: isSupabaseConfigured,
    syncStatus, lastSyncAt, syncError, syncNow,
  };
  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export function useStore(): Ctx {
  const ctx = useContext(StoreCtx);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider');
  return ctx;
}
