import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..');
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

describe('controles deshabilitados (RNF-02)', () => {
  it('ninguna plantilla ni estilo usa texto tachado', () => {
    const offenders = walk(SRC)
      .filter((f) => /\.(vue|css)$/.test(f))
      .filter((f) => /line-through|<(s|del|strike)[\s>]/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('la regla global atenúa los deshabilitados y no los tacha', () => {
    const css = readFileSync(join(__dirname, 'layout.css'), 'utf8');
    const rule = css.slice(css.indexOf('button:disabled'));
    expect(rule).toMatch(/opacity:\s*0\.5/);
    expect(rule).toMatch(/text-decoration:\s*none/);
    expect(rule).not.toMatch(/line-through/);
  });
});
