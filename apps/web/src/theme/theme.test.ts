import { describe, expect, it } from 'vitest';
import { uiTheme } from './theme';

describe('tema', () => {
  it('el botón primario sólido no aclara su fondo al pasar el puntero (contraste AA con texto blanco)', () => {
    const [override] = uiTheme.button.compoundVariants;
    expect(override).toMatchObject({ color: 'primary', variant: 'solid' });
    // El hover por defecto de Nuxt UI es `bg-primary/75` (3,35:1); aquí se oscurece en claro y se aclara en oscuro.
    expect(override!.class).toContain('hover:bg-(--ui-color-primary-800)');
    expect(override!.class).not.toContain('/75');
  });

  it('el resaltado de «Ir al movimiento» (primario al 15 % sobre el fondo) mantiene el contraste AA del texto, en claro y en oscuro (P14)', () => {
    const channel = (c: number) => {
      const v = c / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const luminance = ([r, g, b]: number[]) =>
      0.2126 * channel(r!) + 0.7152 * channel(g!) + 0.0722 * channel(b!);
    const contrast = (a: number[], b: number[]) => {
      const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return (hi! + 0.05) / (lo! + 0.05);
    };
    const over = (fg: number[], bg: number[], alpha: number) =>
      fg.map((c, i) => Math.round(c * alpha + bg[i]! * (1 - alpha)));
    // Colores de la paleta de Tailwind v4 que usa el tema: primario (teal 700 / 400), grises (zinc) y el fondo de la página.
    const themes = {
      claro: { bg: '#ffffff', primary: '#00786f', muted: '#52525c', body: '#3f3f46' },
      oscuro: { bg: '#18181b', primary: '#00d5be', muted: '#9f9fa9', body: '#e4e4e7' },
    };
    for (const [name, t] of Object.entries(themes)) {
      const highlighted = over(rgb(t.primary), rgb(t.bg), 0.15);
      expect(contrast(rgb(t.muted), highlighted), `${name}: texto atenuado`).toBeGreaterThanOrEqual(
        4.5,
      );
      expect(contrast(rgb(t.body), highlighted), `${name}: texto`).toBeGreaterThanOrEqual(4.5);
      // El borde se distingue del fondo (WCAG 1.4.11, 3:1).
      expect(contrast(rgb(t.primary), rgb(t.bg)), `${name}: borde`).toBeGreaterThanOrEqual(3);
    }
  });
});
