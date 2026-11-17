import { computed, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { onBeforeRouteLeave } from 'vue-router';
import { useConfirm } from './useConfirm';

/**
 * Avisa de cambios sin guardar al navegar fuera (guardián del router), recargar o cerrar la pestaña
 * (`beforeunload`) y, en diálogos, al cerrarlos. `snapshot` devuelve el estado del formulario; el estado
 * «limpio» es el de cuando `active` pasa a `true` (se abre el diálogo o se monta la página) o el último
 * `markClean()`. `active` vale `true` siempre en las páginas.
 */
export function useUnsavedChanges(snapshot: () => unknown, active: Ref<boolean> = ref(true)) {
  const { t } = useI18n();
  const confirm = useConfirm();
  const serialize = () => JSON.stringify(snapshot());
  const baseline = ref<string | null>(null);

  const markClean = () => (baseline.value = serialize());
  const dirty = computed(
    () => active.value && baseline.value !== null && serialize() !== baseline.value,
  );

  // El estado limpio se toma después de que el formulario se inicializó (los datos pueden llegar async).
  watch(
    active,
    (on) => {
      baseline.value = null;
      if (on) setTimeout(markClean, 0);
    },
    { immediate: true, flush: 'post' },
  );

  const confirmDiscard = () =>
    confirm.ask({
      title: t('unsaved.title'),
      message: t('unsaved.message'),
      acceptLabel: t('unsaved.discard'),
      rejectLabel: t('unsaved.stay'),
      danger: true,
    });

  const beforeUnload = (event: BeforeUnloadEvent) => {
    if (!dirty.value) return;
    event.preventDefault();
    event.returnValue = '';
  };
  onMounted(() => window.addEventListener('beforeunload', beforeUnload));
  onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload));

  onBeforeRouteLeave(() => (dirty.value ? confirmDiscard() : true));

  /** Cierra un diálogo, pidiendo confirmación si hay cambios sin guardar. */
  async function requestClose(close: () => void): Promise<void> {
    if (!dirty.value || (await confirmDiscard())) close();
  }

  return { dirty, markClean, confirmDiscard, requestClose };
}
