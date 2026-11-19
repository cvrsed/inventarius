<script setup lang="ts">
import {
  LORAWAN_CLASS_OPTIONS,
  LORAWAN_REGION_OPTIONS,
  LORAWAN_VERSION_OPTIONS,
  type LorawanDto,
} from '@inventarius/shared';
import UAlert from '@nuxt/ui/components/Alert.vue';
import UButton from '@nuxt/ui/components/Button.vue';
import UFormField from '@nuxt/ui/components/FormField.vue';
import UInput from '@nuxt/ui/components/Input.vue';
import UModal from '@nuxt/ui/components/Modal.vue';
import { useToast } from '@nuxt/ui/composables/useToast';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { errorMessage } from '@/features/auth/errors';
import { ApiError } from '@/shared/api/http';
import AppSelect from '@/shared/ui/AppSelect.vue';
import { useLorawanMutations } from './api';
import { lorawanPatch, type LorawanForm } from './form';

const props = defineProps<{ assetId: string; data: LorawanDto }>();
const visible = defineModel<boolean>('visible', { required: true });

const { t } = useI18n();
const toast = useToast();
const { update } = useLorawanMutations(computed(() => props.assetId));

const emptyForm = (): LorawanForm => ({
  devEui: '',
  joinEui: '',
  appKey: '',
  nwkKey: '',
  removeAppKey: false,
  removeNwkKey: false,
  deviceClass: '',
  lorawanVersion: '',
  region: '',
});
const form = ref<LorawanForm>(emptyForm());
const error = ref('');
const fieldErrors = ref<Record<string, string>>({});

// Con el dispositivo registrado en un LNS, su identidad (DevEUI, JoinEUI, claves) queda bloqueada (RF-64).
const identityLocked = computed(() =>
  ['registered', 'registering', 'deregistering', 'partial'].includes(
    props.data.registration?.status ?? '',
  ),
);

/** Versión, clase y región viven en el device profile del LNS: editarlas aquí no las cambia allá (P2). */
const onLns = computed(() =>
  ['registered', 'registering', 'deregistering', 'partial'].includes(
    props.data.registration?.status ?? '',
  ),
);
const profileFieldsEdited = computed(
  () =>
    onLns.value &&
    (String(form.value.deviceClass) !== (props.data.deviceClass ?? '') ||
      String(form.value.lorawanVersion) !== (props.data.lorawanVersion ?? '') ||
      String(form.value.region) !== (props.data.region ?? '')),
);

watch(
  visible,
  (open) => {
    if (!open) return;
    form.value = {
      ...emptyForm(),
      devEui: props.data.devEui ?? '',
      joinEui: props.data.joinEui ?? '',
      deviceClass: props.data.deviceClass ?? '',
      lorawanVersion: props.data.lorawanVersion ?? '',
      region: props.data.region ?? '',
    };
    error.value = '';
    fieldErrors.value = {};
  },
  { immediate: true },
);

const withBlank = (opts: readonly { value: string; label: string }[]) => [
  { value: '', label: t('lorawan.notSet') },
  ...opts,
];
const classItems = computed(() => withBlank(LORAWAN_CLASS_OPTIONS));
const versionItems = computed(() => withBlank(LORAWAN_VERSION_OPTIONS));
const regionItems = computed(() => withBlank(LORAWAN_REGION_OPTIONS));
const modelHint = (value: string | null) =>
  value ? t('lorawan.modelDefault', { value }) : undefined;

async function submit(): Promise<void> {
  error.value = '';
  fieldErrors.value = {};
  const { patch, errors } = lorawanPatch(form.value, props.data, identityLocked.value);
  if (Object.keys(errors).length) {
    fieldErrors.value = Object.fromEntries(
      Object.entries(errors).map(([k, n]) => [k, t('lorawan.edit.hexHint', { n })]),
    );
    return;
  }
  if (!Object.keys(patch).length) {
    visible.value = false;
    return;
  }
  try {
    await update.mutateAsync(patch);
    toast.add({ title: t('lorawan.edit.saved'), color: 'success', duration: 4000 });
    visible.value = false;
  } catch (e) {
    error.value = errorMessage(e, t);
    if (e instanceof ApiError) {
      const devEui = e.fieldErrors['devEui']?.[0];
      if (devEui) fieldErrors.value = { devEui };
    }
  }
}
</script>

<template>
  <UModal
    v-model:open="visible"
    :title="t('lorawan.edit.title')"
    :description="t('lorawan.edit.description')"
  >
    <template #body>
      <form id="lorawan-form" class="flex flex-col gap-4" novalidate @submit.prevent="submit">
        <UAlert v-if="error" color="error" variant="subtle" role="alert" :description="error" />
        <UAlert
          v-if="identityLocked"
          color="info"
          variant="subtle"
          :description="t('lorawan.edit.lockedRegistered')"
        />
        <UAlert
          v-if="profileFieldsEdited"
          color="warning"
          variant="subtle"
          role="status"
          :description="t('lorawan.edit.notSynced')"
        />
        <UFormField
          :label="t('lorawan.fields.devEui')"
          name="lw-deveui"
          :hint="t('lorawan.edit.hexHint', { n: 16 })"
          :error="fieldErrors['devEui']"
        >
          <UInput
            id="lw-deveui"
            v-model="form.devEui"
            :disabled="identityLocked"
            autocomplete="off"
            spellcheck="false"
            class="w-full font-mono"
          />
        </UFormField>
        <UFormField
          :label="t('lorawan.fields.joinEui')"
          name="lw-joineui"
          :hint="t('lorawan.edit.hexHint', { n: 16 })"
          :error="fieldErrors['joinEui']"
        >
          <UInput
            id="lw-joineui"
            v-model="form.joinEui"
            :disabled="identityLocked"
            autocomplete="off"
            spellcheck="false"
            class="w-full font-mono"
          />
        </UFormField>
        <UFormField
          v-for="k in ['appKey', 'nwkKey'] as const"
          :key="k"
          :label="t(`lorawan.fields.${k}`)"
          :name="`lw-${k}`"
          :hint="
            data[k === 'appKey' ? 'hasAppKey' : 'hasNwkKey']
              ? t('lorawan.edit.keyStored')
              : t('lorawan.edit.hexHint', { n: 32 })
          "
          :description="t('lorawan.edit.keyHint')"
          :error="fieldErrors[k]"
        >
          <UInput
            :id="`lw-${k}`"
            v-model="form[k]"
            type="password"
            :disabled="identityLocked || (k === 'appKey' ? form.removeAppKey : form.removeNwkKey)"
            autocomplete="off"
            spellcheck="false"
            class="w-full font-mono"
          />
          <label
            v-if="data[k === 'appKey' ? 'hasAppKey' : 'hasNwkKey'] && !identityLocked"
            class="mt-1 flex items-center gap-2 text-sm text-muted"
          >
            <input
              v-if="k === 'appKey'"
              v-model="form.removeAppKey"
              type="checkbox"
              class="size-4"
            />
            <input v-else v-model="form.removeNwkKey" type="checkbox" class="size-4" />
            {{ t('lorawan.edit.removeKey') }}
          </label>
        </UFormField>
        <UFormField
          :label="t('lorawan.fields.deviceClass')"
          name="lw-class"
          :hint="modelHint(data.modelDefaults.deviceClass)"
        >
          <AppSelect id="lw-class" v-model="form.deviceClass" :items="classItems" class="w-full" />
        </UFormField>
        <UFormField
          :label="t('lorawan.fields.lorawanVersion')"
          name="lw-version"
          :hint="modelHint(data.modelDefaults.lorawanVersion)"
        >
          <AppSelect
            id="lw-version"
            v-model="form.lorawanVersion"
            :items="versionItems"
            class="w-full"
          />
        </UFormField>
        <UFormField
          :label="t('lorawan.fields.region')"
          name="lw-region"
          :hint="modelHint(data.modelDefaults.region)"
        >
          <AppSelect id="lw-region" v-model="form.region" :items="regionItems" class="w-full" />
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
          form="lorawan-form"
          :label="t('common.save')"
          :loading="update.isPending.value"
        />
      </div>
    </template>
  </UModal>
</template>
