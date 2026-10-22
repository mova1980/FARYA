/**
 * شبیه‌سازِ بسیار سبکِ Supabase REST — فقط برای تستِ محلیِ لایهٔ همگام‌سازی
 * مسیرهایی را پیاده می‌کند که src/lib/sync.ts واقعاً استفاده می‌کند:
 *   GET  /rest/v1/app_state?id=eq.1&select=...
 *   POST /rest/v1/rpc/save_state
 * اجرا :  node scripts/mock-supabase.mjs 54321
 */
import http from 'node:http';
import fs from 'node:fs';

const PORT = Number(process.argv[2] || 54321);
const DB = '/tmp/mock-supabase.json';

const read = () =>
  fs.existsSync(DB) ? JSON.parse(fs.readFileSync(DB, 'utf8')) : { rev: 0, data: null };
const write = (d) => fs.writeFileSync(DB, JSON.stringify(d));

const send = (res, code, body, type = 'application/json') => {
  res.writeHead(code, {
    'content-type': type,
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-allow-methods': '*',
  });
  res.end(JSON.stringify(body));
};

http
  .createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const url = new URL(req.url, `http://localhost:${PORT}`);
      console.log(`[mock] ${req.method} ${url.pathname}`);

      if (req.method === 'OPTIONS') return send(res, 204, {});

      // ---- خواندنِ وضعیت ----
      if (req.method === 'GET' && url.pathname === '/rest/v1/app_state') {
        const db = read();
        return send(res, 200, db.data ? [{ id: 1, data: db.data, rev: db.rev, updated_at: new Date().toISOString() }] : []);
      }

      // ---- ذخیرهٔ وضعیت ----
      if (req.method === 'POST' && url.pathname === '/rest/v1/rpc/save_state') {
        const body = JSON.parse(raw || '{}');
        const db = read();
        db.rev = (db.rev || 0) + 1;
        db.data = body.p_state ?? null;
        write(db);
        const s = db.data || {};
        console.log(
          `[mock] ذخیره شد rev=${db.rev} — ${(s.ingredients || []).length} ماده / ${(s.items || []).length} آیتم`,
        );
        return send(res, 200, db.rev);
      }

      return send(res, 404, { message: `مسیر پیدا نشد: ${req.method} ${url.pathname}` });
    });
  })
  .listen(PORT, '0.0.0.0', () => console.log(`[mock] آماده روی http://0.0.0.0:${PORT}`));
