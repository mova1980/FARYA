#!/usr/bin/env node
/**
 * FARYA · آماده‌سازی خودکار فونت‌ها
 * ------------------------------------------------------------------
 * کافی است فایل‌های فونت را در پوشهٔ public/fonts بریزید و این اسکریپت را اجرا کنید:
 *
 *     npm run fonts
 *
 * اسکریپت نامِ فایل‌ها را می‌خواند، خانواده و وزن و زیرمجموعه (subset) را تشخیص می‌دهد
 * و فایل public/fonts/fonts.css را بازنویسی می‌کند.
 *
 * فونت مدام (Modam) — طراحی سید ناصر خادم — ۸ وزن:
 *   ExtraLight · Light · Regular · Medium · SemiBold · Bold · ExtraBold · Black
 * فرمت‌های پذیرفته‌شده: woff2 (توصیه‌شده) · woff · ttf · otf
 * اگر نسخهٔ وریبل (Variable) را هم قرار دهید، فقط همان استفاده می‌شود (سبک‌تر).
 *
 * نمونه نام‌های قابل تشخیص:
 *   Modam-Regular.woff2        Modam-Bold.woff2      modam-black.woff2
 *   Modam[wght].woff2          Modam-Variable.woff2  Modam-Regular-Farsi.woff2
 *   مدام-Regular.woff2          MODAM-ExtraLight.woff2
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'public', 'fonts');
const out = path.join(dir, 'fonts.css');

const EXTS = ['.woff2', '.woff', '.ttf', '.otf'];
const MIME = { '.woff2': 'woff2', '.woff': 'woff', '.ttf': 'truetype', '.otf': 'opentype' };

/* زیرمجموعه‌های کاراکتری */
const RANGE = {
  latin: 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD',
  'latin-ext': 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF',
  arabic: 'U+0600-06FF, U+0750-077F, U+0870-0891, U+0897-08E1, U+08E3-08FF, U+200C-200E, U+2010-2011, U+204F, U+2E41, U+FB50-FDFF, U+FE70-FE74, U+FE76-FEFC, U+102E0-102FB, U+10E60-10E7E, U+10EC2-10EC7, U+10EC9-10EEE, U+10EF0-10EFF, U+1EE00-1EE03, U+1EE05-1EE1F, U+1EE21-1EE22, U+1EE24, U+1EE27, U+1EE29-1EE32, U+1EE34-1EE37, U+1EE39, U+1EE3B, U+1EE42, U+1EE47, U+1EE49, U+1EE4B, U+1EE4D-1EE4F, U+1EE51-1EE52, U+1EE54, U+1EE57, U+1EE59, U+1EE5B, U+1EE5D, U+1EE5F, U+1EE61-1EE62, U+1EE64, U+1EE67-1EE6A, U+1EE6C-1EE72, U+1EE74-1EE77, U+1EE79-1EE7C, U+1EE7E, U+1EE80-1EE89, U+1EE8B-1EE9B, U+1EEA1-1EEA3, U+1EEA5-1EEA9, U+1EEAB-1EEBB, U+1EEF0-1EEF1',
};

/* وزن‌ها */
const WEIGHTS = [
  [/extr ?a ?light|ultra ?light|hairline|thin|100\b/i, 100, 'ExtraLight'],
  [/light|نازک|300\b/i, 300, 'Light'],
  [/medium|متوسط|500\b/i, 500, 'Medium'],
  [/semi ?bold|demi ?bold|نیمه ?ضخیم|600\b/i, 600, 'SemiBold'],
  [/extra ?bold|ultra ?bold|خیلی ?ضخیم|800\b/i, 800, 'ExtraBold'],
  [/black|heavy|سیاه|900\b/i, 900, 'Black'],
  [/bold|ضخیم|700\b/i, 700, 'Bold'],
  [/regular|normal|book|معمولی|400\b/i, 400, 'Regular'],
];

const FAMILIES = [
  { test: /modam|مدام/i, name: 'MODAM', label: 'مدام (فونت اصلی برنامه)', range: '100 900' },
  { test: /modam|مدام/i, name: 'MODAM Condensed', label: 'مدام فشرده (زیرخانواده)', range: '100 900' },
  { test: /vazir/i, name: 'Vazirmatn', label: 'وزیرمتن (جایگزین فارسی)', range: '100 900' },
  { test: /bodoni/i, name: 'Bodoni Moda', label: 'Bodoni Moda (لاتینِ نمایشی)', range: '400 900' },
  { test: /outfit/i, name: 'Outfit', label: 'Outfit (لاتینِ رابط)', range: '100 900' },
];

const detectWeight = (file) => {
  for (const [re, w, label] of WEIGHTS) if (re.test(file)) return { weight: w, label, variable: false };
  if (/variable|variabl|\[wght|\[wdth|-vf\b|وریبل/i.test(file)) return { weight: null, label: 'Variable', variable: true };
  return { weight: 400, label: 'Regular', variable: false, guessed: true };
};

const detectSubset = (file) => {
  const f = file.toLowerCase();
  if (/latin[-_ ]?ext|latin2/.test(f)) return 'latin-ext';
  if (/arabic|farsi|persian|fa\b|عربی|فارسی/.test(f)) return 'arabic';
  if (/latin/.test(f)) return 'latin';
  return null;
};

if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const files = fs.readdirSync(dir).filter((f) => EXTS.includes(path.extname(f).toLowerCase()));
const parsed = files.map((file) => {
  const fam = (/modam|مدام/i.test(file) && /condensed|فشرده/i.test(file))
    ? { name: 'MODAM Condensed', label: 'مدام فشرده (زیرخانواده)', range: '100 900' }
    : FAMILIES.find((x) => x.test.test(file)) || null;
  const w = detectWeight(file);
  return {
    file,
    family: fam ? fam.name : 'UNKNOWN',
    label: fam ? fam.label : 'ناشناس',
    range: fam ? fam.range : '100 900',
    weight: w.weight,
    weightLabel: w.label,
    variable: w.variable,
    guessed: w.guessed,
    italic: /italic|oblique|مورب|ایتالیک/i.test(file),
    subset: detectSubset(file),
    format: MIME[path.extname(file).toLowerCase()],
  };
});

const byFamily = {};
parsed.forEach((p) => { (byFamily[p.family] ||= []).push(p); });

/* اگر برای خانواده‌ای فایل وریبل وجود داشت، فقط همان را بنویس */
const chosen = [];
Object.keys(byFamily).forEach((fam) => {
  const list = byFamily[fam];
  const vari = list.filter((p) => p.variable);
  chosen.push(...(vari.length ? vari : list));
});

const face = (p) => {
  const w = p.variable ? p.range : p.weight;
  const lines = [
    '@font-face {',
    `  font-family: '${p.family}';`,
    `  font-style: ${p.italic ? 'italic' : 'normal'};`,
    `  font-weight: ${w};`,
    '  font-display: swap;',
    `  src: url('/fonts/${p.file}') format('${p.format}');`,
  ];
  if (p.subset && RANGE[p.subset]) lines.push(`  unicode-range: ${RANGE[p.subset]};`);
  lines.push('}');
  return lines.join('\n');
};

/* فونت‌های اصلی که همیشه باید باشند (اگر کاربر حذفشان نکرده باشد) */
const fallbackFaces = [];
if (!byFamily['Vazirmatn']) {
  fallbackFaces.push('/* ⚠ فونت جایگزین فارسی (Vazirmatn) یافت نشد — برنامه با فونت سیستم کار می‌کند */');
}
if (!byFamily['MODAM']) {
  fallbackFaces.push(`/* 
 * ⚠ فایل‌های فونت «مدام» هنوز در این پوشه قرار نگرفته‌اند.
 * فایل‌ها را اینجا بریزید و دوباره اجرا کنید:   npm run fonts
 * تا آن زمان، برنامه با فونت «وزیرمتن» (اگر باشد) یا فونت سیستم نمایش داده می‌شود.
 */`);
}

const header = `/* ------------------------------------------------------------------
 * FARYA · فونت‌ها — این فایل به‌صورت خودکار توسط scripts/prepare-fonts.mjs ساخته شده است.
 * برای تغییر، فایل‌های فونت را در public/fonts بریزید و «npm run fonts» را اجرا کنید.
 * تاریخ ساخت: ${new Date().toISOString().slice(0, 19).replace('T', ' ')}
 * ------------------------------------------------------------------ */
`;

const css = [
  header,
  ...fallbackFaces,
  ...chosen.map(face),
  '',
].join('\n\n');

fs.writeFileSync(out, css, 'utf8');

/* گزارش */
const pad = (s, n) => String(s).padEnd(n, ' ');
console.log('\n  FARYA · فونت‌ها\n' + '  ' + '─'.repeat(66));
const groups = {};
chosen.forEach((p) => { (groups[p.family] ||= []).push(p); });
Object.keys(groups).forEach((fam) => {
  const list = groups[fam];
  const meta = FAMILIES.find((x) => x.name === fam);
  console.log(`  ${pad(fam, 14)} ${(meta ? meta.label : 'ناشناس').padEnd(34)} ${list.length} فایل`);
  list.forEach((p) => console.log(`      ${pad('· ' + p.file, 38)} ${p.variable ? 'variable ' + p.range.replace(' ', '–') : pad(p.weight + ' ' + p.weightLabel, 16)}${p.subset ? ' [' + p.subset + ']' : ''}${p.guessed ? '  (وزن حدسی)' : ''}`));
});
/* وزن‌هایی که برنامه استفاده می‌کند */
const NEEDED = [400, 500, 600, 700, 800];
const NEEDED_LABEL = { 400: 'Regular', 500: 'Medium', 600: 'SemiBold', 700: 'Bold', 800: 'ExtraBold' };

if (!byFamily['MODAM']) {
  console.log('\n  ⚠ فونت مدام یافت نشد. فایل‌های مدام را در public/fonts بریزید و دوباره اجرا کنید.');
} else {
  const list = chosen.filter((p) => p.family === 'MODAM');
  const hasVariable = list.some((p) => p.variable);
  if (!hasVariable) {
    const have = new Set(list.map((p) => p.weight));
    const missing = NEEDED.filter((w) => !have.has(w));
    if (missing.length) {
      console.log('\n  ⚠ این وزن‌ها در فایل‌های مدام پیدا نشد و مرورگر آن‌ها را شبیه‌سازی می‌کند:');
      missing.forEach((w) => console.log(`      ${w} ${NEEDED_LABEL[w]}`));
      console.log('      برای بهترین نتیجه، بستهٔ کامل (۸ وزن) یا نسخهٔ وریبل را تهیه کنید.');
    }
  }
}
console.log(`\n  ✓ ${out.replace(root + path.sep, '')} بازنویسی شد.\n`);
