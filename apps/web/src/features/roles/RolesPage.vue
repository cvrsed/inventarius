<script setup lang="ts">
import type { RoleDto } from '@inventarius/shared';
import Button from 'primevue/button';
import Column from 'primevue/column';
import DataTable from 'primevue/datatable';
import Message from 'primevue/message';
import Tag from 'primevue/tag';
import { useConfirm } from 'primevue/useconfirm';
import { useToast } from 'primevue/usetoast';
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { errorMessage } from '@/features/auth/errors';
import { useRoleMutations, useRoles } from './api';
import RoleFormDialog from './RoleFormDialog.vue';

const { t } = useI18n();
const confirm = useConfirm();
const toast = useToast();
const { data, isPending, isError, refetch } = useRoles();
const { remove } = useRoleMutations();

const formVisible = ref(false);
const editing = ref<RoleDto | null>(null);

function open(role: RoleDto | null): void {
  editing.value = role;
  formVisible.value = true;
}

function askDelete(role: RoleDto): void {
  confirm.require({
    header: t('common.delete'),
    message: t('roles.deleteConfirm', { name: role.name }),
    icon: 'pi pi-exclamation-triangle',
    acceptLabel: t('common.delete'),
    acceptProps: { severity: 'danger' },
    rejectLabel: t('common.cancel'),
    rejectProps: { severity: 'secondary', text: true },
    accept: async () => {
      try {
        await remove.mutateAsync(role);
        toast.add({ severity: 'success', summary: t('roles.deleted'), life: 4000 });
      } catch (e) {
        toast.add({ severity: 'error', summary: errorMessage(e, t), life: 6000 });
      }
    },
  });
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h1 class="m-0 text-2xl font-semibold">{{ t('roles.title') }}</h1>
      <Button class="app-touch" icon="pi pi-plus" :label="t('roles.new')" @click="open(null)" />
    </div>

    <Message v-if="isError" severity="error" :closable="false" role="alert">
      {{ t('common.genericError') }}
      <Button class="ml-2" :label="t('common.retry')" size="small" text @click="refetch()" />
    </Message>

    <DataTable :value="data ?? []" :loading="isPending" breakpoint="768px" data-key="id">
      <template #empty>{{ t('roles.empty') }}</template>
      <Column :header="t('roles.name')">
        <template #body="{ data: r }">
          <span class="flex flex-wrap items-center gap-2">
            {{ r.name }}
            <Tag v-if="r.isSystem" :value="t('roles.system')" severity="secondary" />
          </span>
        </template>
      </Column>
      <Column field="description" :header="t('roles.description')" />
      <Column :header="t('roles.permissions')">
        <template #body="{ data: r }">{{ r.permissions.length }}</template>
      </Column>
      <Column field="userCount" :header="t('roles.users')" />
      <Column :header="t('common.actions')">
        <template #body="{ data: r }">
          <span class="flex gap-1">
            <Button
              class="app-touch"
              icon="pi pi-pencil"
              :aria-label="`${t('common.edit')} ${r.name}`"
              severity="secondary"
              text
              rounded
              @click="open(r)"
            />
            <Button
              v-if="!r.isSystem"
              class="app-touch"
              icon="pi pi-trash"
              :aria-label="`${t('common.delete')} ${r.name}`"
              severity="danger"
              text
              rounded
              @click="askDelete(r)"
            />
          </span>
        </template>
      </Column>
    </DataTable>

    <RoleFormDialog v-model:visible="formVisible" :role="editing" />
  </div>
</template>
