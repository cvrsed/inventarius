<script setup lang="ts">
import UPagination from '@nuxt/ui/components/Pagination.vue';
import AppSelect from './AppSelect.vue';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

/** Página + filas por página sobre un total conocido (RNF-02, 360 px). */
const props = defineProps<{ total: number; pageSizes: number[] }>();
const page = defineModel<number>('page', { required: true });
const pageSize = defineModel<number>('pageSize', { required: true });

const { t } = useI18n();
const sizeItems = computed(() => props.pageSizes.map((n) => ({ label: String(n), value: n })));
</script>

<template>
  <div class="flex flex-wrap items-center justify-between gap-3">
    <div class="flex items-center gap-2 text-sm">
      <span id="page-size-label" class="text-muted">{{ t('common.rowsPerPage') }}</span>
      <AppSelect
        :model-value="pageSize"
        :items="sizeItems"
        aria-labelledby="page-size-label"
        class="w-24"
        @update:model-value="(v: string | number) => (pageSize = Number(v))"
      />
    </div>
    <UPagination
      v-model:page="page"
      class="max-w-full overflow-x-auto"
      :items-per-page="pageSize"
      :total="total"
      :sibling-count="1"
    />
  </div>
</template>
