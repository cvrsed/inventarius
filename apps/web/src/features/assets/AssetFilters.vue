<script setup lang="ts">
import UButton from '@nuxt/ui/components/Button.vue';
import UFormField from '@nuxt/ui/components/FormField.vue';
import { computed, ref, toRef, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { fetchOptions, useOptionById } from '@/features/catalog/api';
import type { Section } from '@/features/catalog/entities';
import AppSelect from '@/shared/ui/AppSelect.vue';
import RemoteSelect, { type RemoteOption } from '@/shared/ui/RemoteSelect.vue';
import { fetchAssignees, useAssigneeById, type AssetListState } from './api';

const props = defineProps<{ state: AssetListState }>();
const emit = defineEmits<{ change: [patch: Partial<AssetListState>]; clear: [] }>();
const { t } = useI18n();

type RefKey = 'statusId' | 'categoryId' | 'modelId' | 'locationId' | 'baseLocationId';
interface RefFilter {
  key: RefKey;
  section: Section;
  label: string;
}
/** Los tres que se usan casi siempre van a la vista (RF-22). */
const MAIN_FILTERS: RefFilter[] = [
  { key: 'statusId', section: 'statuses', label: 'assets.filterStatus' },
  { key: 'categoryId', section: 'categories', label: 'assets.filterCategory' },
  { key: 'baseLocationId', section: 'locations', label: 'assets.filterBaseLocation' },
];
const MORE_REF_FILTERS: RefFilter[] = [
  { key: 'modelId', section: 'models', label: 'assets.filterModel' },
  { key: 'locationId', section: 'locations', label: 'assets.filterLocation' },
];

/** Nombres de lo que viene en la URL, para mostrarlo en cada selector. */
const labels = {
  statusId: useOptionById(
    'statuses',
    toRef(() => props.state.statusId),
  ),
  categoryId: useOptionById(
    'categories',
    toRef(() => props.state.categoryId),
  ),
  modelId: useOptionById(
    'models',
    toRef(() => props.state.modelId),
  ),
  locationId: useOptionById(
    'locations',
    toRef(() => props.state.locationId),
  ),
  baseLocationId: useOptionById(
    'locations',
    toRef(() => props.state.baseLocationId),
  ),
};
const assignee = useAssigneeById(toRef(() => props.state.assignedUserId));

const selected = (key: RefKey): RemoteOption | null => labels[key].data.value ?? null;
/**
 * Solo avisa si el filtro realmente cambió: al cargar una URL compartida el selector puede emitir su valor
 * inicial, y eso no debe mandar al usuario a la página 1.
 */
function change(key: RefKey | 'assignedUserId', v: RemoteOption | null): void {
  const next = v?.id ?? '';
  if (next !== props.state[key]) emit('change', { [key]: next });
}
const onRef = (key: RefKey, v: RemoteOption | null) => change(key, v);

const hasFilters = computed(
  () =>
    props.state.statusId !== '' ||
    props.state.categoryId !== '' ||
    props.state.modelId !== '' ||
    props.state.locationId !== '' ||
    props.state.assignedUserId !== '' ||
    props.state.baseLocationId !== '' ||
    props.state.statusKind !== '' ||
    props.state.assigned !== '' ||
    props.state.overdue !== '' ||
    props.state.deleted !== 'exclude',
);
/** Hay algún filtro de «Más filtros» activo (p. ej. al llegar desde el Inicio): el panel se abre solo. */
const moreActive = computed(
  () =>
    props.state.modelId !== '' ||
    props.state.locationId !== '' ||
    props.state.assignedUserId !== '' ||
    props.state.statusKind !== '' ||
    props.state.assigned !== '' ||
    props.state.overdue !== '' ||
    props.state.deleted !== 'exclude',
);
const moreOpen = ref(moreActive.value);
watch(moreActive, (active) => {
  if (active) moreOpen.value = true;
});

const statusKindItems = computed(() => [
  { value: '', label: t('common.all') },
  ...(['deployable', 'pending', 'undeployable', 'archived'] as const).map((value) => ({
    value,
    label: t(`assets.statusKindOptions.${value}`),
  })),
]);
const assignedItems = computed(() => [
  { value: '', label: t('common.all') },
  { value: 'yes', label: t('assets.assignedOptions.yes') },
  { value: 'no', label: t('assets.assignedOptions.no') },
]);
const overdueItems = computed(() => [
  { value: '', label: t('common.all') },
  { value: 'true', label: t('assets.overdueOption') },
]);
const deletedItems = computed(() =>
  (['exclude', 'include', 'only'] as const).map((value) => ({
    value,
    label: t(`assets.deletedOptions.${value}`),
  })),
);
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <UFormField
        v-for="f in MAIN_FILTERS"
        :key="f.key"
        :label="t(f.label)"
        :name="`filter-${f.key}`"
      >
        <RemoteSelect
          :id="`filter-${f.key}`"
          :model-value="selected(f.key)"
          :source="`${f.section}-filter`"
          :fetcher="(q: string) => fetchOptions(f.section, q, { all: true })"
          :placeholder="t('common.all')"
          clearable
          @update:model-value="(v: RemoteOption | null) => onRef(f.key, v)"
        />
      </UFormField>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <UButton
        type="button"
        :icon="moreOpen ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
        :label="t('assets.moreFilters')"
        color="neutral"
        variant="outline"
        :aria-expanded="moreOpen"
        aria-controls="asset-more-filters"
        @click="moreOpen = !moreOpen"
      />
      <UButton
        icon="i-lucide-x"
        color="neutral"
        variant="ghost"
        :label="t('common.clearFilters')"
        :disabled="!hasFilters"
        @click="emit('clear')"
      />
    </div>

    <div
      v-show="moreOpen"
      id="asset-more-filters"
      class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
    >
      <UFormField
        v-for="f in MORE_REF_FILTERS"
        :key="f.key"
        :label="t(f.label)"
        :name="`filter-${f.key}`"
      >
        <RemoteSelect
          :id="`filter-${f.key}`"
          :model-value="selected(f.key)"
          :source="`${f.section}-filter`"
          :fetcher="(q: string) => fetchOptions(f.section, q, { all: true })"
          :placeholder="t('common.all')"
          clearable
          @update:model-value="(v: RemoteOption | null) => onRef(f.key, v)"
        />
      </UFormField>
      <UFormField :label="t('assets.filterAssignee')" name="filter-assignee">
        <RemoteSelect
          id="filter-assignee"
          :model-value="assignee.data.value ?? null"
          source="assignees-filter"
          :fetcher="fetchAssignees"
          :placeholder="t('common.all')"
          clearable
          @update:model-value="(v: RemoteOption | null) => change('assignedUserId', v)"
        />
      </UFormField>
      <UFormField :label="t('assets.filterStatusKind')" name="filter-status-kind">
        <AppSelect
          id="filter-status-kind"
          :model-value="state.statusKind"
          :items="statusKindItems"
          class="w-full"
          @update:model-value="(v: string | number) => emit('change', { statusKind: String(v) })"
        />
      </UFormField>
      <UFormField :label="t('assets.filterAssigned')" name="filter-assigned">
        <AppSelect
          id="filter-assigned"
          :model-value="state.assigned"
          :items="assignedItems"
          class="w-full"
          @update:model-value="(v: string | number) => emit('change', { assigned: String(v) })"
        />
      </UFormField>
      <UFormField :label="t('assets.filterOverdue')" name="filter-overdue">
        <AppSelect
          id="filter-overdue"
          :model-value="state.overdue"
          :items="overdueItems"
          class="w-full"
          @update:model-value="(v: string | number) => emit('change', { overdue: String(v) })"
        />
      </UFormField>
      <UFormField :label="t('assets.filterDeleted')" name="filter-deleted">
        <AppSelect
          id="filter-deleted"
          :model-value="state.deleted"
          :items="deletedItems"
          class="w-full"
          @update:model-value="(v: string | number) => emit('change', { deleted: String(v) })"
        />
      </UFormField>
    </div>
  </div>
</template>
