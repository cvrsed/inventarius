// RNF-09 / CLAUDE.md: la imagen de Playwright debe tener la misma versión que el paquete.
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../e2e/package.json', import.meta.url), 'utf8'));
const dockerfile = readFileSync(new URL('../Dockerfile', import.meta.url), 'utf8');

const pkgVersion = pkg.devDependencies['@playwright/test'];
const imageVersion = /playwright:v([\d.]+)-/.exec(dockerfile)?.[1];

if (pkgVersion !== imageVersion) {
  console.error(
    `Versión de Playwright desalineada: paquete ${pkgVersion} vs imagen ${imageVersion ?? '(no encontrada)'}`,
  );
  process.exit(1);
}
console.info(`Playwright ${pkgVersion}: paquete e imagen alineados.`);
