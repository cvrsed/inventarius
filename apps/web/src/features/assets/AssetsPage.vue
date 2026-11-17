<script setup lang="ts">
import type { AssetListItemDto } from '@inventarius/shared';
import UAlert from '@nuxt/ui/components/Alert.vue';
import UBadge from '@nuxt/ui/components/Badge.vue';
import UButton from '@nuxt/ui/components/Button.vue';
import UIcon from '@nuxt/ui/components/Icon.vue';
import UInput from '@nuxt/ui/components/Input.vue';
import UTable from '@nuxt/ui/components/Table.vue';
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { currentPlace } from './place';
import { useAuthStore } from '@/features/auth/useAuthStore';
import { useListQuery } from '@/shared/list/useListQuery';
import AppSelect from '@/shared/ui/AppSelect.vue';
import PagedFooter from '@/shared/ui/PagedFooter.vue';
import AssetFilters from './AssetFilters.vue';
import { ASSET_LIST_DEFAULTS, exportUrl, useAssetsList, type AssetListState } from './api';
import { statusColor } from './status';

const { t } = useI18n();
const auth = useAuthStore();
const { query, update, setPage, reset } = useListQuery(ASSET_LIST_DEFAULTS);
const state = computed<AssetListState>(() => query.value);
const { data, isPending, isFetching, isError, refetch } = useAssetsList(state);

const search = ref(query.value.q);
let timer: ReturnType<typeof setTimeout> | undefined;
onBeforeUnmount(() => clearTimeout(timer));
watch(search, (value) => {
  clearTimeout(timer);
  // Sin cambio real no se toca la URL: así un «atrás» del navegador no se convierte en una búsqueda nueva.
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

const showFilters = ref(false);
const SORTS = [
  'assetTag',
  'name',
  'status',
  'model',
  'location',
  'purchaseDate',
  'createdAt',
] as const;
const sortItems = computed(() =>
  SORTS.flatMap((key) => [
    { value: key, label: `${t(`assets.sortKeys.${key}`)} ↑` },
    { value: `-${key}`, label: `${t(`assets.sortKeys.${key}`)} ↓` },
  ]),
);

const columns = computed(() => [
  { id: 'assetTag', header: t('assets.columns.assetTag') },
  { id: 'name', header: t('assets.columns.name') },
  { id: 'model', header: t('assets.columns.model') },
  { id: 'status', header: t('assets.columns.status') },
  { id: 'location', header: t('assets.columns.location') },
  { id: 'assignedTo', header: t('assets.columns.assignedTo') },
]);
const assignedName = (a: {
  assignedUser: { name: string } | null;
  assignedLocation: { name: string } | null;
}) => a.assignedUser?.name ?? a.assignedLocation?.name ?? '';
const filtered = computed(
  () =>
    query.value.q !== '' ||
    query.value.statusId !== '' ||
    query.value.categoryId !== '' ||
    query.value.modelId !== '' ||
    query.value.locationId !== '' ||
    query.value.assignedUserId !== '' ||
    query.value.baseLocationId !== '' ||
    query.value.statusKind !== '' ||
    query.value.assigned !== '' ||
    query.value.overdue !== '' ||
    query.value.deleted !== 'exclude',
);
// Un enlace con filtros (p. ej. desde el Inicio) abre el panel para que se vean los que están aplicados.
const NOT_FILTERS = ['page', 'pageSize', 'q', 'sort'];
const hasPanelFilters = (Object.keys(ASSET_LIST_DEFAULTS) as (keyof AssetListState)[]).some(
  (k) => !NOT_FILTERS.includes(k) && query.value[k] !== ASSET_LIST_DEFAULTS[k],
);
if (hasPanelFilters) showFilters.value = true;
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h1 class="m-0 text-2xl font-semibold text-highlighted">{{ t('assets.title') }}</h1>
      <div class="flex flex-wrap gap-2">
        <UButton
          :href="exportUrl(state)"
          icon="i-lucide-download"
          :label="t('assets.export')"
          color="neutral"
          variant="outline"
          external
        />
        <UButton
          v-if="auth.can('asset:write')"
          :to="{ name: 'asset-new' }"
          icon="i-lucide-plus"
          :label="t('assets.new')"
        />
      </div>
    </div>

    <div class="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_14rem_auto]">
      <UInput
        v-model="search"
        type="search"
        icon="i-lucide-search"
        :placeholder="t('assets.search')"
        :aria-label="t('assets.search')"
        class="w-full"
      />
      <AppSelect
        :model-value="query.sort"
        :items="sortItems"
        :aria-label="t('assets.sortLabel')"
        class="w-full"
        @update:model-value="(v: string | number) => update({ sort: String(v) })"
      />
      <UButton
        class="md:hidden"
        icon="i-lucide-list-filter"
        :label="t('assets.filters')"
        color="neutral"
        variant="outline"
        :aria-expanded="showFilters"
        aria-controls="asset-filters"
        @click="showFilters = !showFilters"
      />
    </div>

    <div id="asset-filters" :class="showFilters ? 'block' : 'hidden md:block'">
      <AssetFilters :state="state" @change="update" @clear="reset" />
    </div>

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

    <p v-if="data" class="m-0 text-sm text-muted" aria-live="polite">
      {{ t('common.total', { n: data.meta.total }, data.meta.total) }}
    </p>

    <div class="hidden md:block">
      <UTable
        :data="data?.data ?? []"
        :columns="columns"
        :loading="isPending || isFetching"
        :get-row-id="(a: AssetListItemDto) => a.id"
        class="rounded-lg border border-default"
      >
        <template #empty>{{ filtered ? t('common.emptyFiltered') : t('assets.empty') }}</template>
        <template #assetTag-cell="{ row }">
          <RouterLink
            :to="{ name: 'asset', params: { id: row.original.id } }"
            class="font-medium text-primary underline"
          >
            {{ row.original.assetTag }}
          </RouterLink>
        </template>
        <template #name-cell="{ row }">
          {{ row.original.name }}
          <UBadge
            v-if="row.original.deleted"
            :label="t('assets.deletedBadge')"
            color="neutral"
            variant="subtle"
            class="ml-1"
          />
        </template>
        <template #model-cell="{ row }">{{ row.original.model.name }}</template>
        <template #status-cell="{ row }">
          <UBadge
            :label="row.original.status.name"
            :color="statusColor(row.original.status.kind)"
            variant="subtle"
          />
        </template>
        <template #location-cell="{ row }">{{
          row.original.location?.name ??
          (row.original.assignedUser
            ? t('assets.withPerson', { name: row.original.assignedUser.name })
            : '')
        }}</template>
        <template #assignedTo-cell="{ row }">{{ assignedName(row.original) }}</template>
      </UTable>
    </div>

    <ul class="m-0 flex list-none flex-col gap-3 p-0 md:hidden" :aria-busy="isFetching">
      <li v-if="data && !data.data.length" class="py-8 text-center text-muted">
        {{ filtered ? t('common.emptyFiltered') : t('assets.empty') }}
      </li>
      <li v-for="a in data?.data ?? []" :key="a.id">
        <RouterLink
          :to="{ name: 'asset', params: { id: a.id } }"
          class="flex min-h-11 flex-col gap-1 rounded-lg border border-default bg-default p-3 no-underline hover:bg-elevated"
        >
          <span class="flex items-center justify-between gap-2">
            <span class="font-semibold text-highlighted">{{ a.assetTag }}</span>
            <UBadge :label="a.status.name" :color="statusColor(a.status.kind)" variant="subtle" />
          </span>
          <span class="text-default">{{ a.name }}</span>
          <span class="text-sm text-muted">{{ a.model.name }}</span>
          <span class="flex items-center gap-1 text-sm text-muted">
            <UIcon name="i-lucide-map-pin" class="size-4" aria-hidden="true" />
            {{ currentPlace(a, t) }} ·
            {{ assignedName(a) || t('assets.unassigned') }}
          </span>
          <UBadge
            v-if="a.deleted"
            :label="t('assets.deletedBadge')"
            color="neutral"
            variant="subtle"
            class="self-start"
          />
        </RouterLink>
      </li>
    </ul>

    <PagedFooter
      :page="query.page"
      :page-size="query.pageSize"
      :total="data?.meta.total ?? 0"
      :page-sizes="[10, 25, 50, 100]"
      @update:page="setPage"
      @update:page-size="(n: number) => update({ pageSize: n })"
    />
  </div>
</template>
