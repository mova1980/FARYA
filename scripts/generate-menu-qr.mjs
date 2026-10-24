import QRCode from 'qrcode';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Keep this in sync with the canonical online-menu route and the exact domain.
const MENU_URL = 'https://farya-pitza.ir/menu';
const here = dirname(fileURLToPath(import.meta.url));
const output = join(here, '..', 'public', 'images', 'menu-qr.svg');
mkdirSync(dirname(output), { recursive: true });
const svg = await QRCode.toString(MENU_URL, {
  type: 'svg',
  errorCorrectionLevel: 'H',
  margin: 2,
  width: 360,
  color: { dark: '#211d1c', light: '#fbf9f5' },
});
writeFileSync(output, svg, 'utf8');
console.log(`QR code saved: ${output}\nTarget: ${MENU_URL}`);
