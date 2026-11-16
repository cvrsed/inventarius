<script setup lang="ts">
import UButton from '@nuxt/ui/components/Button.vue';
import UFormField from '@nuxt/ui/components/FormField.vue';
import { computed, toRef } from 'vue';
import { useI18n } from 'vue-i18n';
import { fetchOptions, useOptionById } from '@/features/catalog/api';
import type { Section } from '@/features/catalog/entities';
import AppSelect from '@/shared/ui/AppSelect.vue';
import RemoteSelect, { type RemoteOption } from '@/shared/ui/RemoteSelect.vue';
import { fetchAssignees, useAssigneeById, type AssetListState } from './api';

const props = defineProps<{ state: AssetListState }>();
const emit = defineEmits<{ change: [patch: Partial<AssetListState>]; clear: [] }>();
const { t } = useI18n();

type RefKey = 'statusId' | 'categoryId' | 'modelId' | 'locationId';
const REF_FILTERS: { key: RefKey; section: Section; label: string }[] = [
  { key: 'statusId', section: 'statuses', label: 'assets.filterStatus' },
  { key: 'categoryId', section: 'categories', label: 'assets.filterCategory' },
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
};
const assignee = useAssigneeById(toRef(() => props.state.assignedUserId));

const selected = (key: RefKey): RemoteOption | null => labels[key].data.value ?? null;
const onRef = (key: RefKey, v: RemoteOption | null) => emit('change', { [key]: v?.id ?? '' });

const hasFilters = computed(
  () =>
    props.state.statusId !== '' ||
    props.state.categoryId !== '' ||
    props.state.modelId !== '' ||
    props.state.locationId !== '' ||
    props.state.assignedUserId !== '' ||
    props.state.deleted !== 'exclude',
);
const deletedItems = computed(() =>
  (['exclude', 'include', 'only'] as const).map((value) => ({
    value,
    label: t(`assets.deletedOptions.${value}`),
  })),
);
</script>

<template>
  <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
    <UFormField v-for="f in REF_FILTERS" :key="f.key" :label="t(f.label)" :name="`filter-${f.key}`">
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
        @update:model-value="
          (v: RemoteOption | null) => emit('change', { assignedUserId: v?.id ?? '' })
        "
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
    <div v-if="hasFilters" class="flex items-end">
      <UButton
        icon="i-lucide-x"
        color="neutral"
        variant="ghost"
        :label="t('common.clearFilters')"
        @click="emit('clear')"
      />
    </div>
  </div>
</template>
