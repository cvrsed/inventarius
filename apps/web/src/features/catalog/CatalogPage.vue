<script setup lang="ts">
import UAlert from '@nuxt/ui/components/Alert.vue';
import UBadge from '@nuxt/ui/components/Badge.vue';
import UButton from '@nuxt/ui/components/Button.vue';
import UInput from '@nuxt/ui/components/Input.vue';
import UTable from '@nuxt/ui/components/Table.vue';
import { useToast } from '@nuxt/ui/composables/useToast';
import { computed, onBeforeUnmount, ref, toRef, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import { errorMessage } from '@/features/auth/errors';
import { useAuthStore } from '@/features/auth/useAuthStore';
import { useListQuery } from '@/shared/list/useListQuery';
import AppSelect from '@/shared/ui/AppSelect.vue';
import IconAction from '@/shared/ui/IconAction.vue';
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
const canWrite = computed(() => auth.can('catalog:write'));

const { query, update, setPage } = useListQuery({ page: 1, pageSize: 25, q: '', active: '' });
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
const activeItems = computed(() => [
  { label: t('common.all'), value: '' },
  { label: t('common.active'), value: 'true' },
  { label: t('common.inactive'), value: 'false' },
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

    <nav :aria-label="t('catalog.tabsLabel')" class="-mx-4 overflow-x-auto px-4">
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

    <div class="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_12rem]">
      <UInput
        v-model="search"
        type="search"
        :placeholder="
          t('catalog.searchLabel', { section: t(`catalog.sections.${section}`).toLowerCase() })
        "
        :aria-label="
          t('catalog.searchLabel', { section: t(`catalog.sections.${section}`).toLowerCase() })
        "
        class="w-full"
      />
      <AppSelect
        :model-value="query.active"
        :items="activeItems"
        :aria-label="t('catalog.stateFilter')"
        @update:model-value="(v: string | number) => update({ active: String(v) })"
      />
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

    <UTable
      :data="data?.data ?? []"
      :columns="columns"
      :loading="isPending || isFetching"
      :get-row-id="(i: CatalogItem) => i.id"
      class="rounded-lg border border-default"
    >
      <template #empty>{{
        query.q || query.active ? t('common.emptyFiltered') : t(`catalog.empty.${section}`)
      }}</template>
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
    </UTable>

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
