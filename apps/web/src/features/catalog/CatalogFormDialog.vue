<script setup lang="ts">
import UAlert from '@nuxt/ui/components/Alert.vue';
import UButton from '@nuxt/ui/components/Button.vue';
import UFormField from '@nuxt/ui/components/FormField.vue';
import UInput from '@nuxt/ui/components/Input.vue';
import UModal from '@nuxt/ui/components/Modal.vue';
import USwitch from '@nuxt/ui/components/Switch.vue';
import { useToast } from '@nuxt/ui/composables/useToast';
import { computed, ref, toRef, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useUnsavedChanges } from '@/shared/ui/useUnsavedChanges';
import { errorMessage } from '@/features/auth/errors';
import { ApiError } from '@/shared/api/http';
import AppSelect from '@/shared/ui/AppSelect.vue';
import SearchSelect from '@/shared/ui/SearchSelect.vue';
import RemoteSelect, { type RemoteOption } from '@/shared/ui/RemoteSelect.vue';
import { useConfirm } from '@/shared/ui/useConfirm';
import { fetchOptions, useCatalogMutations, type CatalogItem } from './api';
import {
  affectedConsumables,
  emptyForm,
  type FieldDef,
  formFromItem,
  toPayload,
  visibleFields,
  type FormState,
  type FormValue,
  type Section,
} from './entities';

const props = defineProps<{ section: Section; item: CatalogItem | null }>();
const visible = defineModel<boolean>('visible', { required: true });

const { t } = useI18n();
const toast = useToast();
const confirm = useConfirm();
const { create, update } = useCatalogMutations(toRef(props, 'section'));

const form = ref<FormState>(emptyForm(props.section));
const fieldErrors = ref<Record<string, string>>({});
const error = ref('');
const creating = computed(() => props.item === null);
/** El estado «Asignado» lo usa el sistema: se muestra pero no se modifica. */
const locked = computed(
  () => props.item !== null && 'isSystem' in props.item && props.item.isSystem,
);
const submitting = computed(() => create.isPending.value || update.isPending.value);
const fields = computed(() => visibleFields(props.section, form.value));

/** Nombres de campo de la API -> campo del formulario. */
const API_FIELDS: Record<string, string> = {
  manufacturerId: 'manufacturer',
  categoryId: 'category',
  parentId: 'parent',
};

watch(
  () => [visible.value, props.item, props.section] as const,
  ([open]) => {
    if (!open) return;
    fieldErrors.value = {};
    error.value = '';
    form.value = props.item ? formFromItem(props.section, props.item) : emptyForm(props.section);
  },
  { immediate: true },
);

const textOf = (key: string): string => String(form.value[key] ?? '');
const refOf = (key: string): RemoteOption | null =>
  (form.value[key] as RemoteOption | null) ?? null;
const setValue = (key: string, value: FormValue) => (form.value = { ...form.value, [key]: value });

function validate(): boolean {
  const e: Record<string, string> = {};
  for (const f of fields.value) {
    const v = form.value[f.key];
    const empty = f.kind === 'ref' ? v === null : typeof v !== 'string' || v.trim() === '';
    if (f.required && empty) e[f.key] = t('common.required');
  }
  fieldErrors.value = e;
  return Object.keys(e).length === 0;
}

/**
 * Renombrar o desactivar una categoría de consumibles o una unidad en uso cambia lo que ven todos los consumibles que
 * la tienen: se confirma diciendo cuántos son (D13).
 */
async function confirmAffected(): Promise<boolean> {
  const item = props.item;
  const n = affectedConsumables(props.section, item);
  if (!item || n === 0) return true;
  const current = item as { name: string; active: boolean };
  const to = textOf('name').trim();
  const renamed = to !== current.name;
  const deactivated = current.active && form.value['active'] !== true;
  if (!renamed && !deactivated) return true;
  const change = renamed
    ? t(deactivated ? 'catalog.affectsRows.renameAndDeactivate' : 'catalog.affectsRows.rename', {
        from: current.name,
        to,
      })
    : t('catalog.affectsRows.deactivate');
  return confirm.ask({
    title: t('catalog.affectsTitle', { section: t(`catalog.singular.${props.section}`) }),
    message: t('catalog.affectsMessage'),
    rows: [
      { label: t('catalog.affectsRows.record'), value: current.name },
      { label: t('catalog.affectsRows.change'), value: change },
      {
        label: t('catalog.affectsRows.scope'),
        value: t('catalog.affects', { n }, n),
        highlight: true,
      },
    ],
    acceptLabel: t('catalog.affectsConfirm'),
    rejectLabel: t('common.back'),
  });
}

async function submit(): Promise<void> {
  error.value = '';
  if (!validate()) return;
  const body = toPayload(props.section, form.value, creating.value ? 'create' : 'edit');
  if (!(await confirmAffected())) return;
  try {
    if (props.item) await update.mutateAsync({ item: props.item, body });
    else await create.mutateAsync(body);
    toast.add({
      title: creating.value ? t('catalog.created') : t('common.saved'),
      color: 'success',
      duration: 4000,
    });
    visible.value = false;
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
      if (e instanceof ApiError && e.status === 412) visible.value = false;
    }
  }
}

const fetcherFor = (source: Section) => (q: string) => fetchOptions(source, q);
const selectItems = (f: FieldDef) =>
  (f.options ?? []).map((o) => ({
    value: o.value,
    label: f.translateOptions ? t(o.label) : o.label,
  }));

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
    :title="creating ? t(`catalog.new.${section}`) : t(`catalog.edit.${section}`)"
    :description="t(`catalog.purpose.${section}`)"
    @update:open="onOpenChange"
  >
    <template #body>
      <form id="catalog-form" class="flex flex-col gap-4" novalidate @submit.prevent="submit">
        <UAlert v-if="error" color="error" variant="subtle" role="alert" :description="error" />
        <UAlert
          v-if="locked"
          color="info"
          variant="subtle"
          :description="t('catalog.systemHint')"
        />

        <UFormField
          v-for="f in fields"
          :key="f.key"
          :label="t(f.label)"
          :name="`cf-${f.key}`"
          :required="f.required"
          :help="f.help ? t(f.help) : undefined"
          :error="fieldErrors[f.key]"
        >
          <UInput
            v-if="f.kind === 'text'"
            :id="`cf-${f.key}`"
            :model-value="textOf(f.key)"
            :maxlength="f.maxLength"
            :disabled="locked"
            autocomplete="off"
            class="w-full"
            @update:model-value="(v: string | number) => setValue(f.key, String(v))"
          />
          <AppSelect
            v-else-if="f.kind === 'select'"
            :id="`cf-${f.key}`"
            :model-value="textOf(f.key)"
            :items="selectItems(f)"
            :placeholder="f.placeholder ? t(f.placeholder) : undefined"
            :disabled="locked"
            class="w-full"
            @update:model-value="(v: string | number) => setValue(f.key, String(v))"
          />
          <SearchSelect
            v-else-if="f.kind === 'search'"
            :id="`cf-${f.key}`"
            :model-value="textOf(f.key)"
            :items="selectItems(f)"
            :placeholder="t(f.placeholder ?? 'catalog.selectPlaceholder')"
            :disabled="locked"
            clearable
            @update:model-value="(v: string) => setValue(f.key, v)"
          />
          <RemoteSelect
            v-else
            :id="`cf-${f.key}`"
            :model-value="refOf(f.key)"
            :source="`${f.source}-form`"
            :fetcher="fetcherFor(f.source!)"
            :placeholder="
              f.key === 'parent' ? t('catalog.parentPlaceholder') : t('catalog.selectPlaceholder')
            "
            :clearable="!f.required"
            @update:model-value="(v: RemoteOption | null) => setValue(f.key, v)"
          />
        </UFormField>

        <USwitch
          v-if="!creating"
          id="cf-active"
          :model-value="form['active'] === true"
          :label="t('catalog.fields.active')"
          :description="t('catalog.activeHint')"
          :disabled="locked"
          @update:model-value="(v: boolean) => setValue('active', v)"
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
        <UButton
          type="submit"
          form="catalog-form"
          :label="t('common.save')"
          :loading="submitting"
          :disabled="locked"
        />
      </div>
    </template>
  </UModal>
</template>
