<script setup lang="ts">
import UButton from '@nuxt/ui/components/Button.vue';
import UTooltip from '@nuxt/ui/components/Tooltip.vue';
import { useId } from 'vue';

/**
 * Botón con texto que, si `reason` viene, queda desactivado y lo dice: se ve apagado (neutro, sin el color primario)
 * y el tooltip explica el motivo. El motivo también se asocia con `aria-describedby` para lectores de pantalla y para
 * quien no puede pasar el cursor. Sin `reason` se comporta como un `UButton` normal (el resto de atributos pasa tal cual).
 */
defineProps<{ label: string; icon?: string; reason?: string; loading?: boolean }>();
defineOptions({ inheritAttrs: false });
const emit = defineEmits<{ click: [] }>();
const reasonId = useId();
</script>

<template>
  <UTooltip :text="reason ?? ''" :disabled="!reason">
    <span class="inline-flex">
      <UButton
        v-bind="reason ? { ...$attrs, color: 'neutral', variant: 'subtle' } : $attrs"
        :label="label"
        :icon="icon"
        :loading="loading"
        :disabled="!!reason"
        :aria-describedby="reason ? reasonId : undefined"
        @click="emit('click')"
      />
      <span v-if="reason" :id="reasonId" class="sr-only">{{ reason }}</span>
    </span>
  </UTooltip>
</template>
