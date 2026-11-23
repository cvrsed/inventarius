<script setup lang="ts">
import type { RoleDto } from '@inventarius/shared';
import UAlert from '@nuxt/ui/components/Alert.vue';
import UBadge from '@nuxt/ui/components/Badge.vue';
import UButton from '@nuxt/ui/components/Button.vue';
import { useToast } from '@nuxt/ui/composables/useToast';
import { computed, ref } from 'vue';
import ResponsiveTable from '@/shared/ui/ResponsiveTable.vue';
import IconAction from '@/shared/ui/IconAction.vue';
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

    <ResponsiveTable
      :data="data ?? []"
      :columns="columns"
      :loading="isPending"
      :get-row-id="(r: RoleDto) => r.id"
      :ui="{ td: 'whitespace-normal align-top px-2 xl:px-4', th: 'whitespace-nowrap px-2 xl:px-4' }"
      class="rounded-lg border border-default"
    >
      <template #empty>{{ t('roles.empty') }}</template>
      <template #description-cell="{ row }">
        <span
          class="line-clamp-2 max-w-xs xl:max-w-md break-words"
          :title="row.original.description ?? ''"
          >{{ row.original.description }}</span
        >
      </template>
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
          <IconAction
            icon="i-lucide-pencil"
            :label="t('common.edit')"
            :target="row.original.name"
            @click="open(row.original)"
          />
          <IconAction
            v-if="!row.original.isSystem"
            icon="i-lucide-trash-2"
            :label="t('common.delete')"
            :target="row.original.name"
            color="error"
            @click="askDelete(row.original)"
          />
        </span>
      </template>
      <template #card="{ item }">
        <div class="flex flex-wrap items-center gap-2">
          <span class="font-semibold text-highlighted">{{ item.name }}</span>
          <UBadge
            v-if="item.isSystem"
            :label="t('roles.system')"
            color="neutral"
            variant="subtle"
          />
        </div>
        <p class="m-0 text-sm text-muted">
          {{ t('roles.permissions') }}: {{ item.permissions.length }}
        </p>
        <div class="flex flex-wrap gap-2">
          <UButton
            icon="i-lucide-pencil"
            :label="t('common.edit')"
            :aria-label="`${t('common.edit')} ${item.name}`"
            color="neutral"
            variant="outline"
            size="sm"
            @click="open(item)"
          />
          <UButton
            v-if="!item.isSystem"
            icon="i-lucide-trash-2"
            :label="t('common.delete')"
            :aria-label="`${t('common.delete')} ${item.name}`"
            color="error"
            variant="outline"
            size="sm"
            @click="askDelete(item)"
          />
        </div>
      </template>
    </ResponsiveTable>

    <RoleFormDialog v-model:visible="formVisible" :role="editing" />
  </div>
</template>
