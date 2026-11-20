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
});
