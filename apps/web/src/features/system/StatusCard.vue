<script setup lang="ts">
import Button from 'primevue/button';
import Card from 'primevue/card';
import Message from 'primevue/message';
import Skeleton from 'primevue/skeleton';
import Tag from 'primevue/tag';
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
  <Card>
    <template #title>
      <h2 class="m-0 text-lg">{{ t('status.title') }}</h2>
    </template>
    <template #content>
      <div
        v-if="isPending"
        class="flex flex-col gap-2"
        role="status"
        :aria-label="t('status.loading')"
      >
        <Skeleton width="60%" height="1.25rem" />
        <Skeleton width="40%" height="1.25rem" />
      </div>

      <div v-else-if="isError" class="flex flex-col items-start gap-3">
        <Message severity="error" :closable="false">{{ t('status.error') }}</Message>
        <Button
          class="app-touch"
          :label="t('status.retry')"
          icon="pi pi-refresh"
          @click="refetch()"
        />
      </div>

      <div v-else-if="data" class="flex flex-col gap-3">
        <Message :severity="data.status === 'ok' ? 'success' : 'warn'" :closable="false">
          {{ data.status === 'ok' ? t('status.ok') : t('status.degraded') }}
        </Message>
        <ul class="m-0 flex list-none flex-col gap-2 p-0">
          <li
            v-for="[name, state] in components"
            :key="name"
            class="flex items-center justify-between gap-3"
          >
            <span>{{ t(`status.${name}`) }}</span>
            <Tag :severity="state === 'up' ? 'success' : 'danger'" :value="t(`status.${state}`)" />
          </li>
        </ul>
      </div>
    </template>
  </Card>
</template>
