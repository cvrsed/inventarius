<script setup lang="ts">
import UButton from '@nuxt/ui/components/Button.vue';
import UTooltip from '@nuxt/ui/components/Tooltip.vue';
import { computed, useId } from 'vue';

/**
 * Acción de solo ícono con tooltip de texto. `label` es el texto visible del tooltip; `target` (opcional)
 * se agrega al nombre accesible para distinguir filas («Editar Acme»). Si `disabledReason` viene, el botón
 * queda deshabilitado y el tooltip explica por qué (el motivo también se asocia con `aria-describedby`).
 */
const props = defineProps<{
  icon: string;
  label: string;
  target?: string;
  disabledReason?: string;
  loading?: boolean;
  color?: 'neutral' | 'error';
  variant?: 'ghost' | 'subtle' | 'link';
}>();
defineOptions({ inheritAttrs: false });
const emit = defineEmits<{ click: [] }>();

const reasonId = useId();
const text = computed(() => props.disabledReason ?? props.label);
const accessibleName = computed(() =>
  props.target ? `${props.label} ${props.target}` : props.label,
);
</script>

<template>
  <UTooltip :text="text">
    <span class="inline-flex">
      <UButton
        :icon="icon"
        :aria-label="accessibleName"
        :aria-describedby="disabledReason ? reasonId : undefined"
        :disabled="!!disabledReason"
        :loading="loading"
        :color="color ?? 'neutral'"
        :variant="variant ?? 'ghost'"
        v-bind="$attrs"
        @click="emit('click')"
      />
      <span v-if="disabledReason" :id="reasonId" class="sr-only">{{ disabledReason }}</span>
    </span>
  </UTooltip>
</template>
