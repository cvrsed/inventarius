<script setup lang="ts">
import type { LorawanImportPreview } from '@inventarius/shared';
import UAlert from '@nuxt/ui/components/Alert.vue';
import UBadge from '@nuxt/ui/components/Badge.vue';
import UButton from '@nuxt/ui/components/Button.vue';
import { useToast } from '@nuxt/ui/composables/useToast';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { errorMessage } from '@/features/auth/errors';
import { previewImport, useApplyImport } from './api';

/** RF-66: importación CSV por número de serie. Vista previa con errores por fila; se aplica todo o nada. */
const MAX_BYTES = 2_000_000;

const { t } = useI18n();
const toast = useToast();
const router = useRouter();
const apply = useApplyImport();

const csv = ref('');
const fileName = ref('');
const preview = ref<LorawanImportPreview | null>(null);
const error = ref('');
const loading = ref(false);

const canApply = computed(
  () =>
    !!preview.value &&
    preview.value.invalid === 0 &&
    preview.value.total > 0 &&
    !preview.value.fileErrors.length,
);
/** Las filas con error van primero: es lo que hay que corregir. */
const rows = computed(() =>
  [...(preview.value?.rows ?? [])].sort(
    (a, b) => Number(b.errors.length > 0) - Number(a.errors.length > 0) || a.line - b.line,
  ),
);

async function onFile(event: Event): Promise<void> {
  const file = (event.target as HTMLInputElement).files?.[0];
  error.value = '';
  preview.value = null;
  csv.value = '';
  fileName.value = file?.name ?? '';
  if (!file) return;
  if (file.size > MAX_BYTES) {
    error.value = t('lorawan.import.tooBig');
    return;
  }
  csv.value = await file.text();
  loading.value = true;
  try {
    preview.value = await previewImport(csv.value);
  } catch (e) {
    error.value = errorMessage(e, t);
  } finally {
    loading.value = false;
  }
}

async function confirmImport(): Promise<void> {
  error.value = '';
  try {
    const res = await apply.mutateAsync(csv.value);
    toast.add({
      title: t('lorawan.import.applied', { n: res.applied }),
      color: 'success',
      duration: 5000,
    });
    await router.push({ name: 'assets' });
  } catch (e) {
    error.value = errorMessage(e, t);
  }
}
</script>

<template>
  <div class="mx-auto flex max-w-4xl flex-col gap-4">
    <UButton
      :to="{ name: 'assets' }"
      icon="i-lucide-arrow-left"
      :label="t('lorawan.import.back')"
      color="neutral"
      variant="ghost"
      class="self-start"
    />
    <div>
      <h1 class="m-0 text-2xl font-semibold text-highlighted">{{ t('lorawan.import.title') }}</h1>
      <p class="m-0 mt-1 text-muted">{{ t('lorawan.import.description') }}</p>
      <p class="m-0 mt-1 text-sm text-muted">{{ t('lorawan.import.columnsHelp') }}</p>
    </div>

    <div class="flex flex-col gap-1">
      <label for="lw-import-file" class="font-medium">{{ t('lorawan.import.file') }}</label>
      <input
        id="lw-import-file"
        type="file"
        accept=".csv,text/csv"
        class="block w-full rounded-md border border-default p-2 text-sm"
        @change="onFile"
      />
      <p v-if="fileName" class="m-0 text-sm text-muted">{{ fileName }}</p>
    </div>

    <UAlert v-if="error" color="error" variant="subtle" role="alert" :description="error" />
    <p v-if="loading" class="m-0 text-muted">{{ t('common.loading') }}</p>

    <template v-if="preview">
      <UAlert
        v-for="msg in preview.fileErrors"
        :key="msg"
        color="error"
        variant="subtle"
        role="alert"
        :description="msg"
      />
      <template v-if="!preview.fileErrors.length">
        <p class="m-0 font-medium" role="status">
          {{
            t('lorawan.import.summary', {
              total: preview.total,
              valid: preview.valid,
              invalid: preview.invalid,
            })
          }}
        </p>
        <UAlert
          v-if="preview.invalid"
          color="warning"
          variant="subtle"
          :description="t('lorawan.import.noneApplied')"
        />

        <ul class="m-0 flex list-none flex-col gap-2 p-0" data-testid="import-rows">
          <li
            v-for="r in rows"
            :key="r.line"
            class="rounded-md border p-3"
            :class="r.errors.length ? 'border-error' : 'border-default'"
          >
            <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span class="text-sm text-muted"
                >{{ t('lorawan.import.columns.line') }} {{ r.line }}</span
              >
              <span class="font-medium break-all">{{ r.serial || '—' }}</span>
              <span v-if="r.assetTag" class="text-sm text-muted">{{ r.assetTag }}</span>
              <span v-if="r.devEui" class="font-mono text-sm break-all">{{ r.devEui }}</span>
              <UBadge
                v-if="!r.errors.length"
                :label="t('lorawan.import.ok')"
                color="success"
                variant="subtle"
              />
            </div>
            <ul v-if="r.errors.length" class="m-0 mt-1 list-disc pl-5 text-sm text-error">
              <li v-for="e in r.errors" :key="e">{{ e }}</li>
            </ul>
          </li>
        </ul>
      </template>

      <div class="flex justify-end">
        <UButton
          icon="i-lucide-file-check"
          :label="t('lorawan.import.apply', { n: preview.valid })"
          :disabled="!canApply"
          :loading="apply.isPending.value"
          @click="confirmImport"
        />
      </div>
    </template>
  </div>
</template>
