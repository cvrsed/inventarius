<script setup lang="ts">
import type { UserDto } from '@inventarius/shared';
import Button from 'primevue/button';
import Column from 'primevue/column';
import DataTable, { type DataTablePageEvent } from 'primevue/datatable';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import Tag from 'primevue/tag';
import { useConfirm } from 'primevue/useconfirm';
import { useToast } from 'primevue/usetoast';
import { ref, watchEffect } from 'vue';
import { useI18n } from 'vue-i18n';
import { errorMessage } from '@/features/auth/errors';
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
function onPage(e: DataTablePageEvent): void {
  query.value = { ...query.value, page: e.page + 1, pageSize: e.rows };
}

function askReset(user: UserDto): void {
  confirm.require({
    header: t('users.reset'),
    message: t('users.resetConfirm', { name: user.name }),
    icon: 'pi pi-exclamation-triangle',
    acceptLabel: t('users.reset'),
    rejectLabel: t('common.cancel'),
    rejectProps: { severity: 'secondary', text: true },
    accept: async () => {
      try {
        tempPassword.value = (await resetPassword.mutateAsync(user)).temporaryPassword;
        tempVisible.value = true;
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
      <h1 class="m-0 text-2xl font-semibold">{{ t('users.title') }}</h1>
      <Button class="app-touch" icon="pi pi-plus" :label="t('users.new')" @click="openCreate" />
    </div>

    <div class="flex flex-col gap-1">
      <label for="users-search" class="sr-only">{{ t('users.search') }}</label>
      <InputText
        id="users-search"
        v-model="search"
        type="search"
        :placeholder="t('users.search')"
        fluid
      />
    </div>

    <Message v-if="isError" severity="error" :closable="false" role="alert">
      {{ t('common.genericError') }}
      <Button class="ml-2" :label="t('common.retry')" size="small" text @click="refetch()" />
    </Message>

    <DataTable
      :value="data?.data ?? []"
      :loading="isPending || isFetching"
      lazy
      paginator
      :rows="query.pageSize"
      :rows-per-page-options="[10, 25, 50]"
      :total-records="data?.meta.total ?? 0"
      :first="(query.page - 1) * query.pageSize"
      breakpoint="768px"
      data-key="id"
      @page="onPage"
    >
      <template #empty>{{ search ? t('common.emptyFiltered') : t('users.empty') }}</template>
      <Column field="name" :header="t('users.name')" />
      <Column field="email" :header="t('users.email')" />
      <Column :header="t('users.roles')">
        <template #body="{ data: u }">
          <span class="flex flex-wrap gap-1">
            <Tag v-for="r in u.roles" :key="r.id" :value="r.name" severity="secondary" />
          </span>
        </template>
      </Column>
      <Column :header="t('users.status')">
        <template #body="{ data: u }">
          <Tag
            :value="u.active ? t('users.active') : t('users.inactive')"
            :severity="u.active ? 'success' : 'warn'"
          />
        </template>
      </Column>
      <Column :header="t('common.actions')">
        <template #body="{ data: u }">
          <span class="flex gap-1">
            <Button
              class="app-touch"
              icon="pi pi-pencil"
              :aria-label="`${t('common.edit')} ${u.name}`"
              severity="secondary"
              text
              rounded
              @click="openEdit(u)"
            />
            <Button
              class="app-touch"
              icon="pi pi-key"
              :aria-label="`${t('users.reset')} ${u.name}`"
              severity="secondary"
              text
              rounded
              @click="askReset(u)"
            />
          </span>
        </template>
      </Column>
    </DataTable>

    <UserFormDialog v-model:visible="formVisible" :user="editing" :creating="editing === null" />
    <TempPasswordDialog v-model:visible="tempVisible" :password="tempPassword" />
  </div>
</template>
