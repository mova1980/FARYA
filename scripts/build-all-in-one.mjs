/**
 * ساختِ supabase/00_all-in-one.sql از روی اسکریپت‌هایِ schema + migration
 * ---------------------------------------------------------------------------
 *   npm run db:sql
 *
 * خروجی شاملِ bootstrap و feedِ عمومیِ منو است. فقط روی پروژهٔ خالی اجرا شود.
 * روی پایگاهِ دادهٔ تولیدی اجرا نکنید: bootstrap داده‌ها را seed/بازسازی می‌کند.
 * برای پروژهٔ موجود، فقط migration افزایشیِ 07_public_menu.sql را اعمال کنید.
 *
 * خروجی باید SQLِ خالص باشد؛ هیچ دستورِ psql (مثلِ \\set یا \\i) در آن نیست.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const supa = join(here, '..', 'supabase');

const FILES = [
  '01_schema.sql',
  '02_functions.sql',
  '03_rls.sql',
  '04_seed.sql',
  '05_verify.sql',
  '07_public_menu.sql',
];

const header = `-- ============================================================================
--  FARYA — full bootstrap for a NEW / EMPTY Supabase project only
-- ----------------------------------------------------------------------------
--  Included, in order: 01_schema · 02_functions · 03_rls · 04_seed · 05_verify
--                      07_public_menu
--
--  IMPORTANT: Never run this full bootstrap on the existing production project.
--  The app's save_state() rebuilds relational tables and the seed is legacy data.
--  Existing production project: use only the tracked additive migration
--  add_public_menu_feed (source: supabase/07_public_menu.sql), already applied.
--
--  This is plain SQL for the Supabase SQL Editor; it contains no psql commands.
-- ============================================================================

`;

const footer = `
-- ============================================================================
--  پایان. برای دیدنِ دوبارهٔ گزارش در هر زمان:
--      select * from public.farya_verify();
-- ============================================================================
`;

let out = header;
for (const f of FILES) {
  const txt = readFileSync(join(supa, f), 'utf8');
  out += `\n\n-- ${'='.repeat(74)}\n--  فایل: ${f}\n-- ${'='.repeat(74)}\n\n`;
  out += txt.trimStart();
}
out += footer;

// ---- ایمنی: اگر خطی با \ شروع شود یعنی دستورِ psql وارد شده → خطا بده
const offenders = out
  .split('\n')
  .map((l, i) => ({ n: i + 1, l }))
  .filter(({ l }) => /^\s*\\/.test(l));

if (offenders.length) {
  console.error('❌ فایلِ خروجی شاملِ دستورِ psql است که در Supabase کار نمی‌کند:');
  offenders.forEach(({ n, l }) => console.error(`   خط ${n}: ${l}`));
  process.exit(1);
}

writeFileSync(join(supa, '00_all-in-one.sql'), out, 'utf8');
console.log(`✅ supabase/00_all-in-one.sql ساخته شد (${out.length.toLocaleString('en-US')} نویسه)`);
console.log('✅ بررسی شد: هیچ دستورِ psql در خروجی نیست');
