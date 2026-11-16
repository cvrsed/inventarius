import Aura from '@primeuix/themes/aura';
import { definePreset } from '@primeuix/themes';

/**
 * Tema Inventarius: Aura personalizado solo por design tokens (RNF-01, ADR 0003).
 * Cambiar la identidad visual = editar este archivo; no se tocan componentes de la librería.
 *
 * Contraste: en modo claro el primario usa 700 (5,5:1 con blanco) y en oscuro 400 sobre superficie 900,
 * ambos sobre el mínimo AA de 4,5:1 (RNF-02).
 */
export const InventariusPreset = definePreset(Aura, {
  semantic: {
    primary: {
      50: '#f0fdfa',
      100: '#ccfbf1',
      200: '#99f6e4',
      300: '#5eead4',
      400: '#2dd4bf',
      500: '#14b8a6',
      600: '#0d9488',
      700: '#0f766e',
      800: '#115e59',
      900: '#134e4a',
      950: '#042f2e',
    },
    focusRing: { width: '2px', style: 'solid', offset: '2px' },
    colorScheme: {
      light: {
        primary: {
          color: '{primary.700}',
          contrastColor: '#ffffff',
          hoverColor: '{primary.800}',
          activeColor: '{primary.900}',
        },
        highlight: {
          background: '{primary.100}',
          focusBackground: '{primary.200}',
          color: '{primary.900}',
          focusColor: '{primary.950}',
        },
        text: { mutedColor: '{surface.600}' },
      },
      dark: {
        primary: {
          color: '{primary.400}',
          contrastColor: '{surface.900}',
          hoverColor: '{primary.300}',
          activeColor: '{primary.200}',
        },
        highlight: {
          background: 'color-mix(in srgb, {primary.400}, transparent 84%)',
          focusBackground: 'color-mix(in srgb, {primary.400}, transparent 76%)',
          color: 'rgba(255,255,255,.87)',
          focusColor: 'rgba(255,255,255,.87)',
        },
        text: { mutedColor: '{surface.400}' },
      },
    },
  },
});
