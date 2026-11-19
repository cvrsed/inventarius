#!/usr/bin/env node
// Falla si alguna acción de GitHub de .github/workflows no está fijada por SHA de commit (40 hex) con la versión
// en un comentario (`# v7`). Una etiqueta como `@v7` puede moverse; el SHA no (RNF-09).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = '.github/workflows';
const PINNED = /^\s*(?:-\s+)?uses:\s+[\w./-]+@[0-9a-f]{40}\s+#\s*v?\d[\w.-]*\s*$/;
const bad = [];
for (const file of readdirSync(DIR).filter((f) => /\.ya?ml$/.test(f))) {
  readFileSync(join(DIR, file), 'utf8')
    .split('\n')
    .forEach((line, i) => {
      if (/^\s*(?:-\s+)?uses:/.test(line) && !/uses:\s+\.\//.test(line) && !PINNED.test(line)) {
        bad.push(`${DIR}/${file}:${i + 1}: ${line.trim()}`);
      }
    });
}
if (bad.length) {
  console.error('Acciones sin fijar por SHA con su versión en comentario:\n' + bad.join('\n'));
  process.exit(1);
}
console.info('Todas las acciones de GitHub están fijadas por SHA.');
