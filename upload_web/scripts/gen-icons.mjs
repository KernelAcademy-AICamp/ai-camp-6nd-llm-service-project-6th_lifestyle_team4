// SVG → PNG (192/512/180/maskable) 생성 스크립트
// 실행: cd upload_web && node scripts/gen-icons.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const iconsDir = join(__dirname, '..', 'public', 'icons');
const svg = readFileSync(join(iconsDir, 'icon.svg'));

const targets = [
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
  { name: 'apple-touch-icon.png', size: 180 },
];

for (const t of targets) {
  const out = await sharp(svg)
    .resize(t.size, t.size, { fit: 'contain', background: { r: 53, g: 37, b: 205, alpha: 1 } })
    .png()
    .toBuffer();
  writeFileSync(join(iconsDir, t.name), out);
  console.log(`✓ ${t.name} (${t.size}x${t.size})`);
}
