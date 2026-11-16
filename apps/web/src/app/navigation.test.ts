import { describe, expect, it } from 'vitest';
import { navigationItems } from './navigation';
import { messages } from './i18n/es-CL';
import { router } from './router';

describe('navegación', () => {
  it('cada item apunta a una ruta existente y tiene texto i18n', () => {
    for (const item of navigationItems) {
      expect(router.hasRoute(item.routeName)).toBe(true);
      const key = item.labelKey.split('.');
      let node: unknown = messages;
      for (const part of key) node = (node as Record<string, unknown>)[part];
      expect(typeof node).toBe('string');
    }
  });
});
