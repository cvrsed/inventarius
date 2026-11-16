<script setup lang="ts">
import type { AssetDto } from '@inventarius/shared';
import UAlert from '@nuxt/ui/components/Alert.vue';
import UButton from '@nuxt/ui/components/Button.vue';
import UFormField from '@nuxt/ui/components/FormField.vue';
import UModal from '@nuxt/ui/components/Modal.vue';
import UTextarea from '@nuxt/ui/components/Textarea.vue';
import { useToast } from '@nuxt/ui/composables/useToast';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { errorMessage } from '@/features/auth/errors';
import { fetchOptions } from '@/features/catalog/api';
import { ApiError } from '@/shared/api/http';
import RemoteSelect, { type RemoteOption } from '@/shared/ui/RemoteSelect.vue';
import { useAssetMutations } from './api';

/**
 * Tres acciones sobre un activo que comparten forma: devolverlo (estado + nota), cambiarle el estado y
 * darlo de baja (motivo). Cada una llama a su endpoint y cierra el diálogo al terminar.
 */
const props = defineProps<{ asset: AssetDto; mode: 'checkin' | 'status' | 'delete' }>();
const visible = defineModel<boolean>('visible', { required: true });

const { t } = useI18n();
const toast = useToast();
const { checkin, update, remove } = useAssetMutations();

const status = ref<RemoteOption | null>(null);
const text = ref('');
const error = ref('');
const fieldError = ref('');
const needsStatus = computed(() => props.mode !== 'delete');
const pending = computed(
  () => checkin.isPending.value || update.isPending.value || remove.isPending.value,
);
const doneKey = {
  checkin: 'assets.checkin.done',
  status: 'assets.status.done',
  delete: 'assets.delete.done',
} as const;

watch(visible, (open) => {
  if (!open) return;
  status.value =
    props.mode === 'status' ? { id: props.asset.status.id, name: props.asset.status.name } : null;
  text.value = '';
  error.value = fieldError.value = '';
});

/** «Asignado» lo pone el sistema al asignar: no se ofrece como destino. */
const fetchStatuses = async (q: string) =>
  (await fetchOptions('statuses', q)).filter((o) => o['isSystem'] !== true);

async function run(): Promise<void> {
  const id = props.asset.id;
  if (props.mode === 'checkin') {
    await checkin.mutateAsync({
      id,
      body: {
        statusId: status.value!.id,
        ...(text.value.trim() ? { note: text.value.trim() } : {}),
      },
    });
  } else if (props.mode === 'status') {
    await update.mutateAsync({ asset: props.asset, body: { statusId: status.value!.id } });
  } else {
    await remove.mutateAsync({ id, reason: text.value.trim() });
  }
}

async function submit(): Promise<void> {
  error.value = fieldError.value = '';
  if ((needsStatus.value && !status.value) || (props.mode === 'delete' && !text.value.trim())) {
    fieldError.value = t('common.required');
    return;
  }
  try {
    await run();
    toast.add({ title: t(doneKey[props.mode]), color: 'success', duration: 4000 });
    visible.value = false;
  } catch (e) {
    error.value = errorMessage(e, t);
    if (e instanceof ApiError && e.status === 412) visible.value = false;
  }
}
</script>

<template>
  <UModal
    v-model:open="visible"
    :title="t(`assets.${mode}.title`)"
    :description="mode === 'status' ? asset.name : t(`assets.${mode}.description`)"
  >
    <template #body>
      <form id="action-form" class="flex flex-col gap-4" novalidate @submit.prevent="submit">
        <UAlert v-if="error" color="error" variant="subtle" role="alert" :description="error" />
        <UFormField
          v-if="needsStatus"
          :label="mode === 'checkin' ? t('assets.checkin.status') : t('assets.fields.status')"
          name="ac-status"
          required
          :error="fieldError"
        >
          <RemoteSelect
            id="ac-status"
            v-model="status"
            source="statuses-action"
            :fetcher="fetchStatuses"
            :placeholder="t('assets.statusPlaceholder')"
          />
        </UFormField>
        <UFormField
          v-if="mode !== 'status'"
          :label="mode === 'delete' ? t('assets.delete.reason') : t('assets.checkin.note')"
          name="ac-text"
          :required="mode === 'delete'"
          :error="mode === 'delete' ? fieldError : undefined"
        >
          <UTextarea id="ac-text" v-model="text" :rows="3" :maxlength="500" class="w-full" />
        </UFormField>
      </form>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          :label="t('common.cancel')"
          color="neutral"
          variant="ghost"
          @click="visible = false"
        />
        <UButton
          type="submit"
          form="action-form"
          :color="mode === 'delete' ? 'error' : 'primary'"
          :label="mode === 'delete' ? t('assets.actions.delete') : t('common.save')"
          :loading="pending"
        />
      </div>
    </template>
  </UModal>
</template>
