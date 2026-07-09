// One-off image optimiser for the showcase gallery.
// Converts the large source PNGs (8–10 MB each, with transparency) into
// compact, transparency-preserving WebP assets sized for the web.
//
// Run with:  node scripts/optimize-gallery.mjs
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(root, 'src/assets/gallery');
mkdirSync(outDir, { recursive: true });

// source file -> output slug, plus the largest dimension we want to keep.
const jobs = [
  { src: 'Pooja Thali.png', out: 'pooja-thali.webp', max: 1500 },
  { src: 'Fruit Bowl.png', out: 'fruit-bowl.webp', max: 1500 },
  { src: 'pots.png', out: 'pots.webp', max: 1500 },
  { src: 'Deepam.png', out: 'deepam.webp', max: 1500 },
];

for (const { src, out, max } of jobs) {
  const outPath = resolve(outDir, out);
  await sharp(resolve(root, src))
    .resize({ width: max, height: max, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82, effort: 6, alphaQuality: 90 })
    .toFile(outPath);
  const { size } = await sharp(outPath).metadata().then((m) => ({ size: m.size }));
  console.log(`${src} -> src/assets/gallery/${out}`);
}
console.log('done');
