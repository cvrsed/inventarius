<script setup lang="ts">
import type { RoleDto } from '@inventarius/shared';
import UAlert from '@nuxt/ui/components/Alert.vue';
import UBadge from '@nuxt/ui/components/Badge.vue';
import UButton from '@nuxt/ui/components/Button.vue';
import UTable from '@nuxt/ui/components/Table.vue';
import { useToast } from '@nuxt/ui/composables/useToast';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { errorMessage } from '@/features/auth/errors';
import { useConfirm } from '@/shared/ui/useConfirm';
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

const columns = computed(() => [
  { id: 'name', header: t('roles.name') },
  { accessorKey: 'description', header: t('roles.description') },
  { id: 'permissions', header: t('roles.permissions') },
  { accessorKey: 'userCount', header: t('roles.users') },
  { id: 'actions', header: t('common.actions') },
]);

function askDelete(role: RoleDto): void {
  confirm.require({
    title: t('common.delete'),
    message: t('roles.deleteConfirm', { name: role.name }),
    acceptLabel: t('common.delete'),
    rejectLabel: t('common.cancel'),
    danger: true,
    accept: async () => {
      try {
        await remove.mutateAsync(role);
        toast.add({ title: t('roles.deleted'), color: 'success', duration: 4000 });
      } catch (e) {
        toast.add({ title: errorMessage(e, t), color: 'error', duration: 6000 });
      }
    },
  });
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h1 class="m-0 text-2xl font-semibold text-highlighted">{{ t('roles.title') }}</h1>
      <UButton icon="i-lucide-plus" :label="t('roles.new')" @click="open(null)" />
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
      :data="data ?? []"
      :columns="columns"
      :loading="isPending"
      :get-row-id="(r: RoleDto) => r.id"
      class="rounded-lg border border-default"
    >
      <template #empty>{{ t('roles.empty') }}</template>
      <template #name-cell="{ row }">
        <span class="flex flex-wrap items-center gap-2">
          {{ row.original.name }}
          <UBadge
            v-if="row.original.isSystem"
            :label="t('roles.system')"
            color="neutral"
            variant="subtle"
          />
        </span>
      </template>
      <template #permissions-cell="{ row }">{{ row.original.permissions.length }}</template>
      <template #actions-cell="{ row }">
        <span class="flex gap-1">
          <UButton
            icon="i-lucide-pencil"
            :aria-label="`${t('common.edit')} ${row.original.name}`"
            color="neutral"
            variant="ghost"
            @click="open(row.original)"
          />
          <UButton
            v-if="!row.original.isSystem"
            icon="i-lucide-trash-2"
            :aria-label="`${t('common.delete')} ${row.original.name}`"
            color="error"
            variant="ghost"
            @click="askDelete(row.original)"
          />
        </span>
      </template>
    </UTable>

    <RoleFormDialog v-model:visible="formVisible" :role="editing" />
  </div>
</template>
