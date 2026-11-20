import { describe, expect, it } from 'vitest';
import { APP_ICONS } from './theme';

const sources = import.meta.glob<string>('/src/**/*.{vue,ts}', {
  query: '?raw',
  import: 'default',
  eager: true,
});

describe('íconos empaquetados (RNF-08)', () => {
  it('todo `i-lucide-*` usado en el código está en APP_ICONS; si no, se pediría a api.iconify.design en runtime', () => {
    const bundled = new Set<string>(APP_ICONS);
    const missing = new Set<string>();
    for (const [file, text] of Object.entries(sources)) {
      if (file.endsWith('.test.ts')) continue;
      for (const [, name] of text.matchAll(/i-lucide-([a-z0-9-]+)/g)) {
        if (!bundled.has(`lucide:${name}`)) missing.add(`${name} (${file})`);
      }
    }
    expect([...missing]).toEqual([]);
  });
});
