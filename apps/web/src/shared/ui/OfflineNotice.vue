<script setup lang="ts">
import UIcon from '@nuxt/ui/components/Icon.vue';
import { useI18n } from 'vue-i18n';
import { useOnline } from './useOnline';

const { t } = useI18n();
const online = useOnline();
</script>

<template>
  <div
    v-if="!online"
    role="status"
    class="flex items-center gap-2 border-b border-default bg-warning/10 px-4 py-2 text-sm text-highlighted"
  >
    <UIcon name="i-lucide-wifi-off" class="size-4 shrink-0" aria-hidden="true" />
    <span>{{ t('common.offlineBanner') }}</span>
  </div>
</template>
