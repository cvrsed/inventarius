<script setup lang="ts">
import type { Permission, RoleDto } from '@inventarius/shared';
import UAlert from '@nuxt/ui/components/Alert.vue';
import UButton from '@nuxt/ui/components/Button.vue';
import UCheckboxGroup from '@nuxt/ui/components/CheckboxGroup.vue';
import UFormField from '@nuxt/ui/components/FormField.vue';
import UInput from '@nuxt/ui/components/Input.vue';
import { useUnsavedChanges } from '@/shared/ui/useUnsavedChanges';
import UModal from '@nuxt/ui/components/Modal.vue';
import UTextarea from '@nuxt/ui/components/Textarea.vue';
import { useToast } from '@nuxt/ui/composables/useToast';
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
const permissionItems = computed(() =>
  (catalog.data.value ?? []).map((p) => ({ value: p, label: t(`permissions.${p}`) })),
);
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
      title: creating.value ? t('roles.created') : t('common.saved'),
      color: 'success',
      duration: 4000,
    });
    visible.value = false;
  } catch (e) {
    error.value = errorMessage(e, t);
    if (e instanceof ApiError && e.status === 412) visible.value = false;
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
    :title="creating ? t('roles.new') : t('roles.edit')"
    :description="t('roles.formDescription')"
    @update:open="onOpenChange"
  >
    <template #body>
      <form id="role-form" class="flex flex-col gap-4" novalidate @submit.prevent="submit">
        <UAlert v-if="error" color="error" variant="subtle" role="alert" :description="error" />
        <UAlert v-if="locked" color="info" variant="subtle" :description="t('roles.protected')" />

        <UFormField :label="t('roles.name')" name="r-name" :error="nameError || undefined">
          <UInput id="r-name" v-model="form.name" :disabled="role?.isSystem" class="w-full" />
        </UFormField>
        <UFormField :label="t('roles.description')" name="r-desc">
          <UTextarea id="r-desc" v-model="form.description" :rows="2" autoresize class="w-full" />
        </UFormField>

        <UCheckboxGroup
          v-model="form.permissions"
          :legend="t('roles.permissions')"
          :items="permissionItems"
          value-key="value"
          :disabled="locked"
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
        <UButton type="submit" form="role-form" :label="t('common.save')" :loading="submitting" />
      </div>
    </template>
  </UModal>
</template>
