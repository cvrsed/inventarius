<script setup lang="ts">
import UBadge from '@nuxt/ui/components/Badge.vue';
import UIcon from '@nuxt/ui/components/Icon.vue';
import UPagination from '@nuxt/ui/components/Pagination.vue';
import { computed, ref, toRef } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAssetHistory } from './api';
import { describeEntry } from './history';

const props = defineProps<{ assetId: string }>();
const { t, te, d } = useI18n();
const page = ref(1);
const { data, isPending, isError } = useAssetHistory(toRef(props, 'assetId'), page);

const ICONS = {
  create: 'i-lucide-plus',
  update: 'i-lucide-pencil',
  checkout: 'i-lucide-user-plus',
  checkin: 'i-lucide-undo-2',
  delete: 'i-lucide-archive',
  restore: 'i-lucide-archive-restore',
} as const;

const items = computed(() =>
  (data.value?.data ?? []).map((entry) => ({ entry, view: describeEntry(entry) })),
);
const fieldLabel = (f: string) =>
  te(`assets.history.fields.${f}`) ? t(`assets.history.fields.${f}`) : f;
const show = (v: unknown) => (v === null || v === '' ? t('assets.history.empty_value') : String(v));
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
            {{ t(`assets.history.actions.${view.key}`, view.params) }}
          </p>
          <p class="m-0 text-sm text-muted">
            {{ d(new Date(entry.at), 'long') }} ·
            {{ t('assets.history.by', { name: entry.actorName ?? entry.actorLabel ?? '—' }) }}
          </p>
          <ul v-if="view.changes.length" class="m-0 mt-1 flex list-none flex-col gap-1 p-0 text-sm">
            <li v-for="c in view.changes" :key="c.field" class="break-words">
              <UBadge :label="fieldLabel(c.field)" color="neutral" variant="subtle" class="mr-1" />
              <span class="text-muted">{{ show(c.before) }}</span>
              <span aria-hidden="true"> → </span><span class="sr-only">a</span>
              <span class="text-default">{{ show(c.after) }}</span>
            </li>
          </ul>
        </div>
      </li>
    </ol>
    <UPagination
      v-if="(data?.meta.total ?? 0) > 10"
      v-model:page="page"
      :items-per-page="10"
      :total="data?.meta.total ?? 0"
      :sibling-count="1"
      class="max-w-full overflow-x-auto"
    />
  </section>
</template>
