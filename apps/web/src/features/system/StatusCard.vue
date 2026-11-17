<script setup lang="ts">
import UAlert from '@nuxt/ui/components/Alert.vue';
import UBadge from '@nuxt/ui/components/Badge.vue';
import UButton from '@nuxt/ui/components/Button.vue';
import UCard from '@nuxt/ui/components/Card.vue';
import USkeleton from '@nuxt/ui/components/Skeleton.vue';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useApiStatus } from './useApiStatus';

defineProps<{ compact?: boolean }>();
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
  <section
    v-if="compact"
    class="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-default px-3 py-2 text-sm"
    aria-labelledby="status-compact-title"
  >
    <h2 id="status-compact-title" class="m-0 text-sm font-semibold text-highlighted">
      {{ t('status.title') }}
    </h2>
    <span v-if="isPending" role="status" class="text-muted">{{ t('status.loading') }}</span>
    <span v-else-if="isError" class="flex items-center gap-2 text-error">
      {{ t('status.error') }}
      <UButton
        :label="t('status.retry')"
        size="sm"
        variant="link"
        icon="i-lucide-refresh-cw"
        @click="refetch()"
      />
    </span>
    <template v-else-if="data">
      <UBadge
        :color="data.status === 'ok' ? 'success' : 'warning'"
        variant="subtle"
        :label="data.status === 'ok' ? t('status.ok') : t('status.degraded')"
      />
      <span v-for="[name, state] in components" :key="name" class="flex items-center gap-1">
        {{ t(`status.${name}`) }}
        <UBadge
          :color="state === 'up' ? 'success' : 'error'"
          variant="subtle"
          :label="t(`status.${state}`)"
        />
      </span>
    </template>
  </section>
  <UCard v-else>
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
