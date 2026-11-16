<script setup lang="ts">
import UAlert from '@nuxt/ui/components/Alert.vue';
import UBadge from '@nuxt/ui/components/Badge.vue';
import UButton from '@nuxt/ui/components/Button.vue';
import UCard from '@nuxt/ui/components/Card.vue';
import USkeleton from '@nuxt/ui/components/Skeleton.vue';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useApiStatus } from './useApiStatus';

const { t } = useI18n();
const { data, isPending, isError, refetch } = useApiStatus();

const components = computed(() =>
  data.value
    ? ([
        ['database', data.value.checks.database],
        ['queue', data.value.checks.queue],
      ] as const)
    : [],
);
</script>

<template>
  <UCard>
    <template #header>
      <h2 class="m-0 text-lg font-semibold text-highlighted">{{ t('status.title') }}</h2>
    </template>

    <div
      v-if="isPending"
      class="flex flex-col gap-2"
      role="status"
      :aria-label="t('status.loading')"
    >
      <USkeleton class="h-5 w-3/5" />
      <USkeleton class="h-5 w-2/5" />
    </div>

    <div v-else-if="isError" class="flex flex-col items-start gap-3">
      <UAlert color="error" variant="subtle" :description="t('status.error')" />
      <UButton :label="t('status.retry')" icon="i-lucide-refresh-cw" @click="refetch()" />
    </div>

    <div v-else-if="data" class="flex flex-col gap-3">
      <UAlert
        :color="data.status === 'ok' ? 'success' : 'warning'"
        variant="subtle"
        :description="data.status === 'ok' ? t('status.ok') : t('status.degraded')"
      />
      <ul class="m-0 flex list-none flex-col gap-2 p-0">
        <li
          v-for="[name, state] in components"
          :key="name"
          class="flex items-center justify-between gap-3"
        >
          <span>{{ t(`status.${name}`) }}</span>
          <UBadge
            :color="state === 'up' ? 'success' : 'error'"
            variant="subtle"
            :label="t(`status.${state}`)"
          />
        </li>
      </ul>
    </div>
  </UCard>
</template>
