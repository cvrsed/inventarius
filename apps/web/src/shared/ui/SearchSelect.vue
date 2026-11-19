<script setup lang="ts">
import USelectMenu from '@nuxt/ui/components/SelectMenu.vue';
import { useI18n } from 'vue-i18n';
import { useInertWhileOpen } from './useInertWhileOpen';

/**
 * Select con búsqueda sobre una lista cerrada y corta (se filtra en el navegador; para catálogos grandes
 * está `RemoteSelect`). El valor es el texto de la opción; `''` significa «sin elegir».
 */
defineProps<{
  items: readonly { value: string; label: string }[];
  placeholder: string;
  id?: string;
  clearable?: boolean;
  disabled?: boolean;
}>();
const model = defineModel<string>({ default: '' });

const { t } = useI18n();
const onOpen = useInertWhileOpen();
</script>

<template>
  <USelectMenu
    :id="id"
    :model-value="model === '' ? undefined : model"
    :items="[...items]"
    value-key="value"
    :placeholder="placeholder"
    :disabled="disabled"
    :clear="clearable"
    :search-input="{ placeholder: `${placeholder} — ${t('common.searchPlaceholder')}` }"
    class="w-full"
    @update:model-value="(v: string | null | undefined) => (model = v ?? '')"
    @update:open="onOpen"
  >
    <template #empty>{{ t('common.noOptions') }}</template>
  </USelectMenu>
</template>
