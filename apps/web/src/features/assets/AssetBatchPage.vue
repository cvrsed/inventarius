<script setup lang="ts">
import { isSelectableStatus } from './status';
import UAlert from '@nuxt/ui/components/Alert.vue';
import UButton from '@nuxt/ui/components/Button.vue';
import UFormField from '@nuxt/ui/components/FormField.vue';
import UInput from '@nuxt/ui/components/Input.vue';
import UTextarea from '@nuxt/ui/components/Textarea.vue';
import { useToast } from '@nuxt/ui/composables/useToast';
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { errorMessage } from '@/features/auth/errors';
import { fetchOptions } from '@/features/catalog/api';
import LocationSelect from '@/features/catalog/LocationSelect.vue';
import { ApiError } from '@/shared/api/http';
import RemoteSelect from '@/shared/ui/RemoteSelect.vue';
import { useUnsavedChanges } from '@/shared/ui/useUnsavedChanges';
import { useAssetMutations } from './api';
import {
  emptyBatchForm,
  PENDING_SETUP_STATUS,
  parseSerials,
  toBatchPayload,
  validateBatch,
  type BatchForm,
} from './batch';

/** Alta en lote (RF-27): N activos iguales de una vez, opcionalmente con su lista de series. */
const { t } = useI18n();
const router = useRouter();
const toast = useToast();
const { createBatch } = useAssetMutations();

const form = ref<BatchForm>(emptyBatchForm());
const fieldErrors = ref<Record<string, string>>({});
const error = ref('');
const { markClean } = useUnsavedChanges(() => form.value);

const serialCount = computed(() => parseSerials(form.value.serials).length);

/** «Asignado» lo pone el sistema al asignar: no se ofrece como estado inicial. */
const fetchStatuses = async (q: string) =>
  (await fetchOptions('statuses', q)).filter(isSelectableStatus);

onMounted(async () => {
  // El estado de partida es la semilla «Pendiente de configuración», si sigue existiendo.
  const seed = (await fetchStatuses(PENDING_SETUP_STATUS).catch(() => [])).find(
    (o) => o.name === PENDING_SETUP_STATUS,
  );
  if (seed && !form.value.status) {
    form.value.status = seed;
    markClean();
  }
});

const API_FIELDS: Record<string, string> = {
  modelId: 'model',
  statusId: 'status',
  baseLocationId: 'baseLocation',
};

async function submit(): Promise<void> {
  error.value = '';
  const errors = validateBatch(form.value);
  fieldErrors.value = Object.fromEntries(Object.entries(errors).map(([k, v]) => [k, t(v)]));
  if (Object.keys(errors).length) return;
  try {
    const result = await createBatch.mutateAsync(toBatchPayload(form.value));
    markClean();
    const first = result.assets[0]?.assetTag ?? '';
    const last = result.assets.at(-1)?.assetTag ?? '';
    toast.add({
      title: t('assets.batch.done', { n: result.count, first, last }),
      color: 'success',
      duration: 6000,
    });
    await router.push({ name: 'assets', query: { sort: '-createdAt' } });
  } catch (e) {
    if (
      e instanceof ApiError &&
      [400, 422].includes(e.status) &&
      Object.keys(e.fieldErrors).length
    ) {
      fieldErrors.value = Object.fromEntries(
        Object.entries(e.fieldErrors).map(([k, v]) => [API_FIELDS[k] ?? k, v.join(' ')]),
      );
    } else {
      error.value = errorMessage(e, t);
    }
  }
}

const set = <K extends keyof BatchForm>(key: K, value: BatchForm[K]) => (form.value[key] = value);
</script>

<template>
  <div class="mx-auto flex max-w-3xl flex-col gap-4">
    <div class="flex flex-wrap items-center gap-3">
      <UButton
        :to="{ name: 'asset-new' }"
        icon="i-lucide-arrow-left"
        :label="t('common.back')"
        color="neutral"
        variant="ghost"
      />
      <div>
        <h1 class="m-0 text-2xl font-semibold text-highlighted">{{ t('assets.batch.title') }}</h1>
        <p class="m-0 text-sm text-muted">{{ t('assets.batch.description') }}</p>
      </div>
    </div>

    <form class="flex flex-col gap-4" novalidate @submit.prevent="submit">
      <UAlert v-if="error" color="error" variant="subtle" role="alert" :description="error" />

      <UFormField
        :label="t('assets.fields.model')"
        name="b-model"
        required
        :error="fieldErrors['model']"
      >
        <RemoteSelect
          id="b-model"
          :model-value="form.model"
          source="models-batch"
          :fetcher="(q: string) => fetchOptions('models', q)"
          :placeholder="t('assets.modelPlaceholder')"
          @update:model-value="(v) => set('model', v)"
        />
      </UFormField>

      <UFormField
        :label="t('assets.batch.quantity')"
        name="b-quantity"
        required
        :help="t('assets.batch.quantityHelp')"
        :error="fieldErrors['quantity']"
      >
        <UInput
          id="b-quantity"
          inputmode="numeric"
          :model-value="form.quantity"
          class="w-full"
          @update:model-value="(v: string | number) => set('quantity', String(v))"
        />
      </UFormField>

      <UFormField
        :label="t('assets.fields.baseLocation')"
        name="b-location"
        required
        :help="t('assets.baseLocationHelp')"
        :error="fieldErrors['baseLocation']"
      >
        <LocationSelect
          id="b-location"
          :model-value="form.baseLocation"
          scope="warehouse"
          :placeholder="t('assets.checkin.returnToPlaceholder')"
          @update:model-value="(v) => set('baseLocation', v)"
        />
      </UFormField>

      <UFormField
        :label="t('assets.fields.status')"
        name="b-status"
        required
        :error="fieldErrors['status']"
      >
        <RemoteSelect
          id="b-status"
          :model-value="form.status"
          source="statuses-batch"
          :fetcher="fetchStatuses"
          :placeholder="t('assets.statusPlaceholder')"
          @update:model-value="(v) => set('status', v)"
        />
      </UFormField>

      <UFormField
        :label="t('assets.batch.name')"
        name="b-name"
        :help="t('assets.batch.nameHelp')"
        :error="fieldErrors['name']"
      >
        <UInput
          id="b-name"
          :model-value="form.name"
          :maxlength="200"
          class="w-full"
          @update:model-value="(v: string | number) => set('name', String(v))"
        />
      </UFormField>

      <UFormField
        :label="t('assets.batch.serials')"
        name="b-serials"
        :help="t('assets.batch.serialsHelp', { n: serialCount })"
        :error="fieldErrors['serials']"
      >
        <UTextarea
          id="b-serials"
          :model-value="form.serials"
          :rows="6"
          class="w-full font-mono"
          @update:model-value="(v: string) => set('serials', v)"
        />
      </UFormField>

      <div class="flex flex-wrap justify-end gap-2">
        <UButton
          :to="{ name: 'assets' }"
          :label="t('common.cancel')"
          color="neutral"
          variant="ghost"
        />
        <UButton
          type="submit"
          icon="i-lucide-layers"
          :label="t('assets.batch.submit')"
          :loading="createBatch.isPending.value"
        />
      </div>
    </form>
  </div>
</template>
