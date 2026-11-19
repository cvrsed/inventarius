<script setup lang="ts">
import UAlert from '@nuxt/ui/components/Alert.vue';
import UButton from '@nuxt/ui/components/Button.vue';
import UFormField from '@nuxt/ui/components/FormField.vue';
import UModal from '@nuxt/ui/components/Modal.vue';
import { useToast } from '@nuxt/ui/composables/useToast';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { errorMessage } from '@/features/auth/errors';
import AppSelect from '@/shared/ui/AppSelect.vue';
import { useLnsProfileOptions, useLorawanMutations } from './api';

/** RF-60: elegir perfil, ver la vista previa de lo que se enviará (sin claves) y confirmar. */
const props = defineProps<{ assetId: string }>();
const visible = defineModel<boolean>('visible', { required: true });

const { t, te } = useI18n();
const toast = useToast();
const { preview, register } = useLorawanMutations(computed(() => props.assetId));
const profiles = useLnsProfileOptions(visible);

const profileId = ref<string | number>('');
const error = ref('');

watch(visible, (open) => {
  if (!open) return;
  profileId.value = '';
  error.value = '';
  preview.reset();
});

const items = computed(() =>
  (profiles.data.value ?? []).map((p) => ({
    value: p.id,
    label: `${p.name} · ${t(`lns.kinds.${p.kind}`)}`,
  })),
);

// Al elegir un perfil se pide la vista previa; ahí también se validan los datos exigidos (RF-60).
watch(profileId, async (id) => {
  error.value = '';
  preview.reset();
  if (!id) return;
  try {
    await preview.mutateAsync(String(id));
  } catch (e) {
    error.value = errorMessage(e, t);
  }
});

const fieldLabel = (key: string) =>
  te(`lorawan.registerDialog.previewFields.${key}`)
    ? t(`lorawan.registerDialog.previewFields.${key}`)
    : key;

async function confirm(): Promise<void> {
  error.value = '';
  try {
    await register.mutateAsync(String(profileId.value));
    toast.add({ title: t('lorawan.registerDialog.queued'), color: 'success', duration: 4000 });
    visible.value = false;
  } catch (e) {
    error.value = errorMessage(e, t);
  }
}
</script>

<template>
  <UModal
    v-model:open="visible"
    :title="t('lorawan.registerDialog.title')"
    :description="t('lorawan.registerDialog.description')"
  >
    <template #body>
      <div class="flex flex-col gap-4">
        <UAlert v-if="error" color="error" variant="subtle" role="alert" :description="error" />
        <UAlert
          v-if="profiles.data.value && !items.length"
          color="warning"
          variant="subtle"
          :description="t('lorawan.registerDialog.noProfiles')"
        />
        <UFormField v-else :label="t('lorawan.registerDialog.profile')" name="reg-profile">
          <AppSelect
            id="reg-profile"
            v-model="profileId"
            :items="items"
            :placeholder="t('lorawan.registerDialog.profilePlaceholder')"
            class="w-full"
          />
        </UFormField>

        <section v-if="preview.data.value" aria-labelledby="reg-preview-title">
          <h3 id="reg-preview-title" class="m-0 mb-2 text-base font-semibold text-highlighted">
            {{ t('lorawan.registerDialog.previewTitle') }}
          </h3>
          <dl class="m-0 grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-[auto_1fr]">
            <dt class="text-muted">{{ t('lorawan.registerDialog.deviceName') }}</dt>
            <dd class="m-0 break-words">{{ preview.data.value.deviceName }}</dd>
            <dt class="text-muted">{{ t('lorawan.registerDialog.externalId') }}</dt>
            <dd class="m-0 font-mono break-all">{{ preview.data.value.externalId }}</dd>
            <template v-for="f in preview.data.value.fields" :key="f.label">
              <dt class="text-muted">{{ fieldLabel(f.label) }}</dt>
              <dd class="m-0 font-mono break-all">{{ f.value }}</dd>
            </template>
          </dl>
          <p class="mt-3 mb-0 text-sm text-muted">{{ t('lorawan.registerDialog.keysHidden') }}</p>
        </section>
      </div>
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
          :label="t('lorawan.registerDialog.confirm')"
          :disabled="!preview.data.value"
          :loading="register.isPending.value"
          @click="confirm"
        />
      </div>
    </template>
  </UModal>
</template>
