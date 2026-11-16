import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { globalPlugins } from '@/test-utils';
import ForbiddenPage from './ForbiddenPage.vue';
import NotFoundPage from './NotFoundPage.vue';

describe('páginas estáticas', () => {
  it('403 y 404 ofrecen volver al inicio', () => {
    for (const page of [ForbiddenPage, NotFoundPage]) {
      const w = mount(page, { global: globalPlugins() });
      expect(w.get('h1').text().length).toBeGreaterThan(0);
      expect(w.get('button').text()).toBe('Volver al inicio');
    }
  });
});
