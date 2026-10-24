import React, { Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import RestaurantHome from './views/RestaurantHome';
import OnlineMenu from './views/OnlineMenu';
import './styles/global.css';

const CostPortal = React.lazy(() => import('./CostPortal'));
const path = window.location.pathname.replace(/\/+$/, '') || '/';
const isCostApp = path === '/cost' || path.startsWith('/cost/');
const isOnlineMenu = path === '/menu' || path.startsWith('/menu/');
// The chef console is intentionally viewport-locked; public pages scroll as documents.
document.body.classList.toggle('public-restaurant', !isCostApp);

document.title = isCostApp
  ? 'بهای تمام‌شده | FARYA'
  : isOnlineMenu
    ? 'منوی آنلاین | FARYA'
    : 'FARYA — پیتزای تنوری ناپولیتن در گوهردشت کرج';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
      {isCostApp ? (
        <Suspense fallback={<div className="auth-check" dir="rtl">در حالِ باز کردنِ دفترِ فریا…</div>}>
          <CostPortal />
        </Suspense>
      ) : isOnlineMenu ? <OnlineMenu /> : <RestaurantHome />}
  </React.StrictMode>,
);
