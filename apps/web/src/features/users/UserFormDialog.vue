<script setup lang="ts">
import type { UserDto } from '@inventarius/shared';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import MultiSelect from 'primevue/multiselect';
import ToggleSwitch from 'primevue/toggleswitch';
import { useToast } from 'primevue/usetoast';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { errorMessage } from '@/features/auth/errors';
import { ApiError } from '@/shared/api/http';
import PasswordField from '@/shared/ui/PasswordField.vue';
import { useRolesQuery, useUserMutations } from './api';

const props = defineProps<{ user: UserDto | null; creating: boolean }>();
const visible = defineModel<boolean>('visible', { required: true });

const { t } = useI18n();
const toast = useToast();
const roles = useRolesQuery();
const { create, update } = useUserMutations();

const form = ref({ name: '', email: '', password: '', active: true, roleIds: [] as string[] });
const fieldErrors = ref<Record<string, string>>({});
const error = ref('');
const submitting = computed(() => create.isPending.value || update.isPending.value);

watch(
  () => [visible.value, props.user] as const,
  ([open, user]) => {
    if (!open) return;
    fieldErrors.value = {};
    error.value = '';
    form.value = {
      name: user?.name ?? '',
      email: user?.email ?? '',
      password: '',
      active: user?.active ?? true,
      roleIds: user?.roles.map((r) => r.id) ?? [],
    };
  },
  { immediate: true },
);

function validate(): boolean {
  const e: Record<string, string> = {};
  if (!form.value.name.trim()) e['name'] = t('common.required');
  if (props.creating) {
    if (!/^\S+@\S+\.\S+$/.test(form.value.email.trim())) e['email'] = t('login.invalidEmail');
    if (form.value.password.length < 12) e['password'] = t('changePassword.tooShort');
  }
  if (!form.value.roleIds.length) e['roleIds'] = t('common.required');
  fieldErrors.value = e;
  return Object.keys(e).length === 0;
}

async function submit(): Promise<void> {
  error.value = '';
  if (!validate()) return;
  try {
    if (props.creating) {
      await create.mutateAsync({
        email: form.value.email.trim(),
        name: form.value.name.trim(),
        roleIds: form.value.roleIds,
        password: form.value.password,
      });
      toast.add({ severity: 'success', summary: t('users.created'), life: 4000 });
    } else if (props.user) {
      await update.mutateAsync({
        user: props.user,
        patch: {
          name: form.value.name.trim(),
          active: form.value.active,
          roleIds: form.value.roleIds,
        },
      });
      toast.add({ severity: 'success', summary: t('common.saved'), life: 4000 });
    }
    visible.value = false;
  } catch (e) {
    if (
      e instanceof ApiError &&
      (e.status === 422 || e.status === 400) &&
      Object.keys(e.fieldErrors).length
    ) {
      fieldErrors.value = Object.fromEntries(
        Object.entries(e.fieldErrors).map(([k, v]) => [
          k === 'newPassword' ? 'password' : k,
          v.join(' '),
        ]),
      );
    } else {
      error.value = errorMessage(e, t);
      if (e instanceof ApiError && e.status === 412) visible.value = false;
    }
  }
}
</script>

<template>
  <Dialog
    v-model:visible="visible"
    modal
    :header="creating ? t('users.new') : t('users.edit')"
    :style="{ width: '32rem' }"
    :breakpoints="{ '640px': '94vw' }"
  >
    <form id="user-form" class="flex flex-col gap-4" novalidate @submit.prevent="submit">
      <Message v-if="error" severity="error" :closable="false" role="alert">{{ error }}</Message>

      <div class="flex flex-col gap-1">
        <label for="u-name">{{ t('users.name') }}</label>
        <InputText
          id="u-name"
          v-model="form.name"
          autocomplete="off"
          :invalid="!!fieldErrors['name']"
          fluid
        />
        <small v-if="fieldErrors['name']" class="field-error" role="alert">{{
          fieldErrors['name']
        }}</small>
      </div>

      <div class="flex flex-col gap-1">
        <label for="u-email">{{ t('users.email') }}</label>
        <InputText
          id="u-email"
          v-model="form.email"
          type="email"
          autocomplete="off"
          :disabled="!creating"
          :invalid="!!fieldErrors['email']"
          fluid
        />
        <small v-if="fieldErrors['email']" class="field-error" role="alert">{{
          fieldErrors['email']
        }}</small>
      </div>

      <div class="flex flex-col gap-1">
        <label for="u-roles">{{ t('users.roles') }}</label>
        <MultiSelect
          v-model="form.roleIds"
          input-id="u-roles"
          :options="roles.data.value ?? []"
          option-label="name"
          option-value="id"
          display="chip"
          :invalid="!!fieldErrors['roleIds']"
          fluid
        />
        <small v-if="fieldErrors['roleIds']" class="field-error" role="alert">{{
          fieldErrors['roleIds']
        }}</small>
      </div>

      <template v-if="creating">
        <PasswordField
          id="u-password"
          v-model="form.password"
          :label="t('users.initialPassword')"
          :error="fieldErrors['password']"
          autocomplete="new-password"
        />
        <p class="app-muted m-0 text-sm">{{ t('users.initialPasswordHint') }}</p>
      </template>

      <div v-else class="flex flex-col gap-1">
        <div class="flex items-center gap-3">
          <ToggleSwitch v-model="form.active" input-id="u-active" />
          <label for="u-active">{{ t('users.active') }}</label>
        </div>
        <small class="app-muted">{{ t('users.deactivateWarning') }}</small>
      </div>
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
        form="user-form"
        :label="t('common.save')"
        :loading="submitting"
      />
    </template>
  </Dialog>
</template>
