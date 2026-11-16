<script setup lang="ts">
import USelect from '@nuxt/ui/components/Select.vue';
import { computed, onBeforeUnmount } from 'vue';

/**
 * Select de Nuxt UI para filtros de página.
 *
 * - reka-ui no admite opciones con valor vacío: `''` («todas») se traduce a un centinela interno.
 * - Mientras el listbox está abierto, reka-ui deja el resto de la página con `aria-hidden` pero con
 *   elementos aún enfocables (axe: aria-hidden-focus). El fondo se marca `inert`, que es lo que ocurre de
 *   hecho: el foco queda atrapado en el listbox (ADR 0004).
 */
defineOptions({ inheritAttrs: false });
const props = defineProps<{ items: { label: string; value: string | number }[] }>();
const model = defineModel<string | number>({ required: true });

const EMPTY = '__empty__';
const items = computed(() =>
  props.items.map((i) => ({ ...i, value: i.value === '' ? EMPTY : i.value })),
);
const shown = computed({
  get: () => (model.value === '' ? EMPTY : model.value),
  set: (v: string | number) => (model.value = v === EMPTY ? '' : v),
});

const appRoot = () => document.getElementById('app');
function onOpen(open: boolean): void {
  appRoot()?.toggleAttribute('inert', open);
}
onBeforeUnmount(() => appRoot()?.removeAttribute('inert'));
</script>

<template>
  <USelect v-bind="$attrs" v-model="shown" :items="items" value-key="value" @update:open="onOpen" />
</template>
