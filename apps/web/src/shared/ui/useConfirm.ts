import { reactive, watch } from 'vue';

export interface ConfirmOptions {
  title: string;
  message: string;
  acceptLabel: string;
  rejectLabel: string;
  /** `error` pinta el botón de confirmar como acción destructiva. */
  danger?: boolean;
  accept: () => void | Promise<void>;
}

interface ConfirmState {
  open: boolean;
  options: ConfirmOptions | null;
}

const state = reactive<ConfirmState>({ open: false, options: null });

/**
 * Diálogo de confirmación único para toda la app: se pide desde cualquier pantalla y lo muestra `ConfirmDialog`,
 * montado una sola vez en `App.vue`.
 */
export function useConfirm() {
  return {
    state,
    require(options: ConfirmOptions): void {
      state.options = options;
      state.open = true;
    },
    close(): void {
      state.open = false;
    },
    /**
     * Versión con promesa: `true` si la persona confirma, `false` si cancela o cierra el diálogo
     * (sirve a los guardianes de navegación, que necesitan esperar la respuesta).
     */
    ask(options: Omit<ConfirmOptions, 'accept'>): Promise<boolean> {
      return new Promise<boolean>((resolve) => {
        let settled = false;
        const settle = (value: boolean) => {
          if (settled) return;
          settled = true;
          stop();
          resolve(value);
        };
        const stop = watch(
          () => state.open,
          (open) => {
            if (!open) settle(false);
          },
        );
        state.options = { ...options, accept: () => settle(true) };
        state.open = true;
      });
    },
  };
}
