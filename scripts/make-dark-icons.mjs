#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = process.cwd();
const iconsDir = path.join(root, 'public', 'icons');
const bg = '#0a0c12';

const tasks = [
  { src: 'icon-192.png', out: 'icon-192-dark.png' },
  { src: 'icon-512.png', out: 'icon-512-dark.png' },
  { src: 'apple-touch-icon.png', out: 'apple-touch-icon-dark.png' }
];

async function ensureDark(srcName, outName) {
  const src = path.join(iconsDir, srcName);
  const out = path.join(iconsDir, outName);
  try {
    await fs.access(src);
  } catch {
    console.error(`Missing icon: ${srcName}`);
    return;
  }
  try {
    const img = sharp(src).flatten({ background: bg });
    await img.png().toFile(out);
    console.log(`Wrote ${outName}`);
  } catch (err) {
    console.error(`Failed to write ${outName}:`, err.message);
  }
}

(async () => {
  await fs.mkdir(iconsDir, { recursive: true });
  for (const t of tasks) await ensureDark(t.src, t.out);
})();
