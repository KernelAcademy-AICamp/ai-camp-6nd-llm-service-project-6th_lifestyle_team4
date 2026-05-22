// SVG → PNG 변환 (admin + user 양쪽)
// 실행: cd upload_web && node scripts/gen-icons.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function makeIcons(srcSvgPath, outDir, bgColor) {
  const svg = readFileSync(srcSvgPath);
  const targets = [
    { name: 'icon-192.png', size: 192 },
    { name: 'icon-512.png', size: 512 },
    { name: 'apple-touch-icon.png', size: 180 },
  ];
  for (const t of targets) {
    const out = await sharp(svg)
      .resize(t.size, t.size, { fit: 'contain', background: bgColor })
      .png()
      .toBuffer();
    writeFileSync(join(outDir, t.name), out);
    console.log(`  ✓ ${t.name} (${t.size}x${t.size})`);
  }
}

console.log('Admin icons:');
await makeIcons(
  join(__dirname, '..', 'public', 'icons', 'icon.svg'),
  join(__dirname, '..', 'public', 'icons'),
  { r: 53, g: 37, b: 205, alpha: 1 },
);

console.log('User icons (Daily Script):');
await makeIcons(
  join(__dirname, '..', 'public', 'm', 'icons', 'icon.svg'),
  join(__dirname, '..', 'public', 'm', 'icons'),
  { r: 250, g: 248, b: 242, alpha: 1 },
);
