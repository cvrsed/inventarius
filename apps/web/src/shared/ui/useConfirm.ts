import { reactive } from 'vue';

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
  };
}
