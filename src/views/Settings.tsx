import React, { useRef, useState } from 'react';
import { useStore } from '../lib/store';
import { isPreparationCategory } from '../lib/types';
import { Button, Field, Modal, MoneyInput } from '../components/ui';
import { faDigits, num } from '../lib/format';
import { jalaliLong, todayJalaliStr } from '../lib/jalali';
import { SEED_SOURCE } from '../data/seed';
import { Logo } from '../components/Logo';
import { IconDownload, IconUpload, IconRefresh, IconCheck, IconHeart, IconAlert, IconLayers } from '../components/Icons';
import { CloudBadge } from '../components/CloudBadge';
import { isSupabaseConfigured, supabaseHostLabel, SUPABASE_URL } from '../lib/supabase';

export default function Settings() {
  const { state, dispatch, toast, exportJson, importJson, exportCsv,
    syncNow, lastSyncAt, syncError, syncStatus } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const s = state.settings;
  const set = (patch: Partial<typeof s>) => dispatch({ type: 'settings', patch });

  // سلامت داده: ماده‌ای که برای یک تاریخ، دو قیمت متفاوت ثبت شده باشد
  const usage = React.useMemo(() => {
    const m: Record<string, number> = {};
    state.items.forEach((it) => it.recipe.forEach((r) => { m[r.ingredientId] = (m[r.ingredientId] || 0) + 1; }));
    return m;
  }, [state.items]);
  const conflicts = React.useMemo(() => state.ingredients.map((ing) => {
    const byDate: Record<string, typeof ing.prices> = {};
    ing.prices.forEach((p) => { (byDate[p.date] ||= []).push(p); });
    const groups = Object.values(byDate).filter((g) => new Set(g.map((x) => x.price)).size > 1);
    return groups.length ? { ing, groups } : null;
  }).filter(Boolean) as { ing: typeof state.ingredients[number]; groups: typeof state.ingredients[number]['prices'][] }[], [state.ingredients]);

  return (
    <div className="view">
      <div className="grid g-1-2" style={{ marginBottom: 16 }}>
        <div className="card card-pad">
          <div style={{ marginBottom: 14 }}>
            <Logo size={54} tone="dark" variant="stack" />
          </div>
          <p style={{ fontSize: 12.5, color: 'var(--txt-2)', lineHeight: 1.9 }}>
            فریا — آشپزخانه‌ای که سلامتِ مواد اولیه را با دقتِ عددی ترکیب می‌کند.
            این سامانه برای سرآشپز ساخته شده تا بهای تمام‌شدهٔ هر پرس را
            از مواد خام تا سربار و ضریب، شفاف و لحظه‌ای محاسبه کند.
          </p>
          <div className="divider" style={{ margin: '14px 0' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Field label="نام رستوران (لاتین)">
              <input className="input" value={s.restaurant}
                onChange={(e) => set({ restaurant: e.target.value })} />
            </Field>
            <Field label="نام رستوران (فارسی)">
              <input className="input" value={s.restaurantFa}
                onChange={(e) => set({ restaurantFa: e.target.value })} />
            </Field>
            <Field label="تلفن رستوران · چاپ روی فیش">
              <input className="input" inputMode="tel" value={s.restaurantPhone || ''}
                onChange={(e) => set({ restaurantPhone: e.target.value })} />
            </Field>
            <Field label="نشانی شعبه · چاپ روی فیش">
              <input className="input" value={s.restaurantAddress || ''}
                onChange={(e) => set({ restaurantAddress: e.target.value })} />
            </Field>
            <Field label="شناسهٔ مالیاتی · فقط مقدار تأییدشده">
              <input className="input" value={s.taxpayerId || ''}
                onChange={(e) => set({ taxpayerId: e.target.value })} />
            </Field>
            <Field label="کد اقتصادی · فقط مقدار تأییدشده">
              <input className="input" value={s.economicCode || ''}
                onChange={(e) => set({ economicCode: e.target.value })} />
            </Field>
            <div className="hint">این مشخصات اختیاری‌اند؛ فقط اطلاعات رسمیِ تأییدشده را وارد کنید. ثبت آن‌ها، اتصال به سامانهٔ مؤدیان ایجاد نمی‌کند.</div>
            <Field label="نام سرآشپز">
              <input className="input" value={s.chef}
                onChange={(e) => set({ chef: e.target.value })} />
            </Field>
          </div>
        </div>

        <div className="grid" style={{ gap: 16 }}>
          <div className="card card-pad">
            <h3 style={{ fontSize: 14, marginBottom: 12 }}>پارامترهای محاسبه</h3>
            <div className="form-grid">
              <Field label="حاشیهٔ سودِ هدف (درصد)" hint="برای محاسبهٔ قیمت پیشنهادی">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input type="range" min={5} max={80} step={1}
                    value={Math.round(s.targetMargin * 100)}
                    onChange={(e) => set({ targetMargin: Number(e.target.value) / 100 })}
                    style={{ flex: 1, accentColor: '#2f6b4c' }} />
                  <span style={{ width: 52, fontWeight: 700 }} className="num">
                    {faDigits(Math.round(s.targetMargin * 100))}٪
                  </span>
                </div>
              </Field>
              <Field label="تعداد پرس در ماه" hint="مبنای تسهیمِ هزینه‌های ماهانه">
                <MoneyInput value={s.monthlyPortions}
                  onChange={(v) => set({ monthlyPortions: v ?? 1 })} />
              </Field>
              <Field label="ضریب اضافیِ سربار (درصد)"
                hint="روی کلِ سربار تخصیصی اعمال می‌شود و وارد بهای تمام‌شده می‌گردد">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input type="range" min={0} max={100} step={1}
                    value={Math.round(s.overheadExtraCoef * 100)}
                    onChange={(e) => set({ overheadExtraCoef: Number(e.target.value) / 100 })}
                    style={{ flex: 1, accentColor: '#c4763a' }} />
                  <span style={{ width: 52, fontWeight: 700, color: 'var(--clay)' }} className="num">
                    {faDigits(Math.round(s.overheadExtraCoef * 100))}٪
                  </span>
                </div>
              </Field>
              <Field label="واحد پول">
                <input className="input" value={s.currency}
                  onChange={(e) => set({ currency: e.target.value })} />
              </Field>
            </div>
          </div>

          <div className="card card-pad">
            <h3 style={{ fontSize: 14, marginBottom: 12 }}>داده‌ها و پشتیبان</h3>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Button variant="primary" onClick={exportJson}><IconDownload size={15} /> پشتیبان (JSON)</Button>
              <Button onClick={() => fileRef.current?.click()}><IconUpload size={15} /> بازیابی</Button>
              <Button onClick={exportCsv}><IconDownload size={15} /> خروجی اکسل (CSV)</Button>
              <Button variant="danger" onClick={() => setConfirmReset(true)}>
                <IconRefresh size={15} /> بازگشت به داده‌های اولیه
              </Button>
              <input ref={fileRef} type="file" accept="application/json" hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) importJson(f);
                  e.target.value = '';
                }} />
            </div>
            <div className="divider" style={{ margin: '14px 0' }} />
            <div className="grid g3" style={{ gap: 10 }}>
              {[
                { l: 'پیتزاهای فروش', v: state.items.filter((i) => i.category === 'پیتزا' && i.active).length },
                { l: 'دستورهای نیمه‌ساخته', v: state.items.filter((i) => isPreparationCategory(i.category)).length },
                { l: 'مواد اولیه', v: state.ingredients.length },
                { l: 'آیتم‌های سربار', v: state.overheads.length },
                { l: 'ردیف‌های دستور پخت', v: state.items.reduce((a, i) => a + i.recipe.length, 0) },
                { l: 'آخرین تغییرات', v: state.updatedAt || '—' },
              ].map((x) => (
                <div key={x.l} className="cb">
                  <div className="l">{x.l}</div>
                  <div className="v">{typeof x.v === 'number' ? faDigits(x.v.toLocaleString('en-US')) : faDigits(x.v)}</div>
                </div>
              ))}
            </div>
          </div>

          {/* ------------------------------------------- پایگاه‌داده ---- */}
          <div className="card card-pad">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <span style={{ color: 'var(--accent)', display: 'flex' }}><IconLayers size={17} /></span>
              <h3 style={{ fontSize: 14 }}>پایگاه‌داده</h3>
              <div style={{ marginInlineStart: 'auto' }}><CloudBadge /></div>
            </div>

            <div className="grid g3" style={{ gap: 10, marginBottom: 14 }}>
              <div className="cb">
                <div className="l">وضعیتِ اتصال</div>
                <div className="v" style={{ fontSize: 13 }}>
                  {isSupabaseConfigured ? 'متصل به سوپابیس' : 'ذخیره‌سازی محلی (مرورگر)'}
                </div>
              </div>
              <div className="cb">
                <div className="l">نشانیِ پروژه</div>
                <div className="v" style={{ fontSize: 12, direction: 'ltr', textAlign: 'right' }}>
                  {isSupabaseConfigured ? supabaseHostLabel() : '—'}
                </div>
              </div>
              <div className="cb">
                <div className="l">آخرین همگام‌سازی</div>
                <div className="v" style={{ fontSize: 13 }}>
                  {lastSyncAt
                    ? faDigits(new Date(lastSyncAt).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }))
                    : '—'}
                </div>
              </div>
            </div>

            {syncError && (
              <div className="notice err" style={{ marginBottom: 12 }}>
                <IconAlert size={15} />
                <span>{syncError}</span>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Button variant="primary" onClick={() => void syncNow()} disabled={!isSupabaseConfigured}>
                <IconRefresh size={15} /> همگام‌سازیِ اکنون
              </Button>
            </div>

            {!isSupabaseConfigured && (
              <p style={{ fontSize: 11.5, lineHeight: 1.9, color: 'var(--muted)', marginTop: 12 }}>
                برای اتصالِ دائمیِ داده‌ها، فایل <code dir="ltr">.env.local</code> را در ریشهٔ پروژه
                بسازید و دو مقدارِ <code dir="ltr">VITE_SUPABASE_URL</code> و{' '}
                <code dir="ltr">VITE_SUPABASE_PUBLISHABLE_KEY</code> را وارد کنید؛ سپس اسکریپت‌های
                پوشهٔ <code dir="ltr">supabase/</code> را به ترتیب اجرا کنید.
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <span className="k-ico" style={{
            width: 34, height: 34, borderRadius: 11, display: 'grid', placeItems: 'center',
            background: conflicts.length ? 'var(--amber-bg)' : 'var(--green-bg)',
            color: conflicts.length ? 'var(--amber)' : 'var(--green)',
          }}><IconAlert size={16} /></span>
          <div>
            <h3 style={{ fontSize: 14 }}>سلامت داده‌ها</h3>
            <p style={{ fontSize: 11.5, color: 'var(--txt-3)', marginTop: 2 }}>
              بررسیِ یکتاییِ قیمت‌ها و تضادهای به‌جامانده از فایلِ منبع
            </p>
          </div>
        </div>
        {conflicts.length === 0 ? (
          <div style={{
            marginTop: 12, padding: '14px 16px', borderRadius: 14, background: 'var(--green-bg)',
            border: '1px solid rgba(38,115,77,.16)', fontSize: 12.5, color: 'var(--txt-2)',
          }}>
            هیچ تضادی در قیمت‌ها یافت نشد. هر مادهٔ اولیه برای هر تاریخ دقیقاً یک قیمت دارد و
            محاسباتِ بهای تمام‌شده بر پایهٔ جدیدترین قیمتِ ثبت‌شده انجام می‌شود.
          </div>
        ) : (
          <>
            <p style={{ fontSize: 12, color: 'var(--txt-2)', lineHeight: 1.9, marginTop: 10 }}>
              در فایلِ منبع برای {faDigits(conflicts.length)} ماده، در یک تاریخ دو قیمتِ متفاوت ثبت شده است.
              برنامه از <b>آخرین ردیف</b> به‌عنوان قیمتِ جاری استفاده می‌کند. برای یکسان‌سازی،
              ردیفی را که معتبر نیست حذف کنید:
            </p>
            {conflicts.map(({ ing, groups }) => groups.map((g) => (
              <div key={ing.id + g[0].date} style={{
                marginTop: 12, padding: '12px 14px', borderRadius: 14,
                background: 'var(--amber-bg)', border: '1px solid rgba(176,124,28,.18)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                  <b style={{ fontSize: 13 }}>{ing.name}</b>
                  <span className="hint">{ing.unit} · تاریخ {faDigits(g[0].date)} · {faDigits(usage[ing.id] || 0)} بار مصرف در دستورها</span>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {g.map((p, i) => (
                    <div key={p.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '7px 8px 7px 12px',
                      borderRadius: 11, background: 'var(--surface)', border: '1px solid var(--line-2)',
                    }}>
                      <span className="num" style={{ fontSize: 13.5, fontWeight: 700 }}>
                        {faDigits(num(Math.round(p.price)))}
                      </span>
                      <span style={{ fontSize: 10.5, color: i === g.length - 1 ? 'var(--green)' : 'var(--txt-3)' }}>
                        {i === g.length - 1 ? 'قیمتِ جاری' : 'قدیمی‌تر'}
                      </span>
                      <button className="btn ghost sm" style={{ padding: '3px 8px', fontSize: 11 }}
                        onClick={() => {
                          dispatch({ type: 'ing/deletePrice', id: ing.id, priceId: p.id });
                          toast(`ردیفِ ${faDigits(num(Math.round(p.price)))} تومان از «${ing.name}» حذف شد`);
                        }}>
                        حذف این ردیف
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )))}
          </>
        )}
      </div>

      <div className="card card-pad" style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
        <div className="k-ico clay" style={{
          width: 42, height: 42, flexBasis: 42, borderRadius: 13, display: 'grid', placeItems: 'center',
          background: 'var(--leaf-100)', color: 'var(--moss-600)',
        }}>
          <IconHeart size={20} />
        </div>
        <div>
          <b style={{ fontSize: 13.5 }}>داده‌های مبنا: {SEED_SOURCE}</b>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>
            همهٔ {faDigits(329)} ردیفِ فایل اکسلِ منو بدون حذف به این سامانه منتقل شده‌اند ·
            امروز {faDigits(jalaliLong(todayJalaliStr()))}
          </div>
        </div>
      </div>

      <Modal
        open={confirmReset} onClose={() => setConfirmReset(false)}
        title="بازگشت به داده‌های اولیه"
        sub="همهٔ تغییرات شما حذف می‌شود"
        footer={<>
          <Button variant="danger" onClick={() => {
            dispatch({ type: 'reset' });
            toast('داده‌ها به حالت اولیه بازگشتند', 'warn');
            setConfirmReset(false);
          }}><IconCheck size={15} /> تأیید بازنشانی</Button>
          <Button variant="ghost" onClick={() => setConfirmReset(false)}>انصراف</Button>
        </>}
      >
        <p style={{ fontSize: 13, color: 'var(--txt-2)' }}>
          پیشنهاد می‌شود پیش از بازنشانی، یک فایل پشتیبان (JSON) تهیه کنید.
        </p>
      </Modal>
    </div>
  );
}
