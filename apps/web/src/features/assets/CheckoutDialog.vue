<script setup lang="ts">
import type { AssetDto } from '@inventarius/shared';
import UAlert from '@nuxt/ui/components/Alert.vue';
import UButton from '@nuxt/ui/components/Button.vue';
import UFormField from '@nuxt/ui/components/FormField.vue';
import UInput from '@nuxt/ui/components/Input.vue';
import UModal from '@nuxt/ui/components/Modal.vue';
import UTextarea from '@nuxt/ui/components/Textarea.vue';
import { useToast } from '@nuxt/ui/composables/useToast';
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { fetchOptions } from '@/features/catalog/api';
import { errorMessage } from '@/features/auth/errors';
import { ApiError } from '@/shared/api/http';
import AppSelect from '@/shared/ui/AppSelect.vue';
import RemoteSelect, { type RemoteOption } from '@/shared/ui/RemoteSelect.vue';
import { fetchAssignees, useAssetMutations } from './api';

const props = defineProps<{ asset: AssetDto }>();
const visible = defineModel<boolean>('visible', { required: true });

const { t } = useI18n();
const toast = useToast();
const { checkout } = useAssetMutations();

const kind = ref<'user' | 'location'>('user');
const target = ref<RemoteOption | null>(null);
const expectedReturnOn = ref('');
const note = ref('');
const error = ref('');
const fieldError = ref('');

watch(visible, (open) => {
  if (!open) return;
  kind.value = 'user';
  target.value = null;
  expectedReturnOn.value = '';
  note.value = '';
  error.value = '';
  fieldError.value = '';
});
watch(kind, () => (target.value = null));
// El error de «obligatorio» se va en cuanto se elige un valor.
watch(target, (v) => {
  if (v) fieldError.value = '';
});

async function submit(): Promise<void> {
  error.value = fieldError.value = '';
  if (!target.value) {
    fieldError.value = t('common.required');
    return;
  }
  const body = {
    ...(kind.value === 'user' ? { userId: target.value.id } : { locationId: target.value.id }),
    ...(expectedReturnOn.value ? { expectedReturnOn: expectedReturnOn.value } : {}),
    ...(note.value.trim() ? { note: note.value.trim() } : {}),
  };
  try {
    await checkout.mutateAsync({ id: props.asset.id, body });
    toast.add({ title: t('assets.checkout.done'), color: 'success', duration: 4000 });
    visible.value = false;
  } catch (e) {
    if (
      e instanceof ApiError &&
      [400, 422].includes(e.status) &&
      Object.keys(e.fieldErrors).length
    ) {
      fieldError.value = Object.values(e.fieldErrors).flat().join(' ');
    } else error.value = errorMessage(e, t);
  }
}

const kinds = [
  { value: 'user', label: t('assets.checkout.toUser') },
  { value: 'location', label: t('assets.checkout.toLocation') },
];
</script>

<template>
  <UModal
    v-model:open="visible"
    :title="t('assets.checkout.title')"
    :description="t('assets.checkout.description')"
  >
    <template #body>
      <form id="checkout-form" class="flex flex-col gap-4" novalidate @submit.prevent="submit">
        <UAlert v-if="error" color="error" variant="subtle" role="alert" :description="error" />
        <UFormField :label="t('assets.checkout.target')" name="co-kind">
          <AppSelect id="co-kind" v-model="kind" :items="kinds" class="w-full" />
        </UFormField>
        <UFormField
          :label="kind === 'user' ? t('assets.checkout.user') : t('assets.checkout.location')"
          name="co-target"
          required
          :error="fieldError || undefined"
        >
          <RemoteSelect
            v-if="kind === 'user'"
            id="co-target"
            v-model="target"
            source="assignees"
            :fetcher="fetchAssignees"
            :placeholder="t('assets.checkout.userPlaceholder')"
          />
          <RemoteSelect
            v-else
            id="co-target"
            v-model="target"
            source="sites-checkout"
            :fetcher="
              (q: string) => fetchOptions('locations', q, { extra: { excludeType: 'warehouse' } })
            "
            :placeholder="t('assets.locationPlaceholder')"
          />
        </UFormField>
        <UFormField :label="t('assets.checkout.expectedReturnOn')" name="co-date">
          <UInput id="co-date" v-model="expectedReturnOn" type="date" class="w-full" />
        </UFormField>
        <UFormField :label="t('assets.checkout.note')" name="co-note">
          <UTextarea id="co-note" v-model="note" :rows="2" :maxlength="500" class="w-full" />
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
          form="checkout-form"
          :label="t('assets.actions.checkout')"
          :loading="checkout.isPending.value"
        />
      </div>
    </template>
  </UModal>
</template>
