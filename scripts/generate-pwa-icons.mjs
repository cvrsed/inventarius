#!/usr/bin/env node
// Genera los íconos PWA (RF-42) a partir de la misma figura de `apps/web/public/favicon.svg`, sin dependencias:
// rasteriza los trazos a mano y escribe PNG con zlib. Uso: node scripts/generate-pwa-icons.mjs
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('../apps/web/public/icons/', import.meta.url));
const BG = [0x0f, 0x76, 0x6e];
const SEGMENTS = [
  [8, 11, 16, 7],
  [16, 7, 24, 11],
  [24, 11, 24, 21],
  [24, 21, 16, 25],
  [16, 25, 8, 21],
  [8, 21, 8, 11],
  [8, 11, 16, 15],
  [16, 15, 24, 11],
  [16, 15, 16, 25],
];

function distance(px, py, [x1, y1, x2, y2]) {
  const dx = x2 - x1,
    dy = y2 - y1;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/** `scale` reduce la figura (zona segura de los íconos maskable); `rounded` recorta las esquinas. */
function render(size, { scale, rounded }) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const unit = 32 / size;
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x += 1) {
      const gx = ((x + 0.5) * unit - 16) / scale + 16;
      const gy = ((y + 0.5) * unit - 16) / scale + 16;
      const d = Math.min(...SEGMENTS.map((s) => distance(gx, gy, s)));
      const ink = Math.max(0, Math.min(1, (1 - d) / (unit / scale) + 0.5)); // trazo de 2 unidades
      let alpha = 1;
      if (rounded) {
        const r = 7 / unit,
          cx = Math.min(x + 0.5, size - x - 0.5),
          cy = Math.min(y + 0.5, size - y - 0.5);
        if (cx < r && cy < r)
          alpha = Math.max(0, Math.min(1, r - Math.hypot(r - cx, r - cy) + 0.5));
      }
      const o = y * (size * 4 + 1) + 1 + x * 4;
      for (let c = 0; c < 3; c += 1) raw[o + c] = Math.round(BG[c] * (1 - ink) + 255 * ink);
      raw[o + 3] = Math.round(alpha * 255);
    }
  }
  return raw;
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const body = Buffer.concat([Buffer.from(type), data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), body.length + 4);
  return out;
};
function png(size, opts) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 6, 0, 0, 0], 8); // 8 bits, RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(render(size, opts), { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(OUT, { recursive: true });
const icons = {
  'icon-192.png': [192, { scale: 1, rounded: true }],
  'icon-512.png': [512, { scale: 1, rounded: true }],
  'icon-maskable-512.png': [512, { scale: 0.7, rounded: false }],
  'apple-touch-icon.png': [180, { scale: 1, rounded: false }],
};
for (const [name, [size, opts]] of Object.entries(icons))
  writeFileSync(OUT + name, png(size, opts));
