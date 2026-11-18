<script setup lang="ts">
import type { UserDto } from '@inventarius/shared';
import UAlert from '@nuxt/ui/components/Alert.vue';
import UBadge from '@nuxt/ui/components/Badge.vue';
import UButton from '@nuxt/ui/components/Button.vue';
import FilterToolbar from '@/shared/filters/FilterToolbar.vue';
import { useToast } from '@nuxt/ui/composables/useToast';
import { computed, ref, watchEffect } from 'vue';
import IconAction from '@/shared/ui/IconAction.vue';
import { useI18n } from 'vue-i18n';
import { errorMessage } from '@/features/auth/errors';
import ResponsiveTable from '@/shared/ui/ResponsiveTable.vue';
import PagedFooter from '@/shared/ui/PagedFooter.vue';
import { useConfirm } from '@/shared/ui/useConfirm';
import { useUserMutations, useUsersList, type UsersQuery } from './api';
import TempPasswordDialog from './TempPasswordDialog.vue';
import UserFormDialog from './UserFormDialog.vue';

const { t } = useI18n();
const confirm = useConfirm();
const toast = useToast();

const search = ref('');
const query = ref<UsersQuery>({ page: 1, pageSize: 10, q: '' });
const { data, isPending, isError, isFetching, refetch } = useUsersList(query);
const { resetPassword } = useUserMutations();

const page = computed({
  get: () => query.value.page,
  set: (v: number) => (query.value = { ...query.value, page: v }),
});
const pageSize = computed({
  get: () => query.value.pageSize,
  set: (v: number) => (query.value = { ...query.value, pageSize: v, page: 1 }),
});

const columns = computed(() => [
  { accessorKey: 'name', header: t('users.name') },
  { accessorKey: 'email', header: t('users.email') },
  { id: 'roles', header: t('users.roles') },
  { id: 'status', header: t('users.status') },
  { id: 'actions', header: t('common.actions') },
]);

let timer: ReturnType<typeof setTimeout> | undefined;
watchEffect(() => {
  const q = search.value.trim();
  clearTimeout(timer);
  timer = setTimeout(() => (query.value = { ...query.value, q, page: 1 }), 300);
});

const formVisible = ref(false);
const editing = ref<UserDto | null>(null);
const tempVisible = ref(false);
const tempPassword = ref('');

function openCreate(): void {
  editing.value = null;
  formVisible.value = true;
}
function openEdit(user: UserDto): void {
  editing.value = user;
  formVisible.value = true;
}

function askReset(user: UserDto): void {
  confirm.require({
    title: t('users.reset'),
    message: t('users.resetConfirm', { name: user.name }),
    acceptLabel: t('users.reset'),
    rejectLabel: t('common.cancel'),
    accept: async () => {
      try {
        tempPassword.value = (await resetPassword.mutateAsync(user)).temporaryPassword;
        tempVisible.value = true;
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
      <h1 class="m-0 text-2xl font-semibold text-highlighted">{{ t('users.title') }}</h1>
      <UButton icon="i-lucide-plus" :label="t('users.new')" @click="openCreate" />
    </div>

    <FilterToolbar
      v-model:search="search"
      search-id="users-search"
      :search-placeholder="t('users.search')"
      :defs="[]"
      :values="{}"
      :total="data?.meta.total"
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
      :data="data?.data ?? []"
      :columns="columns"
      :loading="isPending || isFetching"
      :get-row-id="(u: UserDto) => u.id"
      class="rounded-lg border border-default"
    >
      <template #empty>{{ search ? t('common.emptyFiltered') : t('users.empty') }}</template>
      <template #roles-cell="{ row }">
        <span class="flex flex-wrap gap-1">
          <UBadge
            v-for="r in row.original.roles"
            :key="r.id"
            :label="r.name"
            color="neutral"
            variant="subtle"
          />
        </span>
      </template>
      <template #status-cell="{ row }">
        <UBadge
          :label="row.original.active ? t('users.active') : t('users.inactive')"
          :color="row.original.active ? 'success' : 'warning'"
          variant="subtle"
        />
      </template>
      <template #actions-cell="{ row }">
        <span class="flex gap-1">
          <IconAction
            icon="i-lucide-pencil"
            :label="t('common.edit')"
            :target="row.original.name"
            @click="openEdit(row.original)"
          />
          <IconAction
            icon="i-lucide-key-round"
            :label="t('users.reset')"
            :target="row.original.name"
            @click="askReset(row.original)"
          />
        </span>
      </template>
      <template #card="{ item }">
        <div class="flex items-start justify-between gap-2">
          <span class="min-w-0 font-semibold text-highlighted break-words">{{ item.name }}</span>
          <UBadge
            :label="item.active ? t('users.active') : t('users.inactive')"
            :color="item.active ? 'success' : 'warning'"
            variant="subtle"
          />
        </div>
        <p class="m-0 text-sm break-all text-muted">{{ item.email }}</p>
        <span class="flex flex-wrap gap-1">
          <UBadge
            v-for="r in item.roles"
            :key="r.id"
            :label="r.name"
            color="neutral"
            variant="subtle"
          />
        </span>
        <div class="flex flex-wrap gap-2">
          <UButton
            icon="i-lucide-pencil"
            :label="t('common.edit')"
            :aria-label="`${t('common.edit')} ${item.name}`"
            color="neutral"
            variant="outline"
            size="sm"
            @click="openEdit(item)"
          />
          <UButton
            icon="i-lucide-key-round"
            :label="t('users.reset')"
            :aria-label="`${t('users.reset')} ${item.name}`"
            color="neutral"
            variant="outline"
            size="sm"
            @click="askReset(item)"
          />
        </div>
      </template>
    </ResponsiveTable>

    <PagedFooter
      v-model:page="page"
      v-model:page-size="pageSize"
      :total="data?.meta.total ?? 0"
      :page-sizes="[10, 25, 50]"
    />

    <UserFormDialog v-model:visible="formVisible" :user="editing" :creating="editing === null" />
    <TempPasswordDialog v-model:visible="tempVisible" :password="tempPassword" />
  </div>
</template>
