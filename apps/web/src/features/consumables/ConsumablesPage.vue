<script setup lang="ts">
import { formatQuantity, type ConsumableDto } from '@inventarius/shared';
import UAlert from '@nuxt/ui/components/Alert.vue';
import UBadge from '@nuxt/ui/components/Badge.vue';
import UButton from '@nuxt/ui/components/Button.vue';
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/features/auth/useAuthStore';
import { fetchOptionById, fetchOptions } from '@/features/catalog/api';
import FilterToolbar from '@/shared/filters/FilterToolbar.vue';
import type { FilterDef } from '@/shared/filters/types';
import { useListQuery } from '@/shared/list/useListQuery';
import PagedFooter from '@/shared/ui/PagedFooter.vue';
import ResponsiveTable from '@/shared/ui/ResponsiveTable.vue';
import { CONSUMABLE_LIST_DEFAULTS, useConsumablesList, type ConsumableListState } from './api';
import ConsumableFormDialog from './ConsumableFormDialog.vue';

const { t } = useI18n();
const auth = useAuthStore();
const { query, update, setPage, reset } = useListQuery(CONSUMABLE_LIST_DEFAULTS);
const state = computed<ConsumableListState>(() => query.value);
const { data, isPending, isFetching, isError, refetch } = useConsumablesList(state);

const search = ref(query.value.q);
let timer: ReturnType<typeof setTimeout> | undefined;
onBeforeUnmount(() => clearTimeout(timer));
watch(search, (value) => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    if (value.trim() !== query.value.q) void update({ q: value.trim() });
  }, 300);
});
watch(
  () => query.value.q,
  (q) => {
    if (q !== search.value.trim()) search.value = q;
  },
);

const filterDefs = computed<FilterDef[]>(() => [
  {
    kind: 'choice',
    key: 'lowStock',
    label: t('consumables.filters.lowStock'),
    placement: 'bar',
    options: [{ value: 'true', label: t('consumables.filters.lowStockOnly') }],
  },
  {
    kind: 'choice',
    key: 'active',
    label: t('consumables.filters.state'),
    placement: 'bar',
    defaultValue: 'true',
    options: [
      { value: 'true', label: t('consumables.filters.active') },
      { value: 'false', label: t('consumables.filters.inactive') },
      { value: 'all', label: t('consumables.filters.all') },
    ],
  },
  {
    kind: 'remote',
    key: 'categoryId',
    label: t('consumables.filters.category'),
    placement: 'bar',
    source: 'consumableCategories',
    searchPlaceholder: t('filters.search.categories'),
    fetcher: (q) => fetchOptions('consumableCategories', q, { all: true }),
    resolve: (id) => fetchOptionById('consumableCategories', id),
  },
]);

const columns = computed(() => [
  { id: 'name', header: t('consumables.columns.name') },
  { id: 'category', header: t('consumables.columns.category') },
  { id: 'stock', header: t('consumables.columns.stock') },
  { id: 'minimum', header: t('consumables.columns.minimum') },
  { id: 'state', header: t('consumables.columns.state') },
]);

const stockOf = (c: ConsumableDto) => formatQuantity(c.totalStock, c.unit);
const minimumOf = (c: ConsumableDto) =>
  c.minStock ? formatQuantity(c.minStock, c.unit) : t('consumables.noMinimum');

const formVisible = ref(false);
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="m-0 text-2xl font-semibold text-highlighted">{{ t('consumables.title') }}</h1>
        <p class="m-0 text-sm text-muted">{{ t('consumables.description') }}</p>
      </div>
      <UButton
        v-if="auth.can('consumables:manage')"
        icon="i-lucide-plus"
        :label="t('consumables.new')"
        @click="formVisible = true"
      />
    </div>

    <FilterToolbar
      v-model:search="search"
      search-id="consumables-search"
      :search-placeholder="t('consumables.search')"
      :defs="filterDefs"
      :values="query"
      :total="data?.meta.total"
      @change="update"
      @clear="reset"
    />

    <UAlert v-if="isError" color="error" variant="subtle" role="alert">
      <template #description>
        {{ t('common.genericError') }}
        <UButton
          class="ml-2"
          :label="t('common.retry')"
          size="sm"
          variant="link"
          @click="refetch()"
        />
      </template>
    </UAlert>

    <ResponsiveTable
      :data="data?.data ?? []"
      :columns="columns"
      :loading="isPending || isFetching"
      :get-row-id="(c: ConsumableDto) => c.id"
    >
      <template #name-cell="{ row }">
        <RouterLink
          :to="{ name: 'consumable', params: { id: row.original.id } }"
          class="font-medium text-highlighted underline-offset-2 hover:underline"
        >
          {{ row.original.name }}
        </RouterLink>
      </template>
      <template #category-cell="{ row }">{{ row.original.category.name }}</template>
      <template #stock-cell="{ row }">
        <span class="flex flex-wrap items-center gap-2">
          <span>{{ stockOf(row.original) }}</span>
          <UBadge
            v-if="row.original.lowStock"
            :label="t('consumables.lowBadge')"
            color="warning"
            variant="subtle"
            icon="i-lucide-triangle-alert"
          />
        </span>
      </template>
      <template #minimum-cell="{ row }">{{ minimumOf(row.original) }}</template>
      <template #state-cell="{ row }">
        <UBadge
          :label="row.original.active ? t('common.active') : t('common.inactive')"
          :color="row.original.active ? 'success' : 'warning'"
          variant="subtle"
        />
      </template>
      <template #empty>
        {{
          query.q || query.categoryId || query.lowStock || query.active !== 'true'
            ? t('common.emptyFiltered')
            : t('consumables.empty')
        }}
      </template>
      <template #card="{ item }">
        <div class="flex items-start justify-between gap-2">
          <RouterLink
            :to="{ name: 'consumable', params: { id: item.id } }"
            class="font-semibold break-words text-highlighted"
          >
            {{ item.name }}
          </RouterLink>
          <UBadge
            :label="item.active ? t('common.active') : t('common.inactive')"
            :color="item.active ? 'success' : 'warning'"
            variant="subtle"
          />
        </div>
        <dl class="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt class="text-muted">{{ t('consumables.columns.category') }}</dt>
          <dd class="m-0">{{ item.category.name }}</dd>
          <dt class="text-muted">{{ t('consumables.columns.stock') }}</dt>
          <dd class="m-0 flex flex-wrap items-center gap-2">
            {{ stockOf(item) }}
            <UBadge
              v-if="item.lowStock"
              :label="t('consumables.lowBadge')"
              color="warning"
              variant="subtle"
              icon="i-lucide-triangle-alert"
            />
          </dd>
          <dt class="text-muted">{{ t('consumables.columns.minimum') }}</dt>
          <dd class="m-0">{{ minimumOf(item) }}</dd>
        </dl>
      </template>
    </ResponsiveTable>

    <PagedFooter
      :page="query.page"
      :page-size="query.pageSize"
      :total="data?.meta.total ?? 0"
      :page-sizes="[10, 25, 50, 100]"
      @update:page="setPage"
      @update:page-size="(n: number) => update({ pageSize: n })"
    />

    <ConsumableFormDialog v-model:visible="formVisible" :item="null" />
  </div>
</template>
