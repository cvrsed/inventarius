<script setup lang="ts">
import {
  compareQuantities,
  formatQuantity,
  subtractQuantities,
  type ConsumableDetailDto,
  type MovementDto,
} from '@inventarius/shared';
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
import { useConsumableMutations } from './api';
import { quantityProblem, toApiQuantity } from './quantity';

/** Devolución de (parte de) una entrega (P1): vuelve a la bodega de la entrega u otra bodega activa. */
const props = defineProps<{ delivery: MovementDto | null; consumable: ConsumableDetailDto }>();
const visible = defineModel<boolean>('visible', { required: true });

const { t } = useI18n();
const toast = useToast();
const { giveBack } = useConsumableMutations();

const unit = computed(() => props.consumable.unit);
const delivered = computed(() => props.delivery?.delta.replace('-', '') ?? '0');
const remaining = computed(() =>
  compareQuantities(delivered.value, props.delivery?.returned ?? '0') <= 0
    ? '0'
    : subtractQuantities(delivered.value, props.delivery?.returned ?? '0'),
);

const warehouse = ref<RemoteOption | null>(null);
const quantity = ref('');
const note = ref('');
const touched = ref(false);
const errors = ref<Record<string, string>>({});
const error = ref('');

watch(visible, (open) => {
  if (!open || !props.delivery) return;
  warehouse.value = { id: props.delivery.location.id, name: props.delivery.location.name };
  quantity.value = '';
  note.value = '';
  touched.value = false;
  errors.value = {};
  error.value = '';
});

function validate(): boolean {
  const e: Record<string, string> = {};
  const problem = quantityProblem(quantity.value, unit.value);
  if (problem === 'decimals') {
    e['quantity'] = t('consumables.movement.problems.decimals', {
      decimals: unit.value.decimals
        ? t('consumables.decimals.some', { n: unit.value.decimals }, unit.value.decimals)
        : t('consumables.decimals.none'),
    });
  } else if (problem) e['quantity'] = t(`consumables.movement.problems.${problem}`);
  else if (compareQuantities(toApiQuantity(quantity.value), remaining.value) > 0) {
    e['quantity'] = t('consumables.movement.problems.exceeds', {
      max: formatQuantity(remaining.value, unit.value),
    });
  }
  if (!warehouse.value) e['locationId'] = t('common.required');
  errors.value = e;
  return Object.keys(e).length === 0;
}

async function submit(): Promise<void> {
  error.value = '';
  touched.value = true;
  if (!validate()) return;
  try {
    await giveBack.mutateAsync({
      deliveryId: props.delivery!.id,
      body: {
        locationId: warehouse.value!.id,
        quantity: toApiQuantity(quantity.value),
        note: note.value.trim() || null,
      },
    });
    toast.add({ title: t('consumables.returnDialog.done'), color: 'success', duration: 4000 });
    visible.value = false;
  } catch (e) {
    if (
      e instanceof ApiError &&
      [400, 422].includes(e.status) &&
      Object.keys(e.fieldErrors).length
    ) {
      errors.value = Object.fromEntries(
        Object.entries(e.fieldErrors).map(([k, v]) => [k, v.join(' ')]),
      );
    } else error.value = errorMessage(e, t);
  }
}

const warehouses = (q: string) => fetchOptions('locations', q, { extra: { type: 'warehouse' } });
</script>

<template>
  <UModal
    v-model:open="visible"
    :title="t('consumables.returnDialog.title')"
    :description="t('consumables.returnDialog.description')"
  >
    <template #body>
      <form
        v-if="delivery"
        id="return-form"
        class="flex flex-col gap-4"
        novalidate
        @submit.prevent="submit"
      >
        <UAlert v-if="error" color="error" variant="subtle" role="alert" :description="error" />
        <p class="m-0 text-sm text-default">
          {{
            t('consumables.returnDialog.summary', {
              what: formatQuantity(delivered, unit),
              who: delivery.recipient?.name ?? '',
            })
          }}
          {{ t('consumables.returnDialog.remaining', { qty: formatQuantity(remaining, unit) }) }}
        </p>
        <UFormField
          :label="t('consumables.returnDialog.warehouse')"
          name="rt-warehouse"
          required
          :error="touched ? errors['locationId'] : undefined"
        >
          <RemoteSelect
            id="rt-warehouse"
            v-model="warehouse"
            source="warehouses-return"
            :fetcher="warehouses"
            :placeholder="t('consumables.form.warehousePlaceholder')"
          />
        </UFormField>
        <UFormField
          :label="t('consumables.returnDialog.quantity')"
          name="rt-quantity"
          required
          :help="t('consumables.movement.quantityHelp', { max: formatQuantity(remaining, unit) })"
          :error="touched ? errors['quantity'] : undefined"
        >
          <UInput
            id="rt-quantity"
            v-model="quantity"
            inputmode="decimal"
            autocomplete="off"
            class="w-full"
          />
        </UFormField>
        <UFormField :label="t('consumables.returnDialog.note')" name="rt-note">
          <UTextarea id="rt-note" v-model="note" :rows="2" :maxlength="500" class="w-full" />
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
          form="return-form"
          :label="t('consumables.returnDialog.submit')"
          :loading="giveBack.isPending.value"
        />
      </div>
    </template>
  </UModal>
</template>
