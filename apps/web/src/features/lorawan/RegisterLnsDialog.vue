<script setup lang="ts">
import UAlert from '@nuxt/ui/components/Alert.vue';
import UButton from '@nuxt/ui/components/Button.vue';
import UFormField from '@nuxt/ui/components/FormField.vue';
import UModal from '@nuxt/ui/components/Modal.vue';
import { useToast } from '@nuxt/ui/composables/useToast';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import ReasonButton from '@/shared/ui/ReasonButton.vue';
import { errorMessage } from '@/features/auth/errors';
import { ApiError } from '@/shared/api/http';
import AppSelect from '@/shared/ui/AppSelect.vue';
import { useLnsProfileOptions, useLorawanMutations } from './api';
import { previewRows } from './preview';

/** RF-60: elegir perfil, ver la vista previa de lo que se enviará (sin claves) y confirmar. */
const props = defineProps<{ assetId: string }>();
const visible = defineModel<boolean>('visible', { required: true });

const { t } = useI18n();
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

const rows = computed(() => (preview.data.value ? previewRows(preview.data.value, t) : []));

const mismatches = computed(() => preview.data.value?.mismatches ?? []);
const mismatchText = (m: { field: string; asset: string; lns: string }) =>
  t(`lorawan.registerDialog.mismatch.${m.field}`, { asset: m.asset, lns: m.lns });
const confirmBlocked = computed(() => {
  if (!preview.data.value) return t('lorawan.registerDialog.needProfile');
  if (mismatches.value.length) return t('lorawan.registerDialog.mismatch.blocked');
  return undefined;
});

async function confirm(): Promise<void> {
  error.value = '';
  try {
    await register.mutateAsync(String(profileId.value));
    toast.add({ title: t('lorawan.registerDialog.queued'), color: 'success', duration: 4000 });
    visible.value = false;
  } catch (e) {
    error.value = failureText(e);
  }
}

/** Un 422 por diferencias con el device profile trae una explicación por campo: se muestran todas. */
function failureText(e: unknown): string {
  if (e instanceof ApiError) {
    const specific = ['lorawanVersion', 'region', 'deviceClass'].flatMap(
      (f) => e.fieldErrors[f] ?? [],
    );
    if (specific.length) return specific.join(' · ');
  }
  return errorMessage(e, t);
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

        <UAlert
          v-if="mismatches.length"
          color="error"
          variant="subtle"
          role="alert"
          :title="
            t('lorawan.registerDialog.mismatch.title', {
              profile: preview.data.value?.deviceProfile.name ?? '',
            })
          "
        >
          <template #description>
            <ul class="m-0 list-disc pl-5">
              <li v-for="m in mismatches" :key="m.field">{{ mismatchText(m) }}</li>
            </ul>
          </template>
        </UAlert>

        <section v-if="preview.data.value" aria-labelledby="reg-preview-title">
          <h3 id="reg-preview-title" class="m-0 mb-2 text-base font-semibold text-highlighted">
            {{ t('lorawan.registerDialog.previewTitle') }}
          </h3>
          <dl class="m-0 grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-[auto_1fr]">
            <template v-for="r in rows" :key="r.key">
              <dt class="text-muted">{{ r.label }}</dt>
              <dd
                class="m-0"
                :class="[
                  r.mono ? 'font-mono' : 'break-words',
                  r.nowrap ? 'whitespace-nowrap' : 'break-all',
                ]"
              >
                {{ r.value }}
              </dd>
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
        <ReasonButton
          :label="t('lorawan.registerDialog.confirm')"
          :reason="confirmBlocked"
          :loading="register.isPending.value"
          @click="confirm"
        />
      </div>
    </template>
  </UModal>
</template>
