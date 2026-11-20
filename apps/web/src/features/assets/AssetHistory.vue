<script setup lang="ts">
import UBadge from '@nuxt/ui/components/Badge.vue';
import UIcon from '@nuxt/ui/components/Icon.vue';
import UButton from '@nuxt/ui/components/Button.vue';
import { computed, toRef } from 'vue';
import { useI18n } from 'vue-i18n';
import { actorDisplay } from '@/features/audit/actor';
import { formatDateTime } from '@/shared/format/format';
import { useAssetHistory } from './api';
import { auditActionLabel } from '@/app/i18n/audit';
import { describeEntry } from './history';

const props = defineProps<{ assetId: string }>();
const { t, te } = useI18n();
const { data, isPending, isError, hasNextPage, isFetchingNextPage, fetchNextPage } =
  useAssetHistory(toRef(props, 'assetId'));

const ICONS = {
  create: 'i-lucide-plus',
  update: 'i-lucide-pencil',
  status_change: 'i-lucide-refresh-cw',
  checkout: 'i-lucide-user-plus',
  checkin: 'i-lucide-undo-2',
  delete: 'i-lucide-archive',
  restore: 'i-lucide-archive-restore',
} as const;

const items = computed(() =>
  (data.value?.pages.flatMap((p) => p.data) ?? []).map((entry) => ({
    entry,
    view: describeEntry(entry, { t, te }),
  })),
);
</script>

<template>
  <section aria-labelledby="history-title" class="flex flex-col gap-3">
    <h2 id="history-title" class="m-0 text-lg font-semibold text-highlighted">
      {{ t('assets.history.title') }}
    </h2>
    <p v-if="isPending" class="m-0 text-muted">{{ t('common.loading') }}</p>
    <p v-else-if="isError" class="m-0 text-error" role="alert">{{ t('common.genericError') }}</p>
    <p v-else-if="!items.length" class="m-0 text-muted">{{ t('assets.history.empty') }}</p>
    <ol v-else class="m-0 flex list-none flex-col gap-4 p-0">
      <li v-for="{ entry, view } in items" :key="entry.id" class="flex gap-3">
        <span
          class="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-elevated"
        >
          <UIcon :name="ICONS[view.key]" class="size-4" aria-hidden="true" />
        </span>
        <div class="min-w-0 flex-1">
          <p class="m-0 font-medium text-highlighted">
            {{ auditActionLabel(view.action) }}
          </p>
          <p v-if="view.params['to']" class="m-0 text-sm text-default">
            {{ t('assets.history.assignedTo', { to: view.params['to'] }) }}
          </p>
          <p class="m-0 text-sm text-muted">
            {{ formatDateTime(entry.at) }} ·
            {{ t('assets.history.by', { name: actorDisplay(entry, t) }) }}
          </p>
          <ul v-if="view.rows.length" class="m-0 mt-1 flex list-none flex-col gap-1 p-0 text-sm">
            <li v-for="r in view.rows" :key="r.field" class="break-words">
              <UBadge :label="r.label" color="neutral" variant="subtle" class="mr-1" />
              <template v-if="r.value !== undefined">
                <span class="text-default">{{ r.value }}</span>
              </template>
              <template v-else>
                <span class="text-muted">{{ r.before }}</span>
                <span aria-hidden="true"> → </span><span class="sr-only">a</span>
                <span class="text-default">{{ r.after }}</span>
              </template>
            </li>
          </ul>
        </div>
      </li>
    </ol>
    <UButton
      v-if="hasNextPage"
      :label="t('assets.history.more')"
      :loading="isFetchingNextPage"
      color="neutral"
      variant="subtle"
      class="self-start"
      @click="fetchNextPage()"
    />
  </section>
</template>
