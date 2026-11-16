<script setup lang="ts">
import type { Permission, RoleDto } from '@inventarius/shared';
import Button from 'primevue/button';
import Checkbox from 'primevue/checkbox';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import Textarea from 'primevue/textarea';
import { useToast } from 'primevue/usetoast';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { errorMessage } from '@/features/auth/errors';
import { ApiError } from '@/shared/api/http';
import { usePermissionCatalog, useRoleMutations } from './api';

const props = defineProps<{ role: RoleDto | null }>();
const visible = defineModel<boolean>('visible', { required: true });

const { t } = useI18n();
const toast = useToast();
const catalog = usePermissionCatalog();
const { create, update } = useRoleMutations();

const form = ref({ name: '', description: '', permissions: [] as Permission[] });
const error = ref('');
const nameError = ref('');
const creating = computed(() => props.role === null);
const locked = computed(() => props.role?.isProtected ?? false);
const submitting = computed(() => create.isPending.value || update.isPending.value);

watch(
  () => [visible.value, props.role] as const,
  ([open, role]) => {
    if (!open) return;
    error.value = '';
    nameError.value = '';
    form.value = {
      name: role?.name ?? '',
      description: role?.description ?? '',
      permissions: [...(role?.permissions ?? [])],
    };
  },
  { immediate: true },
);

async function submit(): Promise<void> {
  error.value = '';
  nameError.value = form.value.name.trim() ? '' : t('common.required');
  if (nameError.value) return;
  try {
    const input = {
      name: form.value.name.trim(),
      description: form.value.description.trim(),
      permissions: form.value.permissions,
    };
    if (props.role) {
      await update.mutateAsync({
        role: props.role,
        patch: locked.value ? { description: input.description } : input,
      });
    } else {
      await create.mutateAsync(input);
    }
    toast.add({
      severity: 'success',
      summary: creating.value ? t('roles.created') : t('common.saved'),
      life: 4000,
    });
    visible.value = false;
  } catch (e) {
    error.value = errorMessage(e, t);
    if (e instanceof ApiError && e.status === 412) visible.value = false;
  }
}
</script>

<template>
  <Dialog
    v-model:visible="visible"
    modal
    :header="creating ? t('roles.new') : t('roles.edit')"
    :style="{ width: '34rem' }"
    :breakpoints="{ '640px': '94vw' }"
  >
    <form id="role-form" class="flex flex-col gap-4" novalidate @submit.prevent="submit">
      <Message v-if="error" severity="error" :closable="false" role="alert">{{ error }}</Message>
      <Message v-if="locked" severity="info" :closable="false">{{ t('roles.protected') }}</Message>

      <div class="flex flex-col gap-1">
        <label for="r-name">{{ t('roles.name') }}</label>
        <InputText
          id="r-name"
          v-model="form.name"
          :disabled="role?.isSystem"
          :invalid="!!nameError"
          fluid
        />
        <small v-if="nameError" class="field-error" role="alert">{{ nameError }}</small>
      </div>
      <div class="flex flex-col gap-1">
        <label for="r-desc">{{ t('roles.description') }}</label>
        <Textarea id="r-desc" v-model="form.description" rows="2" auto-resize fluid />
      </div>

      <fieldset class="m-0 flex flex-col gap-2 border-0 p-0">
        <legend class="mb-2 font-semibold">{{ t('roles.permissions') }}</legend>
        <div
          v-for="p in catalog.data.value ?? []"
          :key="p"
          class="app-touch flex items-center gap-3"
        >
          <Checkbox
            v-model="form.permissions"
            :input-id="`perm-${p}`"
            :value="p"
            :disabled="locked"
          />
          <label :for="`perm-${p}`">{{ t(`permissions.${p}`) }}</label>
        </div>
      </fieldset>
    </form>
    <template #footer>
      <Button
        class="app-touch"
        :label="t('common.cancel')"
        severity="secondary"
        text
        @click="visible = false"
      />
      <Button
        class="app-touch"
        type="submit"
        form="role-form"
        :label="t('common.save')"
        :loading="submitting"
      />
    </template>
  </Dialog>
</template>
