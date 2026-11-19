<script setup lang="ts">
import USelect from '@nuxt/ui/components/Select.vue';
import { computed } from 'vue';
import { useInertWhileOpen } from './useInertWhileOpen';

/**
 * Select de Nuxt UI para filtros de página.
 *
 * - reka-ui no admite opciones con valor vacío: `''` («todas») se traduce a un centinela interno.
 * - Con el listbox abierto el fondo queda `inert` (ver `useInertWhileOpen`).
 */
defineOptions({ inheritAttrs: false });
const props = defineProps<{ items: { label: string; value: string | number }[] }>();
const model = defineModel<string | number>({ required: true });

const EMPTY = '__empty__';
const items = computed(() =>
  props.items.map((i) => ({ ...i, value: i.value === '' ? EMPTY : i.value })),
);
/** Con una opción «todas» (valor `''`) el vacío es esa opción; sin ella, el select queda sin valor y muestra el placeholder. */
const hasEmptyOption = computed(() => props.items.some((i) => i.value === ''));
const shown = computed<string | number | undefined>({
  get: () => (model.value === '' ? (hasEmptyOption.value ? EMPTY : undefined) : model.value),
  set: (v: string | number | undefined) => (model.value = v === EMPTY || v === undefined ? '' : v),
});

const onOpen = useInertWhileOpen();
</script>

<template>
  <USelect v-bind="$attrs" v-model="shown" :items="items" value-key="value" @update:open="onOpen">
    <template v-for="(_, name) in $slots" :key="name" #[name]="slotProps">
      <slot :name="name" v-bind="slotProps ?? {}" />
    </template>
  </USelect>
</template>
