<script setup lang="ts">
import UAlert from '@nuxt/ui/components/Alert.vue';
import UBadge from '@nuxt/ui/components/Badge.vue';
import UButton from '@nuxt/ui/components/Button.vue';
import { useToast } from '@nuxt/ui/composables/useToast';
import { computed, onBeforeUnmount, ref, toRef, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { errorMessage } from '@/features/auth/errors';
import { useAuthStore } from '@/features/auth/useAuthStore';
import { useListQuery } from '@/shared/list/useListQuery';
import FilterToolbar from '@/shared/filters/FilterToolbar.vue';
import type { FilterDef } from '@/shared/filters/types';
import AppSelect from '@/shared/ui/AppSelect.vue';
import IconAction from '@/shared/ui/IconAction.vue';
import ResponsiveTable from '@/shared/ui/ResponsiveTable.vue';
import PagedFooter from '@/shared/ui/PagedFooter.vue';
import { useConfirm } from '@/shared/ui/useConfirm';
import { useCatalogList, useCatalogMutations, type CatalogItem } from './api';
import CatalogFormDialog from './CatalogFormDialog.vue';
import { SECTIONS, type Section } from './entities';
import { columnsOf, displayCells } from './columns';

const { t } = useI18n();
const route = useRoute();
const toast = useToast();
const confirm = useConfirm();
const auth = useAuthStore();

const section = computed<Section>(() => {
  const s = String(route.params['section'] ?? '');
  return (SECTIONS as readonly string[]).includes(s) ? (s as Section) : 'categories';
});
const router = useRouter();
/** En móvil las secciones son un select; en escritorio, pestañas. */
const sectionItems = computed(() =>
  SECTIONS.map((s) => ({ label: t(`catalog.sections.${s}`), value: s })),
);
const goToSection = (value: string | number) =>
  router.push({ name: 'catalog', params: { section: String(value) } });
const canWrite = computed(() => auth.can('catalog:write'));

const { query, update, setPage, reset } = useListQuery({
  page: 1,
  pageSize: 25,
  q: '',
  active: '',
});
const search = ref(query.value.q);
watch(section, () => (search.value = ''));
watch(search, (value) => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    if (value.trim() !== query.value.q) void update({ q: value.trim() });
  }, 300);
});
let timer: ReturnType<typeof setTimeout> | undefined;
onBeforeUnmount(() => clearTimeout(timer));

const { data, isPending, isFetching, isError, refetch } = useCatalogList(section, query);
const { remove, update: patch } = useCatalogMutations(toRef(() => section.value));

const columns = computed(() => columnsOf(section.value, t));
type CellKey = 'second' | 'third' | 'fourth';
/** Columnas de datos que van como filas «campo: valor» en la tarjeta (sin nombre, estado ni acciones). */
const cardColumns = computed(() =>
  columns.value.filter((c) => ['second', 'third', 'fourth'].includes(c.id)),
);
const filterDefs = computed<FilterDef[]>(() => [
  {
    kind: 'choice',
    key: 'active',
    label: t('catalog.stateFilter'),
    placement: 'bar',
    options: [
      { value: 'true', label: t('common.active') },
      { value: 'false', label: t('common.inactive') },
    ],
  },
]);

const formVisible = ref(false);
const editing = ref<CatalogItem | null>(null);
const openForm = (item: CatalogItem | null) => {
  editing.value = item;
  formVisible.value = true;
};

const isSystem = (i: CatalogItem) => 'isSystem' in i && i.isSystem;
/** Motivo por el que no se puede eliminar (RF-14), o `undefined` si se puede intentar. */
const deleteBlockedReason = (i: CatalogItem): string | undefined => {
  if (isSystem(i)) return t('catalog.systemHint');
  return i.inUse ? t('catalog.inUseReason') : undefined;
};

async function run(action: () => Promise<unknown>, okKey: string): Promise<void> {
  try {
    await action();
    toast.add({ title: t(okKey), color: 'success', duration: 4000 });
  } catch (e) {
    toast.add({ title: errorMessage(e, t), color: 'error', duration: 6000 });
  }
}

function askDelete(item: CatalogItem): void {
  const label = displayCells(section.value, item, t).title;
  confirm.require({
    title: t('catalog.deleteTitle', { section: t(`catalog.singular.${section.value}`) }),
    message: t('catalog.deleteConfirm', { name: label }),
    acceptLabel: t('common.delete'),
    rejectLabel: t('common.cancel'),
    danger: true,
    accept: () => run(() => remove.mutateAsync(item), 'catalog.deleted'),
  });
}

const toggleActive = (item: CatalogItem) =>
  run(() => patch.mutateAsync({ item, body: { active: !item.active } }), 'catalog.toggled');
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="m-0 text-2xl font-semibold text-highlighted">{{ t('catalog.title') }}</h1>
        <p class="m-0 text-sm text-muted">{{ t('catalog.description') }}</p>
      </div>
      <UButton
        v-if="canWrite"
        icon="i-lucide-plus"
        :label="t(`catalog.new.${section}`)"
        @click="openForm(null)"
      />
    </div>

    <AppSelect
      :model-value="section"
      :items="sectionItems"
      :aria-label="t('catalog.sectionSelect')"
      class="w-full md:hidden"
      @update:model-value="goToSection"
    />

    <nav :aria-label="t('catalog.tabsLabel')" class="hidden md:block">
      <ul class="m-0 flex list-none gap-1 p-0">
        <li v-for="s in SECTIONS" :key="s">
          <RouterLink
            v-slot="{ href, navigate }"
            custom
            :to="{ name: 'catalog', params: { section: s } }"
          >
            <a
              :href="href"
              class="app-nav-link px-3 whitespace-nowrap"
              :aria-current="s === section ? 'page' : undefined"
              @click="navigate"
            >
              {{ t(`catalog.sections.${s}`) }}
            </a>
          </RouterLink>
        </li>
      </ul>
    </nav>

    <FilterToolbar
      v-model:search="search"
      search-id="catalog-search"
      :search-placeholder="
        t('catalog.searchLabel', { section: t(`catalog.sections.${section}`).toLowerCase() })
      "
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
      :key="section"
      :data="data?.data ?? []"
      :columns="columns"
      :loading="isPending || isFetching"
      :get-row-id="(i: CatalogItem) => i.id"
      class="rounded-lg border border-default"
    >
      <template #name-cell="{ row }">
        <span class="font-medium">{{ displayCells(section, row.original).title }}</span>
        <UBadge
          v-if="isSystem(row.original)"
          :label="t('catalog.system')"
          color="neutral"
          variant="subtle"
          class="ml-2"
        />
      </template>
      <template #second-cell="{ row }">{{
        displayCells(section, row.original, t).second
      }}</template>
      <template #third-cell="{ row }">{{ displayCells(section, row.original).third }}</template>
      <template #fourth-cell="{ row }">{{ displayCells(section, row.original).fourth }}</template>
      <template #state-cell="{ row }">
        <UBadge
          :label="row.original.active ? t('common.active') : t('common.inactive')"
          :color="row.original.active ? 'success' : 'warning'"
          variant="subtle"
        />
      </template>
      <template #actions-cell="{ row }">
        <span v-if="canWrite" class="flex gap-1">
          <IconAction
            icon="i-lucide-pencil"
            :label="t('common.edit')"
            :target="displayCells(section, row.original).title"
            @click="openForm(row.original)"
          />
          <IconAction
            v-if="!isSystem(row.original)"
            :icon="row.original.active ? 'i-lucide-eye-off' : 'i-lucide-eye'"
            :label="row.original.active ? t('catalog.deactivate') : t('catalog.activate')"
            :target="displayCells(section, row.original).title"
            @click="toggleActive(row.original)"
          />
          <IconAction
            icon="i-lucide-trash-2"
            :label="t('common.delete')"
            :target="displayCells(section, row.original).title"
            :disabled-reason="deleteBlockedReason(row.original)"
            @click="askDelete(row.original)"
          />
        </span>
      </template>

      <template #empty>{{
        query.q || query.active ? t('common.emptyFiltered') : t(`catalog.empty.${section}`)
      }}</template>
      <template #card="{ item }">
        <div class="flex items-start justify-between gap-2">
          <span class="font-semibold text-highlighted">
            {{ displayCells(section, item).title }}
            <UBadge
              v-if="isSystem(item)"
              :label="t('catalog.system')"
              color="neutral"
              variant="subtle"
              class="ml-1"
            />
          </span>
          <UBadge
            :label="item.active ? t('common.active') : t('common.inactive')"
            :color="item.active ? 'success' : 'warning'"
            variant="subtle"
          />
        </div>
        <dl class="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <template v-for="col in cardColumns" :key="col.id">
            <template v-if="displayCells(section, item, t)[col.id as CellKey]">
              <dt class="text-muted">{{ col.header }}</dt>
              <dd class="m-0 break-words">
                {{ displayCells(section, item, t)[col.id as CellKey] }}
              </dd>
            </template>
          </template>
        </dl>
        <div v-if="canWrite" class="flex flex-wrap gap-2">
          <UButton
            icon="i-lucide-pencil"
            :label="t('common.edit')"
            :aria-label="`${t('common.edit')} ${displayCells(section, item).title}`"
            color="neutral"
            variant="outline"
            size="sm"
            @click="openForm(item)"
          />
          <UButton
            v-if="!isSystem(item)"
            :icon="item.active ? 'i-lucide-eye-off' : 'i-lucide-eye'"
            :label="item.active ? t('catalog.deactivate') : t('catalog.activate')"
            :aria-label="`${item.active ? t('catalog.deactivate') : t('catalog.activate')} ${displayCells(section, item).title}`"
            color="neutral"
            variant="outline"
            size="sm"
            @click="toggleActive(item)"
          />
          <UButton
            icon="i-lucide-trash-2"
            :label="t('common.delete')"
            :aria-label="`${t('common.delete')} ${displayCells(section, item).title}`"
            color="neutral"
            variant="outline"
            size="sm"
            :disabled="!!deleteBlockedReason(item)"
            @click="askDelete(item)"
          />
        </div>
        <p v-if="canWrite && deleteBlockedReason(item)" class="m-0 text-xs text-muted">
          {{ deleteBlockedReason(item) }}
        </p>
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

    <CatalogFormDialog v-model:visible="formVisible" :section="section" :item="editing" />
  </div>
</template>
