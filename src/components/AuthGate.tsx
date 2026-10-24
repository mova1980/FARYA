import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Logo } from './Logo';
import { getSupabase, isSupabaseConfigured } from '../lib/supabase';

type AuthValue = { email: string | null; signOut: () => Promise<void> };
const AuthContext = createContext<AuthValue>({ email: null, signOut: async () => {} });
export const useAuth = () => useContext(AuthContext);

function friendlyError(message: string) {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return 'ایمیل یا گذرواژه درست نیست.';
  if (m.includes('email not confirmed')) return 'ایمیلِ حساب هنوز تأیید نشده است؛ از مدیر بخواهید حساب را فعال کند.';
  if (m.includes('too many requests')) return 'درخواست‌های زیادی فرستاده شده؛ کمی بعد دوباره تلاش کنید.';
  return message;
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(isSupabaseConfigured);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const sb = getSupabase();
    if (!sb) { setChecking(false); return; }
    let mounted = true;
    void sb.auth.getSession().then(({ data, error: e }) => {
      if (!mounted) return;
      if (e) setError(friendlyError(e.message));
      setSession(data.session);
      setChecking(false);
    });
    const { data: { subscription } } = sb.auth.onAuthStateChange((event, next) => {
      if (event === 'PASSWORD_RECOVERY') setRecoveryMode(true);
      if (!mounted) return;
      setSession(next);
      setChecking(false);
      setError('');
    });
    return () => { mounted = false; subscription.unsubscribe(); };
  }, []);

  const value = useMemo<AuthValue>(() => ({
    email: session?.user.email ?? null,
    signOut: async () => {
      const sb = getSupabase();
      if (!sb) return;
      const { error: e } = await sb.auth.signOut();
      if (e) throw e;
    },
  }), [session]);

  if (!isSupabaseConfigured) return <>{children}</>;

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setNotice(''); setBusy(true);
    const sb = getSupabase();
    if (!sb) { setError('تنظیماتِ اتصال به سوپابیس پیدا نشد.'); setBusy(false); return; }
    const { error: e2 } = await sb.auth.signInWithPassword({ email: email.trim(), password });
    if (e2) setError(friendlyError(e2.message));
    setBusy(false);
  };

  const updatePassword = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setNotice(''); setBusy(true);
    const sb = getSupabase();
    if (!sb) { setBusy(false); return; }
    if (newPassword.length < 8) { setError('گذرواژه باید دست‌کم ۸ نویسه داشته باشد.'); setBusy(false); return; }
    const { error: e2 } = await sb.auth.updateUser({ password: newPassword });
    if (e2) setError(friendlyError(e2.message));
    else { setRecoveryMode(false); setNotice('گذرواژه با موفقیت تغییر کرد.'); }
    setBusy(false);
  };

  const resetPassword = async () => {
    setError(''); setNotice('');
    if (!email.trim()) { setError('ابتدا ایمیلِ حساب را وارد کنید.'); return; }
    const sb = getSupabase();
    if (!sb) return;
    setResetBusy(true);
    const { error: e } = await sb.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/`,
    });
    if (e) setError(friendlyError(e.message));
    else setNotice('اگر این ایمیل حسابِ فعال داشته باشد، پیوندِ بازنشانی برایش ارسال می‌شود.');
    setResetBusy(false);
  };

  if (checking) {
    return (
      <main className="auth-screen" dir="rtl" aria-busy="true">
        <div className="auth-check"><Logo size={50} animated /><span className="auth-spinner" />در حالِ بررسیِ نشستِ امن…</div>
      </main>
    );
  }

  if (session && !recoveryMode) {
    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
  }

  if (session && recoveryMode) {
    return (
      <main className="auth-screen" dir="rtl">
        <div className="auth-orb auth-orb-a" />
        <section className="auth-card" aria-labelledby="auth-title">
          <div className="auth-brand"><Logo size={62} tone="dark" variant="mark" wordmark={false} /><div className="auth-brand-copy"><strong>FARYA</strong><span>بازیابیِ گذرواژه</span></div></div>
          <h1 id="auth-title">گذرواژهٔ تازه</h1>
          <p className="auth-lead">برای حسابِ {session.user.email} یک گذرواژهٔ تازه انتخاب کنید.</p>
          <form onSubmit={updatePassword} className="auth-form">
            <label className="auth-label" htmlFor="farya-new-password">گذرواژهٔ تازه</label>
            <input id="farya-new-password" className="auth-input" type="password" autoComplete="new-password" minLength={8} required
              value={newPassword} onChange={(e) => setNewPassword(e.target.value)} dir="ltr" />
            {error && <div className="auth-message is-error" role="alert">{error}</div>}
            {notice && <div className="auth-message is-notice" role="status">{notice}</div>}
            <button className="auth-submit" type="submit" disabled={busy || newPassword.length < 8}>
              {busy ? 'در حالِ ذخیره…' : 'ذخیرهٔ گذرواژه'}
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="auth-screen" dir="rtl">
      <div className="auth-orb auth-orb-a" /><div className="auth-orb auth-orb-b" />
      <section className="auth-card" aria-labelledby="auth-title">
        <div className="auth-brand"><Logo size={62} tone="dark" variant="mark" wordmark={false} /><div className="auth-brand-copy"><strong>FARYA</strong><span>سرآشپزخانهٔ هوشمند</span></div></div>
        <div className="auth-eyebrow"><span className="auth-secure-dot" /> دسترسیِ امنِ سرآشپز</div>
        <h1 id="auth-title">خوش برگشتی</h1>
        <p className="auth-lead">برای ورود به دفترِ بهای تمام‌شدهٔ فریا، با حسابِ سرآشپز وارد شوید.</p>
        <form onSubmit={signIn} className="auth-form">
          <label className="auth-label" htmlFor="farya-email">ایمیلِ حساب</label>
          <input id="farya-email" className="auth-input" type="email" autoComplete="username" required
            value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" dir="ltr" />
          <label className="auth-label" htmlFor="farya-password">گذرواژه</label>
          <input id="farya-password" className="auth-input" type="password" autoComplete="current-password" required
            value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••••" dir="ltr" />
          {error && <div className="auth-message is-error" role="alert">{error}</div>}
          {notice && <div className="auth-message is-notice" role="status">{notice}</div>}
          <button className="auth-submit" type="submit" disabled={busy || !email.trim() || !password}>
            {busy ? <><span className="auth-spinner light" />در حالِ ورود…</> : 'ورود به فریا'}
          </button>
        </form>
        <button className="auth-reset" type="button" onClick={() => void resetPassword()} disabled={resetBusy}>
          {resetBusy ? 'در حالِ ارسال…' : 'گذرواژه را فراموش کرده‌اید؟'}
        </button>
        <div className="auth-foot"><span className="auth-lock">⌑</span> ثبت‌نامِ عمومی خاموش است؛ حساب را مدیرِ فریا می‌سازد.</div>
      </section>
      <div className="auth-bottom">FARYA <span>·</span> حریمِ داده‌های آشپزخانه حفظ می‌شود</div>
    </main>
  );
}
