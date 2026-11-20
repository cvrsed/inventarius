<script setup lang="ts">
import type { ConsumableDetailDto } from '@inventarius/shared';
import UAlert from '@nuxt/ui/components/Alert.vue';
import UButton from '@nuxt/ui/components/Button.vue';
import UFormField from '@nuxt/ui/components/FormField.vue';
import UInput from '@nuxt/ui/components/Input.vue';
import UModal from '@nuxt/ui/components/Modal.vue';
import UTextarea from '@nuxt/ui/components/Textarea.vue';
import { useToast } from '@nuxt/ui/composables/useToast';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { errorMessage } from '@/features/auth/errors';
import { fetchOptions } from '@/features/catalog/api';
import { ApiError } from '@/shared/api/http';
import RemoteSelect, { type RemoteOption } from '@/shared/ui/RemoteSelect.vue';
import { useUnsavedChanges } from '@/shared/ui/useUnsavedChanges';
import { useConsumableMutations } from './api';
import { quantityProblem, toApiQuantity } from './quantity';

const props = defineProps<{ item: ConsumableDetailDto | null }>();
const visible = defineModel<boolean>('visible', { required: true });

const { t } = useI18n();
const toast = useToast();
const { create, update } = useConsumableMutations();

interface MinimumRow {
  key: number;
  warehouse: RemoteOption | null;
  quantity: string;
}

const name = ref('');
const category = ref<RemoteOption | null>(null);
const unit = ref<RemoteOption | null>(null);
const notes = ref('');
const minStock = ref('');
const minimums = ref<MinimumRow[]>([]);
const errors = ref<Record<string, string>>({});
const error = ref('');
let nextKey = 0;

const creating = computed(() => props.item === null);
/** Con movimientos la unidad no cambia: las cantidades ya registradas quedarían mal. */
const unitLocked = computed(() => props.item?.hasMovements === true);
const submitting = computed(() => create.isPending.value || update.isPending.value);
/** Decimales de la unidad elegida (lo que se escribe en los mínimos debe caber en ella). */
const decimals = computed(() => (unit.value?.['decimals'] as number | undefined) ?? 0);

watch(
  () => [visible.value, props.item] as const,
  ([open]) => {
    if (!open) return;
    errors.value = {};
    error.value = '';
    const item = props.item;
    name.value = item?.name ?? '';
    category.value = item ? { id: item.category.id, name: item.category.name } : null;
    unit.value = item
      ? { id: item.unit.id, name: item.unit.name, decimals: item.unit.decimals }
      : null;
    notes.value = item?.notes ?? '';
    minStock.value = item?.minStock ? item.minStock.replace('.', ',') : '';
    minimums.value = (item?.stockByWarehouse ?? [])
      .filter((s) => s.minQuantity !== null)
      .map((s) => ({
        key: nextKey++,
        warehouse: { id: s.location.id, name: s.location.name },
        quantity: (s.minQuantity ?? '').replace('.', ','),
      }));
  },
  { immediate: true },
);

const unitRef = computed(() => ({
  id: unit.value?.id ?? '',
  name: '',
  plural: '',
  abbreviation: '',
  decimals: decimals.value,
}));

function validate(): boolean {
  const e: Record<string, string> = {};
  const required = t('common.required');
  if (!name.value.trim()) e['name'] = required;
  if (!category.value) e['category'] = required;
  if (!unit.value) e['unit'] = required;
  const bad = (text: string) => {
    const problem = quantityProblem(text, unitRef.value);
    return problem === 'decimals'
      ? t('consumables.movement.problems.decimals', { decimals: decimalsText.value })
      : t(`consumables.movement.problems.${problem}`);
  };
  if (minStock.value.trim() && quantityProblem(minStock.value, unitRef.value)) {
    e['minStock'] = bad(minStock.value);
  }
  minimums.value.forEach((m) => {
    if (!m.warehouse) e[`min-${m.key}-warehouse`] = required;
    if (quantityProblem(m.quantity, unitRef.value)) e[`min-${m.key}-quantity`] = bad(m.quantity);
  });
  errors.value = e;
  return Object.keys(e).length === 0;
}

const decimalsText = computed(() =>
  decimals.value === 0
    ? t('consumables.decimals.none')
    : t('consumables.decimals.some', { n: decimals.value }, decimals.value),
);

async function submit(): Promise<void> {
  error.value = '';
  if (!validate()) return;
  const body = {
    name: name.value.trim(),
    categoryId: category.value!.id,
    unitId: unit.value!.id,
    notes: notes.value.trim() || null,
    minStock: minStock.value.trim() ? toApiQuantity(minStock.value) : null,
    warehouseMinimums: minimums.value.map((m) => ({
      locationId: m.warehouse!.id,
      minQuantity: toApiQuantity(m.quantity),
    })),
  };
  try {
    if (props.item) {
      await update.mutateAsync({ id: props.item.id, version: props.item.updatedAt, body });
    } else {
      await create.mutateAsync(body);
    }
    toast.add({
      title: t(creating.value ? 'consumables.form.created' : 'consumables.form.saved'),
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
      const map: Record<string, string> = { categoryId: 'category', unitId: 'unit' };
      errors.value = Object.fromEntries(
        Object.entries(e.fieldErrors).map(([k, v]) => [map[k] ?? k, v.join(' ')]),
      );
    } else {
      error.value = errorMessage(e, t);
      if (e instanceof ApiError && e.status === 412) visible.value = false;
    }
  }
}

const addMinimum = () => minimums.value.push({ key: nextKey++, warehouse: null, quantity: '' });
const removeMinimum = (key: number) =>
  (minimums.value = minimums.value.filter((m) => m.key !== key));

const categories = (q: string) => fetchOptions('consumableCategories', q);
const units = (q: string) => fetchOptions('units', q);
const warehouses = (q: string) => fetchOptions('locations', q, { extra: { type: 'warehouse' } });

const { requestClose } = useUnsavedChanges(
  () => [name.value, category.value, unit.value, notes.value, minStock.value, minimums.value],
  visible,
);
const onOpenChange = (open: boolean) => {
  if (open) visible.value = true;
  else void requestClose(() => (visible.value = false));
};
</script>

<template>
  <UModal
    :open="visible"
    :title="creating ? t('consumables.new') : t('consumables.edit')"
    :description="t('consumables.description')"
    @update:open="onOpenChange"
  >
    <template #body>
      <form id="consumable-form" class="flex flex-col gap-4" novalidate @submit.prevent="submit">
        <UAlert v-if="error" color="error" variant="subtle" role="alert" :description="error" />

        <UFormField
          :label="t('consumables.form.name')"
          name="cs-name"
          required
          :error="errors['name']"
        >
          <UInput id="cs-name" v-model="name" :maxlength="120" autocomplete="off" class="w-full" />
        </UFormField>

        <UFormField
          :label="t('consumables.form.category')"
          name="cs-category"
          required
          :error="errors['category']"
        >
          <RemoteSelect
            id="cs-category"
            v-model="category"
            source="consumable-categories-form"
            :fetcher="categories"
            :placeholder="t('consumables.form.categoryPlaceholder')"
          />
        </UFormField>

        <UFormField
          :label="t('consumables.form.unit')"
          name="cs-unit"
          required
          :help="unitLocked ? t('consumables.form.unitLocked') : undefined"
          :error="errors['unit']"
        >
          <RemoteSelect
            id="cs-unit"
            v-model="unit"
            source="measure-units-form"
            :fetcher="units"
            :placeholder="t('consumables.form.unitPlaceholder')"
            :disabled="unitLocked"
          />
        </UFormField>

        <UFormField
          :label="t('consumables.form.minStock')"
          name="cs-min"
          :help="t('consumables.form.minStockHelp')"
          :error="errors['minStock']"
        >
          <UInput
            id="cs-min"
            v-model="minStock"
            inputmode="decimal"
            autocomplete="off"
            class="w-full"
          />
        </UFormField>

        <fieldset class="m-0 flex flex-col gap-3 border-0 p-0">
          <legend class="p-0 text-sm font-medium text-highlighted">
            {{ t('consumables.form.warehouseMinimums') }}
          </legend>
          <p class="m-0 text-sm text-muted">{{ t('consumables.form.warehouseMinimumsHelp') }}</p>
          <div
            v-for="(m, i) in minimums"
            :key="m.key"
            class="flex flex-col gap-2 rounded-lg border border-default p-3 sm:flex-row sm:items-start"
          >
            <UFormField
              :label="t('consumables.form.warehouse')"
              :name="`cs-mw-${m.key}`"
              :error="errors[`min-${m.key}-warehouse`]"
              class="flex-1"
            >
              <RemoteSelect
                :id="`cs-mw-${m.key}`"
                v-model="m.warehouse"
                source="warehouses-form"
                :fetcher="warehouses"
                :placeholder="t('consumables.form.warehousePlaceholder')"
              />
            </UFormField>
            <UFormField
              :label="t('consumables.form.minimum')"
              :name="`cs-mq-${m.key}`"
              :error="errors[`min-${m.key}-quantity`]"
              class="sm:w-36"
            >
              <UInput
                :id="`cs-mq-${m.key}`"
                v-model="m.quantity"
                inputmode="decimal"
                autocomplete="off"
                class="w-full"
              />
            </UFormField>
            <UButton
              icon="i-lucide-x"
              color="neutral"
              variant="ghost"
              class="self-end sm:mt-6"
              :aria-label="
                t('consumables.form.removeMinimum', { name: m.warehouse?.name ?? String(i + 1) })
              "
              @click="removeMinimum(m.key)"
            />
          </div>
          <UButton
            icon="i-lucide-plus"
            :label="t('consumables.form.addMinimum')"
            color="neutral"
            variant="outline"
            class="self-start"
            @click="addMinimum"
          />
        </fieldset>

        <UFormField :label="t('consumables.form.notes')" name="cs-notes" :error="errors['notes']">
          <UTextarea id="cs-notes" v-model="notes" :rows="2" :maxlength="500" class="w-full" />
        </UFormField>
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
          form="consumable-form"
          :label="t('common.save')"
          :loading="submitting"
        />
      </div>
    </template>
  </UModal>
</template>
