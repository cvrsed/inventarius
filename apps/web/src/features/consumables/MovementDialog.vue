<script setup lang="ts">
import {
  ADJUSTMENT_REASONS,
  MAX_BACKDATE_DAYS,
  addDelta,
  compareQuantities,
  earliestReceivedOn,
  formatQuantity,
  receivedOnProblem,
  type ConsumableDetailDto,
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
import AppSelect from '@/shared/ui/AppSelect.vue';
import RemoteSelect, { type RemoteOption } from '@/shared/ui/RemoteSelect.vue';
import { useConfirm } from '@/shared/ui/useConfirm';
import { fetchRecipients, useConsumableMutations } from './api';
import { quantityProblem, toApiQuantity } from './quantity';

export type MovementKindForm = 'receipt' | 'delivery' | 'transfer' | 'adjustment';

const props = defineProps<{ kind: MovementKindForm; consumable: ConsumableDetailDto }>();
const visible = defineModel<boolean>('visible', { required: true });

const { t } = useI18n();
const toast = useToast();
const confirm = useConfirm();
const mutations = useConsumableMutations();

const unit = computed(() => props.consumable.unit);
const today = () => new Date().toLocaleDateString('en-CA');
const earliest = () => earliestReceivedOn(today());

/** Bodega de origen elegida de entre las que tienen stock (entrega y traslado). */
const originId = ref('');
const warehouse = ref<RemoteOption | null>(null);
const destination = ref<RemoteOption | null>(null);
const quantity = ref('');
const receivedOn = ref(today());
const supplier = ref('');
const note = ref('');
const recipientKind = ref<'user' | 'text'>('user');
const recipientUser = ref<RemoteOption | null>(null);
const recipientName = ref('');
const recipientRef = ref('');
const direction = ref<'add' | 'subtract'>('subtract');
const reason = ref('');
const errors = ref<Record<string, string>>({});
const error = ref('');

const balances = computed(
  () => new Map(props.consumable.stockByWarehouse.map((s) => [s.location.id, s.quantity])),
);
const withStock = computed(() =>
  props.consumable.stockByWarehouse.filter((s) => compareQuantities(s.quantity, '0') > 0),
);
const originItems = computed(() =>
  withStock.value.map((s) => ({
    value: s.location.id,
    label: `${s.location.path} — ${formatQuantity(s.quantity, unit.value)}`,
  })),
);
const usesOrigin = computed(() => props.kind === 'delivery' || props.kind === 'transfer');
/** Bodega sobre la que se calcula el saldo: el origen elegido o la bodega buscada. */
const currentLocationId = computed(() =>
  usesOrigin.value ? originId.value : (warehouse.value?.id ?? ''),
);
const currentBalance = computed(() => balances.value.get(currentLocationId.value) ?? '0');
const currentPlace = computed(
  () =>
    props.consumable.stockByWarehouse.find((s) => s.location.id === currentLocationId.value)
      ?.location.path ??
    warehouse.value?.name ??
    '',
);
/** Tope de la cantidad: lo disponible en el origen (entrega, traslado, y ajuste que resta). */
const cap = computed<string | null>(() => {
  if (!currentLocationId.value) return null;
  if (usesOrigin.value || (props.kind === 'adjustment' && direction.value === 'subtract')) {
    return currentBalance.value;
  }
  return null;
});

const decimalsText = computed(() =>
  unit.value.decimals === 0
    ? t('consumables.decimals.none')
    : t('consumables.decimals.some', { n: unit.value.decimals }, unit.value.decimals),
);

watch(
  () => [visible.value, props.kind] as const,
  ([open]) => {
    if (!open) return;
    errors.value = {};
    error.value = '';
    originId.value = originItems.value.length === 1 ? originItems.value[0]!.value : '';
    warehouse.value = null;
    destination.value = null;
    quantity.value = '';
    receivedOn.value = today();
    supplier.value = note.value = recipientName.value = recipientRef.value = reason.value = '';
    recipientKind.value = 'user';
    recipientUser.value = null;
    direction.value = 'subtract';
  },
  { immediate: true },
);

const submitting = computed(() => mutations[mutationKey()].isPending.value);
function mutationKey() {
  return props.kind === 'receipt'
    ? 'receive'
    : props.kind === 'delivery'
      ? 'deliver'
      : props.kind === 'transfer'
        ? 'transfer'
        : 'adjust';
}

function validate(): boolean {
  const e: Record<string, string> = {};
  const required = t('common.required');
  const problem = quantityProblem(quantity.value, unit.value);
  if (problem === 'decimals') {
    e['quantity'] = t('consumables.movement.problems.decimals', { decimals: decimalsText.value });
  } else if (problem) {
    e['quantity'] = t(`consumables.movement.problems.${problem}`);
  } else if (
    cap.value !== null &&
    compareQuantities(toApiQuantity(quantity.value), cap.value) > 0
  ) {
    e['quantity'] = t('consumables.movement.problems.exceeds', {
      max: formatQuantity(cap.value, unit.value),
    });
  }
  if (props.kind === 'receipt' && receivedOn.value) {
    const dateProblem = receivedOnProblem(receivedOn.value, today());
    if (dateProblem) e['receivedOn'] = t(`consumables.movement.problems.date.${dateProblem}`);
  }
  if (usesOrigin.value) {
    if (!originId.value) e[props.kind === 'transfer' ? 'fromLocationId' : 'locationId'] = required;
  } else if (!warehouse.value) e['locationId'] = required;
  if (props.kind === 'transfer') {
    if (!destination.value) e['toLocationId'] = required;
    else if (destination.value.id === originId.value) {
      e['toLocationId'] = t('consumables.movement.problems.sameWarehouse');
    }
  }
  if (props.kind === 'delivery') {
    if (recipientKind.value === 'user' && !recipientUser.value) e['recipientUserId'] = required;
    if (recipientKind.value === 'text' && !recipientName.value.trim())
      e['recipientName'] = required;
  }
  if (props.kind === 'adjustment') {
    if (!reason.value) e['reason'] = required;
    if (reason.value === 'other' && !note.value.trim()) e['note'] = required;
  }
  errors.value = e;
  return Object.keys(e).length === 0;
}

function body(): Record<string, unknown> {
  const q = toApiQuantity(quantity.value);
  const n = note.value.trim() || null;
  switch (props.kind) {
    case 'receipt':
      return {
        locationId: warehouse.value!.id,
        quantity: q,
        receivedOn: receivedOn.value || undefined,
        supplier: supplier.value.trim() || null,
        note: n,
      };
    case 'delivery':
      return {
        locationId: originId.value,
        quantity: q,
        ...(recipientKind.value === 'user'
          ? { recipientUserId: recipientUser.value!.id }
          : {
              recipientName: recipientName.value.trim(),
              ...(recipientRef.value.trim() ? { recipientRef: recipientRef.value.trim() } : {}),
            }),
        note: n,
      };
    case 'transfer':
      return {
        fromLocationId: originId.value,
        toLocationId: destination.value!.id,
        quantity: q,
        note: n,
      };
    case 'adjustment':
      return {
        locationId: warehouse.value!.id,
        direction: direction.value,
        quantity: q,
        reason: reason.value,
        note: n,
      };
  }
}

async function send(): Promise<void> {
  try {
    await mutations[mutationKey()].mutateAsync({ id: props.consumable.id, body: body() });
    toast.add({
      title: t(`consumables.movement.${props.kind}.done`),
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
      errors.value = Object.fromEntries(
        Object.entries(e.fieldErrors).map(([k, v]) => [k, v.join(' ')]),
      );
    } else error.value = errorMessage(e, t);
  }
}

async function submit(): Promise<void> {
  error.value = '';
  if (!validate()) return;
  if (props.kind !== 'adjustment') return send();
  // Un ajuste cambia el stock sin que haya entrado ni salido nada: se confirma viendo el saldo antes y después.
  const q = toApiQuantity(quantity.value);
  const after = addDelta(currentBalance.value, direction.value === 'add' ? q : `-${q}`);
  const ok = await confirm.ask({
    title: t('consumables.movement.confirmAdjustTitle'),
    message: t('consumables.movement.confirmAdjust', {
      where: currentPlace.value,
      before: formatQuantity(currentBalance.value, unit.value),
      after: formatQuantity(after, unit.value),
      reason: t(`consumables.reasons.${reason.value}`),
    }),
    acceptLabel: t('consumables.movement.confirmAdjustAction'),
    rejectLabel: t('common.back'),
  });
  if (ok) await send();
}

const warehouses = (q: string) =>
  fetchOptions('locations', q, { all: props.kind === 'adjustment', extra: { type: 'warehouse' } });
const reasonItems = computed(() =>
  ADJUSTMENT_REASONS.map((r) => ({ value: r, label: t(`consumables.reasons.${r}`) })),
);
const directionItems = computed(() => [
  { value: 'add', label: t('consumables.movement.add') },
  { value: 'subtract', label: t('consumables.movement.subtract') },
]);
const recipientKinds = computed(() => [
  { value: 'user', label: t('consumables.movement.recipientUser') },
  { value: 'text', label: t('consumables.movement.recipientText') },
]);
const quantityHelp = computed(() =>
  cap.value !== null
    ? t('consumables.movement.quantityHelp', { max: formatQuantity(cap.value, unit.value) })
    : t('consumables.form.decimalsHelp', { decimals: decimalsText.value }),
);
</script>

<template>
  <UModal
    v-model:open="visible"
    :title="t(`consumables.movement.${kind}.title`)"
    :description="t(`consumables.movement.${kind}.description`)"
  >
    <template #body>
      <form id="movement-form" class="flex flex-col gap-4" novalidate @submit.prevent="submit">
        <UAlert v-if="error" color="error" variant="subtle" role="alert" :description="error" />

        <!-- Bodega: de origen (con stock a la vista) o cualquiera según el movimiento. -->
        <UFormField
          v-if="usesOrigin"
          :label="
            kind === 'transfer'
              ? t('consumables.movement.from')
              : t('consumables.movement.warehouse')
          "
          name="mv-origin"
          required
          :error="errors[kind === 'transfer' ? 'fromLocationId' : 'locationId']"
        >
          <AppSelect
            id="mv-origin"
            v-model="originId"
            :items="originItems"
            :placeholder="t('consumables.form.warehousePlaceholder')"
            class="w-full"
          />
        </UFormField>
        <UFormField
          v-else
          :label="t('consumables.movement.warehouse')"
          name="mv-warehouse"
          required
          :error="errors['locationId']"
        >
          <RemoteSelect
            id="mv-warehouse"
            v-model="warehouse"
            :source="`warehouses-${kind}`"
            :fetcher="warehouses"
            :placeholder="t('consumables.form.warehousePlaceholder')"
          />
        </UFormField>
        <p v-if="kind === 'adjustment' && warehouse" class="m-0 -mt-2 text-sm text-muted">
          {{
            t('consumables.movement.available', {
              name: warehouse.name,
              qty: formatQuantity(currentBalance, unit),
            })
          }}
        </p>

        <UFormField
          v-if="kind === 'transfer'"
          :label="t('consumables.movement.to')"
          name="mv-destination"
          required
          :error="errors['toLocationId']"
        >
          <RemoteSelect
            id="mv-destination"
            v-model="destination"
            source="warehouses-transfer-to"
            :fetcher="warehouses"
            :placeholder="t('consumables.form.warehousePlaceholder')"
          />
        </UFormField>

        <UFormField
          v-if="kind === 'adjustment'"
          :label="t('consumables.movement.direction')"
          name="mv-direction"
          required
        >
          <AppSelect id="mv-direction" v-model="direction" :items="directionItems" class="w-full" />
        </UFormField>

        <UFormField
          :label="t('consumables.movement.quantity')"
          name="mv-quantity"
          required
          :help="quantityHelp"
          :error="errors['quantity']"
        >
          <UInput
            id="mv-quantity"
            v-model="quantity"
            inputmode="decimal"
            autocomplete="off"
            class="w-full"
          />
        </UFormField>

        <template v-if="kind === 'receipt'">
          <UFormField
            :label="t('consumables.movement.receivedOn')"
            name="mv-date"
            :help="t('consumables.movement.receivedOnHelp', { days: MAX_BACKDATE_DAYS })"
            :error="errors['receivedOn']"
          >
            <UInput
              id="mv-date"
              v-model="receivedOn"
              type="date"
              :min="earliest()"
              :max="today()"
              class="w-full"
            />
          </UFormField>
          <UFormField :label="t('consumables.movement.supplier')" name="mv-supplier">
            <UInput id="mv-supplier" v-model="supplier" :maxlength="120" class="w-full" />
          </UFormField>
        </template>

        <template v-if="kind === 'delivery'">
          <UFormField :label="t('consumables.movement.recipientKind')" name="mv-rkind">
            <AppSelect
              id="mv-rkind"
              v-model="recipientKind"
              :items="recipientKinds"
              class="w-full"
            />
          </UFormField>
          <UFormField
            v-if="recipientKind === 'user'"
            :label="t('consumables.movement.recipientPerson')"
            name="mv-recipient"
            required
            :error="errors['recipientUserId']"
          >
            <RemoteSelect
              id="mv-recipient"
              v-model="recipientUser"
              source="consumable-recipients"
              :fetcher="fetchRecipients"
              :placeholder="t('consumables.movement.recipientPlaceholder')"
            />
          </UFormField>
          <template v-else>
            <UFormField
              :label="t('consumables.movement.recipientName')"
              name="mv-rname"
              required
              :error="errors['recipientName']"
            >
              <UInput id="mv-rname" v-model="recipientName" :maxlength="120" class="w-full" />
            </UFormField>
            <UFormField
              :label="t('consumables.movement.recipientRef')"
              name="mv-rref"
              :help="t('consumables.movement.recipientRefHelp')"
              :error="errors['recipientRef']"
            >
              <UInput id="mv-rref" v-model="recipientRef" :maxlength="40" class="w-full" />
            </UFormField>
          </template>
        </template>

        <UFormField
          v-if="kind === 'adjustment'"
          :label="t('consumables.movement.reason')"
          name="mv-reason"
          required
          :error="errors['reason']"
        >
          <AppSelect
            id="mv-reason"
            v-model="reason"
            :items="reasonItems"
            :placeholder="t('consumables.movement.reasonPlaceholder')"
            class="w-full"
          />
        </UFormField>

        <UFormField
          :label="
            reason === 'other'
              ? t('consumables.movement.noteRequired')
              : t('consumables.movement.note')
          "
          name="mv-note"
          :required="reason === 'other'"
          :error="errors['note']"
        >
          <UTextarea id="mv-note" v-model="note" :rows="2" :maxlength="500" class="w-full" />
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
          form="movement-form"
          :label="t(`consumables.movement.${kind}.submit`)"
          :loading="submitting"
        />
      </div>
    </template>
  </UModal>
</template>
