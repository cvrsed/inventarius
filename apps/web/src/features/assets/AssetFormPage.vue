<script setup lang="ts">
import { isSelectableStatus } from './status';
import UAlert from '@nuxt/ui/components/Alert.vue';
import UButton from '@nuxt/ui/components/Button.vue';
import UFormField from '@nuxt/ui/components/FormField.vue';
import UInput from '@nuxt/ui/components/Input.vue';
import UTextarea from '@nuxt/ui/components/Textarea.vue';
import { useToast } from '@nuxt/ui/composables/useToast';
import { computed, nextTick, ref, watch } from 'vue';
import { CURRENCY_OPTIONS } from '@inventarius/shared';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { errorMessage } from '@/features/auth/errors';
import { fetchOptions } from '@/features/catalog/api';
import LocationSelect from '@/features/catalog/LocationSelect.vue';
import { ApiError } from '@/shared/api/http';
import SearchSelect from '@/shared/ui/SearchSelect.vue';
import RemoteSelect, { type RemoteOption } from '@/shared/ui/RemoteSelect.vue';
import { useUnsavedChanges } from '@/shared/ui/useUnsavedChanges';
import { useAsset, useAssetMutations } from './api';
import { emptyAssetForm, formFromAsset, toAssetPayload, type AssetForm } from './form';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const toast = useToast();

const id = computed(() => String(route.params['id'] ?? ''));
const editing = computed(() => id.value !== '');
const { data: asset, isPending, isError } = useAsset(id);
const { create, update } = useAssetMutations();

const form = ref<AssetForm>(emptyAssetForm());
const fieldErrors = ref<Record<string, string>>({});
const error = ref('');
const submitting = computed(() => create.isPending.value || update.isPending.value);

const { markClean } = useUnsavedChanges(() => form.value);

watch(
  asset,
  (a) => {
    if (a && editing.value) {
      form.value = formFromAsset(a);
      // El formulario recién cargado es el estado «limpio»; sin esto avisaría de cambios que nadie hizo.
      void nextTick(markClean);
    }
  },
  { immediate: true },
);

/** Nombres de campo de la API -> campo del formulario. */
const API_FIELDS: Record<string, string> = {
  modelId: 'model',
  statusId: 'status',
  baseLocationId: 'baseLocation',
};

const set = <K extends keyof AssetForm>(key: K, value: AssetForm[K]) => (form.value[key] = value);
const setText = (key: keyof AssetForm, v: string | number) => set(key, String(v) as never);

function validate(): boolean {
  const e: Record<string, string> = {};
  if (!form.value.name.trim()) e['name'] = t('common.required');
  if (!form.value.model) e['model'] = t('common.required');
  if (!editing.value && !form.value.status) e['status'] = t('common.required');
  fieldErrors.value = e;
  return Object.keys(e).length === 0;
}

/** «Asignado» lo pone el sistema al asignar: no se ofrece como estado. */
const fetchStatuses = async (q: string) =>
  (await fetchOptions('statuses', q)).filter(isSelectableStatus);

async function submit(): Promise<void> {
  error.value = '';
  if (!validate()) return;
  try {
    if (editing.value && asset.value) {
      const body = toAssetPayload(form.value, 'edit');
      await update.mutateAsync({ asset: asset.value, body });
      markClean();
      toast.add({ title: t('common.saved'), color: 'success', duration: 4000 });
      await router.push({ name: 'asset', params: { id: id.value } });
    } else {
      const created = await create.mutateAsync(toAssetPayload(form.value, 'create'));
      markClean();
      toast.add({ title: t('assets.created'), color: 'success', duration: 4000 });
      await router.push({ name: 'asset', params: { id: created.id } });
    }
  } catch (e) {
    if (
      e instanceof ApiError &&
      [400, 409, 422].includes(e.status) &&
      Object.keys(e.fieldErrors).length
    ) {
      fieldErrors.value = Object.fromEntries(
        Object.entries(e.fieldErrors).map(([k, v]) => [API_FIELDS[k] ?? k, v.join(' ')]),
      );
    } else {
      error.value = errorMessage(e, t);
    }
    if (e instanceof ApiError && e.status === 409 && !Object.keys(e.fieldErrors).length) {
      fieldErrors.value = { assetTag: e.problem?.detail ?? '' };
    }
  }
}
</script>

<template>
  <div class="mx-auto flex max-w-3xl flex-col gap-4">
    <div class="flex flex-wrap items-center gap-3">
      <UButton
        :to="editing ? { name: 'asset', params: { id } } : { name: 'assets' }"
        icon="i-lucide-arrow-left"
        :label="t('common.back')"
        color="neutral"
        variant="ghost"
      />
      <h1 class="m-0 text-2xl font-semibold text-highlighted">
        {{ editing ? t('assets.edit') : t('assets.new') }}
      </h1>
      <UButton
        v-if="!editing"
        :to="{ name: 'asset-batch' }"
        icon="i-lucide-layers"
        :label="t('assets.batch.link')"
        color="neutral"
        variant="outline"
        class="ml-auto"
      />
    </div>

    <p v-if="editing && isPending" class="text-muted">{{ t('common.loading') }}</p>
    <UAlert
      v-else-if="editing && isError"
      color="error"
      variant="subtle"
      role="alert"
      :description="t('assets.notFound')"
    />

    <form v-else class="flex flex-col gap-6" novalidate @submit.prevent="submit">
      <UAlert v-if="error" color="error" variant="subtle" role="alert" :description="error" />

      <fieldset class="m-0 flex min-w-0 flex-col gap-4 rounded-lg border border-default p-4">
        <legend class="px-1 font-semibold">{{ t('assets.sections.identity') }}</legend>
        <UFormField
          :label="t('assets.fields.name')"
          name="a-name"
          required
          :error="fieldErrors['name']"
        >
          <UInput
            id="a-name"
            :model-value="form.name"
            :maxlength="200"
            class="w-full"
            @update:model-value="(v: string | number) => setText('name', v)"
          />
        </UFormField>
        <UFormField
          :label="t('assets.fields.assetTag')"
          name="a-tag"
          :help="editing ? undefined : t('assets.fields.assetTagHint')"
          :error="fieldErrors['assetTag']"
        >
          <UInput
            id="a-tag"
            :model-value="form.assetTag"
            :maxlength="40"
            class="w-full"
            @update:model-value="(v: string | number) => setText('assetTag', v)"
          />
        </UFormField>
        <UFormField
          :label="t('assets.fields.model')"
          name="a-model"
          required
          :error="fieldErrors['model']"
        >
          <RemoteSelect
            id="a-model"
            :model-value="form.model"
            source="models-form"
            :fetcher="(q: string) => fetchOptions('models', q)"
            :placeholder="t('assets.modelPlaceholder')"
            @update:model-value="(v: RemoteOption | null) => set('model', v)"
          />
        </UFormField>
        <UFormField
          :label="t('assets.fields.serial')"
          name="a-serial"
          :error="fieldErrors['serial']"
        >
          <UInput
            id="a-serial"
            :model-value="form.serial"
            :maxlength="120"
            class="w-full"
            @update:model-value="(v: string | number) => setText('serial', v)"
          />
        </UFormField>
      </fieldset>

      <fieldset class="m-0 flex min-w-0 flex-col gap-4 rounded-lg border border-default p-4">
        <legend class="px-1 font-semibold">
          {{ editing ? t('assets.sections.location') : t('assets.sections.statusAndLocation') }}
        </legend>
        <!-- El estado solo se elige al crear; después se cambia con «Cambiar estado» (queda en el historial). -->
        <UFormField
          v-if="!editing"
          :label="t('assets.fields.status')"
          name="a-status"
          required
          :error="fieldErrors['status']"
        >
          <RemoteSelect
            id="a-status"
            :model-value="form.status"
            source="statuses-form"
            :fetcher="fetchStatuses"
            :placeholder="t('assets.statusPlaceholder')"
            @update:model-value="(v: RemoteOption | null) => set('status', v)"
          />
        </UFormField>
        <UFormField
          :label="t('assets.fields.baseLocation')"
          name="a-location"
          :help="t('assets.baseLocationHelp')"
          :error="fieldErrors['baseLocation']"
        >
          <LocationSelect
            id="a-location"
            :model-value="form.baseLocation"
            scope="warehouse"
            :placeholder="t('assets.locationPlaceholder')"
            clearable
            @update:model-value="(v: RemoteOption | null) => set('baseLocation', v)"
          />
        </UFormField>
      </fieldset>

      <fieldset
        class="m-0 grid min-w-0 grid-cols-1 gap-4 rounded-lg border border-default p-4 sm:grid-cols-2"
      >
        <legend class="px-1 font-semibold">{{ t('assets.sections.purchase') }}</legend>
        <UFormField
          :label="t('assets.fields.purchaseDate')"
          name="a-date"
          :error="fieldErrors['purchaseDate']"
        >
          <UInput
            id="a-date"
            type="date"
            :model-value="form.purchaseDate"
            class="w-full"
            @update:model-value="(v: string | number) => setText('purchaseDate', v)"
          />
        </UFormField>
        <UFormField
          :label="t('assets.fields.purchaseCost')"
          name="a-cost"
          :error="fieldErrors['purchaseCost']"
        >
          <UInput
            id="a-cost"
            inputmode="decimal"
            :model-value="form.purchaseCost"
            class="w-full"
            @update:model-value="(v: string | number) => setText('purchaseCost', v)"
          />
        </UFormField>
        <UFormField
          :label="t('assets.fields.purchaseCurrency')"
          name="a-currency"
          :error="fieldErrors['purchaseCurrency']"
        >
          <SearchSelect
            id="a-currency"
            :model-value="form.purchaseCurrency"
            :items="CURRENCY_OPTIONS"
            :placeholder="t('assets.placeholders.currency')"
            @update:model-value="(v: string) => set('purchaseCurrency', v)"
          />
        </UFormField>
        <UFormField :label="t('assets.fields.supplier')" name="a-supplier">
          <UInput
            id="a-supplier"
            :model-value="form.supplier"
            :maxlength="120"
            class="w-full"
            @update:model-value="(v: string | number) => setText('supplier', v)"
          />
        </UFormField>
        <UFormField
          :label="t('assets.fields.warrantyMonths')"
          name="a-warranty"
          :error="fieldErrors['warrantyMonths']"
        >
          <UInput
            id="a-warranty"
            inputmode="numeric"
            :model-value="form.warrantyMonths"
            class="w-full"
            @update:model-value="(v: string | number) => setText('warrantyMonths', v)"
          />
        </UFormField>
      </fieldset>

      <UFormField :label="t('assets.fields.notes')" name="a-notes" :error="fieldErrors['notes']">
        <UTextarea
          id="a-notes"
          :model-value="form.notes"
          :rows="3"
          :maxlength="2000"
          class="w-full"
          @update:model-value="(v: string | number) => setText('notes', v)"
        />
      </UFormField>

      <div class="flex justify-end gap-2">
        <UButton
          :to="editing ? { name: 'asset', params: { id } } : { name: 'assets' }"
          :label="t('common.cancel')"
          color="neutral"
          variant="ghost"
        />
        <UButton type="submit" :label="t('common.save')" :loading="submitting" />
      </div>
    </form>
  </div>
</template>
