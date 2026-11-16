<script setup lang="ts">
import Button from 'primevue/button';
import Column from 'primevue/column';
import DataTable, { type DataTablePageEvent } from 'primevue/datatable';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import Select from 'primevue/select';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAuditList, type AuditQuery } from './api';

const { t, te, d } = useI18n();

const blank: AuditQuery = { page: 1, pageSize: 25, entity: '', action: '', from: '', to: '' };
const query = ref<AuditQuery>({ ...blank });
const { data, isPending, isFetching, isError, refetch } = useAuditList(query);
const expanded = ref<Record<string, boolean>>({});

const entityOptions = computed(() => [
  { value: '', label: t('audit.all') },
  { value: 'user', label: t('audit.entities.user') },
  { value: 'role', label: t('audit.entities.role') },
]);
const FILTERABLE_ACTIONS = [
  'auth.login',
  'auth.login_failed',
  'auth.logout',
  'auth.change_password',
  'user.create',
  'user.update',
  'user.deactivate',
  'user.reset_password',
  'role.create',
  'role.update',
  'role.delete',
] as const;
const actionOptions = computed(() => [
  { value: '', label: t('audit.all') },
  ...FILTERABLE_ACTIONS.map((value) => ({ value, label: t(`audit.actions.${value}`) })),
]);

const actionLabel = (a: string) => (te(`audit.actions.${a}`) ? t(`audit.actions.${a}`) : a);
const entityLabel = (e: string) => (te(`audit.entities.${e}`) ? t(`audit.entities.${e}`) : e);

function setFilter(patch: Partial<AuditQuery>): void {
  query.value = { ...query.value, ...patch, page: 1 };
}
function onPage(e: DataTablePageEvent): void {
  query.value = { ...query.value, page: e.page + 1, pageSize: e.rows };
}
const pretty = (value: unknown) => JSON.stringify(value, null, 2);
</script>

<template>
  <div class="flex flex-col gap-4">
    <h1 class="m-0 text-2xl font-semibold">{{ t('audit.title') }}</h1>

    <form class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5" @submit.prevent>
      <div class="flex flex-col gap-1">
        <label id="f-entity-label">{{ t('audit.filterEntity') }}</label>
        <Select
          input-id="f-entity"
          aria-labelledby="f-entity-label"
          :placeholder="t('audit.all')"
          :model-value="query.entity"
          :options="entityOptions"
          option-label="label"
          option-value="value"
          fluid
          @update:model-value="(v: string) => setFilter({ entity: v })"
        />
      </div>
      <div class="flex flex-col gap-1">
        <label id="f-action-label">{{ t('audit.filterAction') }}</label>
        <Select
          input-id="f-action"
          aria-labelledby="f-action-label"
          :placeholder="t('audit.all')"
          :model-value="query.action"
          :options="actionOptions"
          option-label="label"
          option-value="value"
          fluid
          @update:model-value="(v: string) => setFilter({ action: v })"
        />
      </div>
      <div class="flex flex-col gap-1">
        <label for="f-from">{{ t('audit.filterFrom') }}</label>
        <InputText
          id="f-from"
          :model-value="query.from"
          type="date"
          fluid
          @update:model-value="(v) => setFilter({ from: v ?? '' })"
        />
      </div>
      <div class="flex flex-col gap-1">
        <label for="f-to">{{ t('audit.filterTo') }}</label>
        <InputText
          id="f-to"
          :model-value="query.to"
          type="date"
          fluid
          @update:model-value="(v) => setFilter({ to: v ?? '' })"
        />
      </div>
      <div class="flex items-end">
        <Button
          class="app-touch"
          type="button"
          :label="t('audit.clear')"
          severity="secondary"
          outlined
          @click="query = { ...blank }"
        />
      </div>
    </form>

    <Message v-if="isError" severity="error" :closable="false" role="alert">
      {{ t('common.genericError') }}
      <Button class="ml-2" :label="t('common.retry')" size="small" text @click="refetch()" />
    </Message>

    <DataTable
      v-model:expanded-rows="expanded"
      :value="data?.data ?? []"
      :loading="isPending || isFetching"
      lazy
      paginator
      :rows="query.pageSize"
      :rows-per-page-options="[25, 50, 100]"
      :total-records="data?.meta.total ?? 0"
      :first="(query.page - 1) * query.pageSize"
      breakpoint="768px"
      data-key="id"
      @page="onPage"
    >
      <template #empty>{{ t('audit.empty') }}</template>
      <Column expander style="width: 3rem" :header="t('audit.detail')" />
      <Column :header="t('audit.when')">
        <template #body="{ data: e }">{{ d(new Date(e.at), 'long') }}</template>
      </Column>
      <Column :header="t('audit.who')">
        <template #body="{ data: e }">{{ e.actorName ?? t('audit.system') }}</template>
      </Column>
      <Column :header="t('audit.action')">
        <template #body="{ data: e }">{{ actionLabel(e.action) }}</template>
      </Column>
      <Column :header="t('audit.entity')">
        <template #body="{ data: e }">{{ entityLabel(e.entity) }}</template>
      </Column>
      <Column field="ip" :header="t('audit.ip')" />
      <template #expansion="{ data: e }">
        <pre v-if="e.diff" class="m-0 overflow-x-auto text-sm">{{ pretty(e.diff) }}</pre>
        <p v-else class="app-muted m-0">—</p>
      </template>
    </DataTable>
  </div>
</template>
