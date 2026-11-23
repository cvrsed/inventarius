<script setup lang="ts">
import {
  ADJUSTMENT_REASONS,
  MAX_BACKDATE_DAYS,
  addDelta,
  compareQuantities,
  earliestReceivedOn,
  formatDecimal,
  formatQuantity,
  normalizeDelta,
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
import { ApiError } from '@/shared/api/http';
import AppSelect from '@/shared/ui/AppSelect.vue';
import RemoteSelect, { type RemoteOption } from '@/shared/ui/RemoteSelect.vue';
import { useConfirm } from '@/shared/ui/useConfirm';
import { fetchRecipients, useConsumableMutations, useWarehouses, type WarehouseInfo } from './api';
import { quantityProblem, toApiQuantity } from './quantity';
import WarehouseSelect, { type WarehouseOption } from './WarehouseSelect.vue';

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

/** Bodega elegida: de origen (entrega, traslado, ajuste que resta) o la que recibe (ingreso, ajuste que suma). */
const warehouseId = ref('');
const destinationId = ref('');
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
/** Se muestran los errores de un campo solo después de intentar enviar (P15). */
const attempted = ref(false);

const { data: allWarehouses } = useWarehouses();
const balances = computed(
  () => new Map(props.consumable.stockByWarehouse.map((s) => [s.location.id, s.quantity])),
);
const balanceOf = (id: string) => balances.value.get(id) ?? '0';
const usesOrigin = computed(() => props.kind === 'delivery' || props.kind === 'transfer');
/** `exit`: saca stock de la bodega (se elige entre las que tienen); `entry`: lo mete (la bodega debe estar activa, P7). */
const mainMode = computed<'exit' | 'entry'>(() =>
  usesOrigin.value || (props.kind === 'adjustment' && direction.value === 'subtract')
    ? 'exit'
    : 'entry',
);

function optionOf(w: WarehouseInfo, mode: 'exit' | 'entry'): WarehouseOption {
  const balance = balanceOf(w.id);
  const hasStock = compareQuantities(balance, '0') > 0;
  const option: WarehouseOption = {
    id: w.id,
    name: w.name,
    parents: w.parents,
    stock: formatQuantity(balance, unit.value),
  };
  if (mode === 'exit' && !hasStock) option.disabledReason = t('consumables.picker.noStock');
  else if (mode === 'entry' && !w.active)
    option.disabledReason = t('consumables.picker.inactiveEntry');
  else if (!w.active) option.note = t('consumables.picker.inactiveExit');
  return option;
}
const mainItems = computed(() =>
  (allWarehouses.value ?? []).map((w) => optionOf(w, mainMode.value)),
);
const destinationItems = computed(() =>
  (allWarehouses.value ?? []).map((w) => {
    const o = optionOf(w, 'entry');
    if (w.id === warehouseId.value) o.disabledReason = t('consumables.picker.sameAsOrigin');
    return o;
  }),
);
const enabledMain = computed(() => mainItems.value.filter((o) => !o.disabledReason));
const selected = (items: WarehouseOption[], id: string) => items.find((o) => o.id === id);
// Con una sola bodega de la que se pueda sacar stock, queda elegida sola (las bodegas llegan después de abrir el diálogo).
watch(
  enabledMain,
  (list) => {
    if (visible.value && usesOrigin.value && !warehouseId.value && list.length === 1) {
      warehouseId.value = list[0]!.id;
    }
  },
  { immediate: true },
);

/** Bodega sobre la que se calcula el saldo. */
const currentLocationId = computed(() => warehouseId.value);
const currentBalance = computed(() => balanceOf(currentLocationId.value));
const currentName = computed(() => selected(mainItems.value, warehouseId.value)?.name ?? '');
const currentPlace = computed(
  () =>
    props.consumable.stockByWarehouse.find((s) => s.location.id === currentLocationId.value)
      ?.location.path ?? currentName.value,
);
/** Tope de la cantidad: lo disponible en el origen (entrega, traslado, y ajuste que resta). */
const cap = computed<string | null>(() => {
  if (!currentLocationId.value) return null;
  if (mainMode.value === 'exit') return currentBalance.value;
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
    attempted.value = false;
    warehouseId.value =
      usesOrigin.value && enabledMain.value.length === 1 ? enabledMain.value[0]!.id : '';
    destinationId.value = '';
    quantity.value = '';
    receivedOn.value = today();
    supplier.value = note.value = recipientName.value = recipientRef.value = reason.value = '';
    recipientKind.value = 'user';
    recipientUser.value = null;
    direction.value = 'subtract';
  },
  { immediate: true },
);
// Al cambiar el sentido de un ajuste, la bodega elegida puede dejar de servir (p. ej. sin stock para restar).
watch(direction, () => {
  if (selected(mainItems.value, warehouseId.value)?.disabledReason) warehouseId.value = '';
});
// La de origen no puede ser también el destino.
watch(warehouseId, (id) => {
  if (id && id === destinationId.value) destinationId.value = '';
});

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
  if (!warehouseId.value) e[props.kind === 'transfer' ? 'fromLocationId' : 'locationId'] = required;
  if (props.kind === 'transfer') {
    if (!destinationId.value) e['toLocationId'] = required;
    else if (destinationId.value === warehouseId.value) {
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
        locationId: warehouseId.value,
        quantity: q,
        receivedOn: receivedOn.value || undefined,
        supplier: supplier.value.trim() || null,
        note: n,
      };
    case 'delivery':
      return {
        locationId: warehouseId.value,
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
        fromLocationId: warehouseId.value,
        toLocationId: destinationId.value,
        quantity: q,
        note: n,
      };
    case 'adjustment':
      return {
        locationId: warehouseId.value,
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
  const row = (key: string, value: string, highlight = false) => ({
    label: t(`consumables.movement.confirmAdjustRows.${key}`),
    value,
    ...(highlight ? { highlight } : {}),
  });
  const ok = await confirm.ask({
    title: t('consumables.movement.confirmAdjustTitle'),
    message: t('consumables.movement.confirmAdjust'),
    rows: [
      row('warehouse', currentPlace.value),
      row('direction', t(`consumables.movement.${direction.value === 'add' ? 'add' : 'subtract'}`)),
      row('quantity', formatQuantity(q, unit.value)),
      row(
        'balance',
        `${formatDecimal(normalizeDelta(currentBalance.value))} → ${formatDecimal(normalizeDelta(after))}`,
        true,
      ),
      row('reason', t(`consumables.reasons.${reason.value}`)),
      ...(note.value.trim() ? [row('note', note.value.trim())] : []),
    ],
    footnote: t('consumables.movement.confirmAdjustFootnote'),
    acceptLabel: t('consumables.movement.confirmAdjustAction'),
    rejectLabel: t('common.back'),
  });
  if (ok) await send();
}

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
/**
 * Una sola línea bajo la cantidad (D7): en el ajuste, el stock disponible al sumar y el máximo al restar; en entrega y
 * traslado, el máximo. Sin bodega elegida, lo que admite la unidad.
 */
const quantityHelp = computed(() => {
  const decimals = t('consumables.form.decimalsHelp', { decimals: decimalsText.value });
  if (props.kind === 'adjustment' && warehouseId.value) {
    return cap.value !== null
      ? t('consumables.movement.maxSubtractHelp', {
          name: currentName.value,
          max: formatQuantity(cap.value, unit.value),
        })
      : t('consumables.movement.availableHelp', {
          name: currentName.value,
          qty: formatQuantity(currentBalance.value, unit.value),
        });
  }
  return cap.value !== null
    ? t('consumables.movement.quantityHelp', { max: formatQuantity(cap.value, unit.value) })
    : decimals;
});
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

        <UFormField
          v-if="kind === 'adjustment'"
          :label="t('consumables.movement.direction')"
          name="mv-direction"
          required
        >
          <AppSelect id="mv-direction" v-model="direction" :items="directionItems" class="w-full" />
        </UFormField>

        <!-- Bodega: nombre, ruta y stock; las que no sirven para esta acción se ven apagadas con el motivo (P7, P13). -->
        <UFormField
          :label="
            kind === 'transfer'
              ? t('consumables.movement.from')
              : t('consumables.movement.warehouse')
          "
          name="mv-warehouse"
          required
          :error="errors[kind === 'transfer' ? 'fromLocationId' : 'locationId']"
        >
          <WarehouseSelect
            id="mv-warehouse"
            v-model="warehouseId"
            :items="mainItems"
            :placeholder="t('consumables.form.warehousePlaceholder')"
          />
        </UFormField>

        <UFormField
          v-if="kind === 'transfer'"
          :label="t('consumables.movement.to')"
          name="mv-destination"
          required
          :error="errors['toLocationId']"
        >
          <WarehouseSelect
            id="mv-destination"
            v-model="destinationId"
            :items="destinationItems"
            :placeholder="t('consumables.form.warehousePlaceholder')"
          />
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
