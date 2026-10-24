/**
 * اجرای اسکریپت‌های SQL دقیقاً به شیوهٔ Supabase SQL Editor
 * ---------------------------------------------------------------------------
 * Supabase متن را به‌صورت «یک پرس‌وجوی ساده» به PostgreSQL می‌فرستد و هیچ
 * دستورِ خطِ‌فرمانی (مثل \set یا \i) را نمی‌فهمد. این اسکریپت همان رفتار را
 * شبیه‌سازی می‌کند تا خطاهایی از این دست پیش از رسیدن به کاربر گرفته شوند:
 *
 *     ERROR: 42601: syntax error at or near "\"
 *
 * اجرا :  node scripts/test-sql-like-supabase.mjs [مسیرِ فایل]
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const targets = args.length
  ? args
  : [join(here, '..', 'supabase', '00_all-in-one.sql')];

const CONN = process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL }
  : {
      host: process.env.PGHOST || '/tmp',
      port: Number(process.env.PGPORT || 5433),
      user: process.env.PGUSER || 'postgres',
      database: process.env.PGDATABASE || 'postgres',
    };

/* ---------- ۱) پیش‌بررسی: هیچ دستورِ psql نباید باشد ---------- */
let clean = true;
for (const t of targets) {
  const sql = readFileSync(t, 'utf8');
  const psqlCmds = sql
    .split('\n')
    .map((l, i) => ({ n: i + 1, l }))
    .filter(({ l }) => /^\s*\\[a-zA-Z]/.test(l));
  if (psqlCmds.length) {
    clean = false;
    console.error(`❌ ${t} شاملِ دستورِ psql است (Supabase آن را نمی‌فهمد):`);
    psqlCmds.forEach(({ n, l }) => console.error(`   خط ${n}: ${l}`));
  }
}
if (!clean) process.exit(1);
console.log(`۱. پیش‌بررسی: ${targets.length} فایل، هیچ دستورِ psql نیست ✅`);

/* ---------- ۲) اجرا روی یک پایگاهِ تازه ---------- */
const dbName = 'farya_supatest';
let client;
if (process.env.DATABASE_URL) {
  client = new pg.Client(CONN);
  console.log(`۲. در حالِ اجرا روی پایگاهِ DATABASE_URL…`);
} else {
  const client0 = new pg.Client(CONN);
  await client0.connect();
  await client0.query(`drop database if exists ${dbName}`);
  await client0.query(`create database ${dbName}`);
  await client0.end();
  client = new pg.Client({ ...CONN, database: dbName });
  console.log(`۲. در حالِ اجرا روی پایگاهِ تازه…`);
}
await client.connect();

for (const target of targets) {
  const sql = readFileSync(target, 'utf8');
  const name = target.split('/').pop();
  const t0 = Date.now();
  try {
    // دقیقاً مثلِ Supabase: کلِ فایل در یک پرس‌وجو
    await client.query(sql);
    console.log(`   ✅ ${name} — ${Date.now() - t0} میلی‌ثانیه`);
  } catch (err) {
    console.error(`\n❌ ${name} شکست خورد — همان خطایی که در Supabase می‌بینید:`);
    console.error(`   ${err.message}`);
    if (err.position) {
      const pos = Number(err.position);
      const line = sql.slice(0, pos).split('\n').length;
      console.error(`   در نزدیکیِ خطِ ${line}:`);
      console.error('   ' + sql.slice(Math.max(0, pos - 90), pos + 40).replace(/\n/g, ' ⏎ '));
    }
    await client.end();
    process.exit(1);
  }
}

/* ---------- ۳) گزارشِ بررسیِ صحت ---------- */
const verify = await client.query(
  "select result, count(*)::int as n from public.farya_verify() group by result order by 1",
);
console.log('\n۳. گزارشِ بررسیِ صحت:');
let fails = 0;
for (const r of verify.rows) {
  console.log(`   ${r.result.padEnd(5)} : ${r.n}`);
  if (r.result === 'FAIL') fails += r.n;
}

const bad = await client.query(
  "select section, test, detail from public.farya_verify() where result in ('FAIL','WARN')",
);
if (bad.rows.length) {
  console.log('\n   مواردِ نیازمندِ توجه:');
  bad.rows.forEach((r) => console.log(`   [${r.section}] ${r.test} → ${r.detail}`));
}

const counts = await client.query(`
  select 'آیتم‌ها' k, count(*)::int v from public.menu_items
  union all select 'مواد اولیه', count(*)::int from public.ingredients
  union all select 'نقاطِ قیمت', count(*)::int from public.price_points
  union all select 'ردیف‌های دستور', count(*)::int from public.recipe_steps
  union all select 'سربارها', count(*)::int from public.overheads
  union all select 'نسخه‌ها', count(*)::int from public.app_state_history
`);
console.log('\n۴. داده‌ها:');
counts.rows.forEach((r) => console.log(`   ${r.k} : ${r.v}`));

await client.end();
console.log(fails === 0 ? '\n🎉 همه چیز درست است' : `\n⚠️ ${fails} آزمون FAIL دارد`);
process.exit(fails === 0 ? 0 : 1);
