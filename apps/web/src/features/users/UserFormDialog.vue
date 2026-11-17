<script setup lang="ts">
import type { UserDto } from '@inventarius/shared';
import UAlert from '@nuxt/ui/components/Alert.vue';
import UButton from '@nuxt/ui/components/Button.vue';
import UFormField from '@nuxt/ui/components/FormField.vue';
import UInput from '@nuxt/ui/components/Input.vue';
import UModal from '@nuxt/ui/components/Modal.vue';
import USelectMenu from '@nuxt/ui/components/SelectMenu.vue';
import USwitch from '@nuxt/ui/components/Switch.vue';
import { useToast } from '@nuxt/ui/composables/useToast';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useUnsavedChanges } from '@/shared/ui/useUnsavedChanges';
import { errorMessage } from '@/features/auth/errors';
import { useAuthStore } from '@/features/auth/useAuthStore';
import { ApiError } from '@/shared/api/http';
import PasswordField from '@/shared/ui/PasswordField.vue';
import { useRolesQuery, useUserMutations } from './api';

const props = defineProps<{ user: UserDto | null; creating: boolean }>();
const visible = defineModel<boolean>('visible', { required: true });

const { t } = useI18n();
const toast = useToast();
const roles = useRolesQuery();
const { create, update } = useUserMutations();
const auth = useAuthStore();
/** Nadie edita su propio correo; lo cambia otro administrador (RF-03). */
const emailLocked = computed(
  () => !props.creating && props.user !== null && auth.user?.id === props.user.id,
);

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
  if ((props.creating || !emailLocked.value) && !/^\S+@\S+\.\S+$/.test(form.value.email.trim())) {
    e['email'] = t('login.invalidEmail');
  }
  if (props.creating) {
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
      toast.add({ title: t('users.created'), color: 'success', duration: 4000 });
    } else if (props.user) {
      await update.mutateAsync({
        user: props.user,
        patch: {
          ...(!emailLocked.value && form.value.email.trim() !== props.user.email
            ? { email: form.value.email.trim() }
            : {}),
          name: form.value.name.trim(),
          active: form.value.active,
          roleIds: form.value.roleIds,
        },
      });
      toast.add({ title: t('common.saved'), color: 'success', duration: 4000 });
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

const { requestClose } = useUnsavedChanges(() => form.value, visible);
/** Cerrar con Escape, clic fuera o la X también pide confirmar si hay cambios sin guardar. */
const onOpenChange = (open: boolean) => {
  if (open) visible.value = true;
  else void requestClose(() => (visible.value = false));
};
</script>

<template>
  <UModal
    :open="visible"
    :title="creating ? t('users.new') : t('users.edit')"
    :description="creating ? t('users.formNewDescription') : t('users.formEditDescription')"
    @update:open="onOpenChange"
  >
    <template #body>
      <form id="user-form" class="flex flex-col gap-4" novalidate @submit.prevent="submit">
        <UAlert v-if="error" color="error" variant="subtle" role="alert" :description="error" />

        <UFormField :label="t('users.name')" name="u-name" :error="fieldErrors['name']">
          <UInput id="u-name" v-model="form.name" autocomplete="off" class="w-full" />
        </UFormField>

        <UFormField
          :label="t('users.email')"
          name="u-email"
          :error="fieldErrors['email']"
          :help="emailLocked ? t('users.ownEmailHint') : undefined"
        >
          <UInput
            id="u-email"
            v-model="form.email"
            type="email"
            autocomplete="off"
            :disabled="emailLocked"
            class="w-full"
          />
        </UFormField>

        <UFormField :label="t('users.roles')" name="u-roles" :error="fieldErrors['roleIds']">
          <USelectMenu
            id="u-roles"
            v-model="form.roleIds"
            multiple
            :items="roles.data.value ?? []"
            value-key="id"
            label-key="name"
            :placeholder="t('users.rolesPlaceholder')"
            :search-input="false"
            class="w-full"
          />
        </UFormField>

        <template v-if="creating">
          <PasswordField
            id="u-password"
            v-model="form.password"
            :label="t('users.initialPassword')"
            :error="fieldErrors['password']"
            autocomplete="new-password"
          />
          <p class="m-0 text-sm text-muted">{{ t('users.initialPasswordHint') }}</p>
        </template>

        <USwitch
          v-else
          id="u-active"
          v-model="form.active"
          :label="t('users.active')"
          :description="t('users.deactivateWarning')"
        />
      </form>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          :label="t('common.cancel')"
          color="neutral"
          variant="ghost"
          @click="requestClose(() => (visible = false))"
        />
        <UButton type="submit" form="user-form" :label="t('common.save')" :loading="submitting" />
      </div>
    </template>
  </UModal>
</template>
