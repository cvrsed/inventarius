<script setup lang="ts">
import {
  HISTORY_KINDS,
  compareQuantities,
  formatQuantity,
  type MovementDto,
  type WarehouseStockDto,
} from '@inventarius/shared';
import UAlert from '@nuxt/ui/components/Alert.vue';
import UBadge from '@nuxt/ui/components/Badge.vue';
import UButton from '@nuxt/ui/components/Button.vue';
import UIcon from '@nuxt/ui/components/Icon.vue';
import UInput from '@nuxt/ui/components/Input.vue';
import { useToast } from '@nuxt/ui/composables/useToast';
import { computed, nextTick, onBeforeUnmount, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { errorMessage } from '@/features/auth/errors';
import { useAuthStore } from '@/features/auth/useAuthStore';
import { ApiError } from '@/shared/api/http';
import { formatDate, formatDateTime } from '@/shared/format/format';
import AppSelect from '@/shared/ui/AppSelect.vue';
import ReasonButton from '@/shared/ui/ReasonButton.vue';
import ResponsiveTable from '@/shared/ui/ResponsiveTable.vue';
import { useConfirm } from '@/shared/ui/useConfirm';
import {
  useConsumable,
  useConsumableMovements,
  useConsumableMutations,
  type HistoryFilters,
} from './api';
import ConsumableFormDialog from './ConsumableFormDialog.vue';
import MovementDialog, { type MovementKindForm } from './MovementDialog.vue';
import { lowStockLabel } from './lowStock';
import { ACTION_ICONS, MOVEMENT_ICONS, describeMovement } from './movements';
import ReturnDialog from './ReturnDialog.vue';
import ReverseDialog from './ReverseDialog.vue';
import WarehouseSelect, { type WarehouseOption } from './WarehouseSelect.vue';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const toast = useToast();
const confirm = useConfirm();

const id = computed(() => String(route.params['id']));
const { data: consumable, isPending, isError, error: loadError, refetch } = useConsumable(id);
const { update, remove } = useConsumableMutations();

const notFound = computed(
  () => loadError.value instanceof ApiError && loadError.value.status === 404,
);
const unit = computed(() => consumable.value?.unit);
const inactive = computed(() => consumable.value?.active === false);
const hasStock = computed(() =>
  (consumable.value?.stockByWarehouse ?? []).some((s) => compareQuantities(s.quantity, '0') > 0),
);

// --- Acciones ---
const movementKind = ref<MovementKindForm | null>(null);
const movementOpen = computed({
  get: () => movementKind.value !== null,
  set: (v: boolean) => {
    if (!v) movementKind.value = null;
  },
});
const editing = ref(false);
const reversing = ref<MovementDto | null>(null);
const returning = ref<MovementDto | null>(null);
const returnOpen = computed({
  get: () => returning.value !== null,
  set: (v: boolean) => {
    if (!v) returning.value = null;
  },
});
const reverseOpen = computed({
  get: () => reversing.value !== null,
  set: (v: boolean) => {
    if (!v) reversing.value = null;
  },
});

const reasonFor = (kind: MovementKindForm): string | undefined => {
  if (inactive.value && kind !== 'adjustment') return t('consumables.blocked.inactive');
  if (kind === 'delivery' && !hasStock.value) return t('consumables.blocked.noStock');
  if (kind === 'transfer' && !hasStock.value) return t('consumables.blocked.noTransferStock');
  return undefined;
};

async function run(action: () => Promise<unknown>, okKey: string): Promise<void> {
  try {
    await action();
    toast.add({ title: t(okKey), color: 'success', duration: 4000 });
  } catch (e) {
    toast.add({ title: errorMessage(e, t), color: 'error', duration: 6000 });
  }
}
const toggleActive = () =>
  run(
    () =>
      update.mutateAsync({
        id: consumable.value!.id,
        version: consumable.value!.updatedAt,
        body: { active: !consumable.value!.active },
      }),
    'consumables.form.toggled',
  );
/** Activar no pregunta; desactivar sí (P18), diciendo qué deja de admitir. */
function onToggle(): void {
  if (!consumable.value!.active) return void toggleActive();
  confirm.require({
    title: t('consumables.form.deactivateTitle'),
    message: t('consumables.form.deactivateMessage'),
    rows: [
      { label: t('consumables.form.confirmRows.consumable'), value: consumable.value!.name },
      {
        label: t('consumables.form.confirmRows.stock'),
        value: qty(consumable.value!.totalStock),
        highlight: true,
      },
    ],
    bullets: (['entries', 'allows', 'alerts'] as const).map((k) =>
      t(`consumables.form.deactivateBlocks.${k}`),
    ),
    footnote: t('consumables.form.deactivateFootnote'),
    acceptLabel: t('consumables.actions.deactivate'),
    rejectLabel: t('common.cancel'),
    accept: toggleActive,
  });
}
function askDelete(): void {
  confirm.require({
    title: t('consumables.form.deleteTitle'),
    message: t('consumables.form.deleteMessage'),
    rows: [{ label: t('consumables.form.confirmRows.consumable'), value: consumable.value!.name }],
    footnote: t('consumables.form.deleteFootnote'),
    acceptLabel: t('common.delete'),
    rejectLabel: t('common.cancel'),
    danger: true,
    accept: () =>
      run(async () => {
        await remove.mutateAsync(consumable.value!.id);
        await router.replace({ name: 'consumables' });
      }, 'consumables.form.deleted'),
  });
}

// --- Stock por bodega ---
const stockColumns = computed(() => [
  { id: 'warehouse', header: t('consumables.stock.warehouse') },
  { id: 'quantity', header: t('consumables.stock.quantity') },
  { id: 'minimum', header: t('consumables.stock.minimum') },
]);
const qty = (v: string) => formatQuantity(v, unit.value!);
/** Ruta de los padres de una bodega («Zensi › Chile»), como en los selectores; vacía si es de primer nivel. */
const parentsOf = (path: string): string => path.split(' > ').slice(0, -1).join(' › ');
/** Las bodegas que están bajo su propio mínimo: la alerta las nombra (P9). */
const stockBelowMinimum = computed(() =>
  (consumable.value?.stockByWarehouse ?? []).filter((w) => w.belowMinimum && w.minQuantity),
);

// --- Historial ---
const filters = ref<HistoryFilters>({ locationId: '', kind: '', from: '', to: '' });
const {
  data: history,
  isPending: historyPending,
  isError: historyError,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
} = useConsumableMovements(id, filters);
const movements = computed(() => history.value?.pages.flatMap((p) => p.data) ?? []);
const views = computed(() =>
  unit.value ? movements.value.map((m) => ({ m, view: describeMovement(m, unit.value!, t) })) : [],
);
const filtered = computed(() => Object.values(filters.value).some((v) => v !== ''));
/** Bodegas del filtro del historial: las que tienen o tuvieron stock de este consumible, con su stock a la derecha. */
const warehouseItems = computed<WarehouseOption[]>(() =>
  (consumable.value?.stockByWarehouse ?? []).map((s: WarehouseStockDto) => ({
    id: s.location.id,
    name: s.location.name,
    parents: s.location.path.split(' > ').slice(0, -1).join(' › '),
    stock: qty(s.quantity),
    ...(s.location.active ? {} : { note: t('consumables.stock.inactiveWarehouse') }),
  })),
);
const kindItems = computed(() => [
  { value: '', label: t('consumables.history.allKinds') },
  ...HISTORY_KINDS.map((k) => ({ value: k, label: t(`consumables.kinds.${k}`) })),
]);
const setFilter = (key: keyof HistoryFilters, value: string | number) => {
  filters.value = { ...filters.value, [key]: String(value) };
};
const clearFilters = () => (filters.value = { locationId: '', kind: '', from: '', to: '' });

const kindLabel = (kind: string) => t(`consumables.kinds.${kind}`);
const present = (movementId: string) => movements.value.some((m) => m.id === movementId);
const highlighted = ref('');
/** Cuánto dura el resaltado antes de empezar a desvanecerse (la transición lo apaga en 1 s). */
const HIGHLIGHT_MS = 3500;
let highlightTimer: ReturnType<typeof setTimeout> | undefined;
onBeforeUnmount(() => clearTimeout(highlightTimer));
async function goTo(movementId: string): Promise<void> {
  highlighted.value = movementId;
  clearTimeout(highlightTimer);
  highlightTimer = setTimeout(() => (highlighted.value = ''), HIGHLIGHT_MS);
  await nextTick();
  const target = document.getElementById(`mov-${movementId}`);
  target?.scrollIntoView({ block: 'center' });
  // El foco va al movimiento: quien usa lector de pantalla oye adónde llegó.
  target?.focus({ preventScroll: true });
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <RouterLink
      :to="{ name: 'consumables' }"
      class="inline-flex min-h-11 items-center gap-1 self-start text-sm text-muted"
    >
      <UIcon name="i-lucide-arrow-left" class="size-4" aria-hidden="true" />
      {{ t('consumables.backToList') }}
    </RouterLink>

    <p v-if="isPending" class="m-0 text-muted">{{ t('consumables.loading') }}</p>
    <UAlert
      v-else-if="notFound"
      color="warning"
      variant="subtle"
      :description="t('consumables.notFound')"
    />
    <UAlert v-else-if="isError" color="error" variant="subtle" role="alert">
      <template #description>
        {{ t('common.genericError') }}
        <UButton
          class="ml-2"
          :label="t('common.retry')"
          size="sm"
          variant="link"
          @click="refetch()"
        />
      </template>
    </UAlert>

    <template v-else-if="consumable && unit">
      <header class="flex flex-col gap-2">
        <h1 class="m-0 text-2xl font-semibold break-words text-highlighted">
          {{ consumable.name }}
        </h1>
        <div class="flex flex-wrap items-center gap-2">
          <UBadge
            :label="consumable.active ? t('common.active') : t('common.inactive')"
            :color="consumable.active ? 'success' : 'warning'"
            variant="subtle"
          />
          <UBadge
            v-if="consumable.lowStock"
            :label="lowStockLabel(consumable, t)"
            color="warning"
            variant="subtle"
            icon="i-lucide-triangle-alert"
          />
          <span class="text-sm text-muted">{{ consumable.category.name }} · {{ unit.name }}</span>
        </div>
      </header>

      <UAlert
        v-if="inactive"
        color="neutral"
        variant="subtle"
        :description="t('consumables.inactiveNotice')"
      />
      <UAlert v-if="consumable.lowStock" color="warning" variant="subtle" role="status">
        <template #description>
          <span v-if="consumable.belowMinimum" class="block">
            {{
              t('consumables.belowGlobal', {
                total: qty(consumable.totalStock),
                min: qty(consumable.minStock!),
              })
            }}
          </span>
          <span
            v-for="w in stockBelowMinimum"
            :key="w.location.id"
            class="block"
            data-testid="below-warehouse"
          >
            {{
              t('consumables.belowWarehouse', {
                name: w.location.name,
                qty: qty(w.quantity),
                min: qty(w.minQuantity!),
              })
            }}
          </span>
        </template>
      </UAlert>

      <div
        class="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap"
        role="group"
        :aria-label="t('consumables.title')"
      >
        <ReasonButton
          v-if="auth.can('consumables:receive')"
          block
          :icon="ACTION_ICONS.receive"
          :label="t('consumables.actions.receive')"
          :reason="reasonFor('receipt')"
          @click="movementKind = 'receipt'"
        />
        <ReasonButton
          v-if="auth.can('consumables:deliver')"
          block
          :icon="ACTION_ICONS.deliver"
          :label="t('consumables.actions.deliver')"
          :reason="reasonFor('delivery')"
          @click="movementKind = 'delivery'"
        />
        <ReasonButton
          v-if="auth.can('consumables:transfer')"
          block
          :icon="ACTION_ICONS.transfer"
          color="neutral"
          variant="outline"
          :label="t('consumables.actions.transfer')"
          :reason="reasonFor('transfer')"
          @click="movementKind = 'transfer'"
        />
        <ReasonButton
          v-if="auth.can('consumables:adjust')"
          block
          :icon="ACTION_ICONS.adjust"
          color="neutral"
          variant="outline"
          :label="t('consumables.actions.adjust')"
          @click="movementKind = 'adjustment'"
        />
        <template v-if="auth.can('consumables:manage')">
          <UButton
            class="w-full justify-center sm:w-auto"
            icon="i-lucide-pencil"
            :label="t('common.edit')"
            color="neutral"
            variant="outline"
            @click="editing = true"
          />
          <UButton
            class="w-full justify-center sm:w-auto"
            :icon="consumable.active ? 'i-lucide-power-off' : 'i-lucide-power'"
            :label="
              consumable.active
                ? t('consumables.actions.deactivate')
                : t('consumables.actions.activate')
            "
            color="neutral"
            variant="outline"
            @click="onToggle"
          />
          <ReasonButton
            block
            icon="i-lucide-trash-2"
            :label="t('consumables.actions.delete')"
            color="error"
            variant="outline"
            :reason="consumable.hasMovements ? t('consumables.blocked.hasMovements') : undefined"
            @click="askDelete"
          />
        </template>
      </div>

      <section class="rounded-lg border border-default p-4" aria-labelledby="cs-summary">
        <h2 id="cs-summary" class="sr-only">{{ t('consumables.stock.title') }}</h2>
        <dl class="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          <dt class="text-muted">{{ t('consumables.summary.total') }}</dt>
          <dd class="m-0 font-semibold text-highlighted">{{ qty(consumable.totalStock) }}</dd>
          <dt class="text-muted">{{ t('consumables.summary.minimum') }}</dt>
          <dd class="m-0">
            {{ consumable.minStock ? qty(consumable.minStock) : t('consumables.noMinimum') }}
          </dd>
          <template v-if="consumable.notes">
            <dt class="text-muted">{{ t('consumables.summary.notes') }}</dt>
            <dd class="m-0 break-words">{{ consumable.notes }}</dd>
          </template>
        </dl>
      </section>

      <section class="flex flex-col gap-3" aria-labelledby="cs-stock">
        <h2 id="cs-stock" class="m-0 text-lg font-semibold text-highlighted">
          {{ t('consumables.stock.title') }}
        </h2>
        <ResponsiveTable
          :data="consumable.stockByWarehouse"
          :columns="stockColumns"
          :get-row-id="(s: WarehouseStockDto) => s.location.id"
        >
          <template #warehouse-cell="{ row }">
            <span class="flex flex-col">
              <span class="font-medium break-words text-highlighted">
                {{ row.original.location.name }}
                <UBadge
                  v-if="!row.original.location.active"
                  :label="t('consumables.stock.inactiveWarehouse')"
                  color="neutral"
                  variant="subtle"
                  class="ml-1"
                />
              </span>
              <span
                v-if="parentsOf(row.original.location.path)"
                class="text-xs break-words text-muted"
                data-testid="stock-path"
                >{{ parentsOf(row.original.location.path) }}</span
              >
            </span>
          </template>
          <template #quantity-cell="{ row }">
            <span class="flex flex-wrap items-center gap-2">
              {{ qty(row.original.quantity) }}
              <UBadge
                v-if="row.original.belowMinimum"
                :label="t('consumables.lowBadge')"
                color="warning"
                variant="subtle"
                icon="i-lucide-triangle-alert"
              />
            </span>
          </template>
          <template #minimum-cell="{ row }">
            <!-- Una bodega inactiva conserva su mínimo pero ya no avisa: se ve atenuado y con la nota (D16). -->
            <span
              v-if="row.original.minQuantity && !row.original.location.active"
              class="text-muted"
              data-testid="inactive-minimum"
            >
              {{ qty(row.original.minQuantity) }}
              <span class="text-xs">({{ t('consumables.stock.inactiveMinimum') }})</span>
            </span>
            <template v-else>
              {{
                row.original.minQuantity
                  ? qty(row.original.minQuantity)
                  : t('consumables.noMinimum')
              }}
            </template>
          </template>
          <template #empty>{{ t('consumables.stock.empty') }}</template>
          <template #card="{ item }">
            <span class="flex flex-col">
              <span class="font-semibold break-words text-highlighted">
                {{ item.location.name }}
                <UBadge
                  v-if="!item.location.active"
                  :label="t('consumables.stock.inactiveWarehouse')"
                  color="neutral"
                  variant="subtle"
                  class="ml-1"
                />
              </span>
              <span
                v-if="parentsOf(item.location.path)"
                class="text-xs break-words text-muted"
                data-testid="stock-path"
                >{{ parentsOf(item.location.path) }}</span
              >
            </span>
            <dl class="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              <dt class="text-muted">{{ t('consumables.stock.quantity') }}</dt>
              <dd class="m-0 flex flex-wrap items-center gap-2">
                {{ qty(item.quantity) }}
                <UBadge
                  v-if="item.belowMinimum"
                  :label="t('consumables.lowBadge')"
                  color="warning"
                  variant="subtle"
                  icon="i-lucide-triangle-alert"
                />
              </dd>
              <dt class="text-muted">{{ t('consumables.stock.minimum') }}</dt>
              <dd
                class="m-0"
                :class="item.minQuantity && !item.location.active ? 'text-muted' : ''"
                :data-testid="
                  item.minQuantity && !item.location.active ? 'inactive-minimum' : undefined
                "
              >
                {{ item.minQuantity ? qty(item.minQuantity) : t('consumables.noMinimum') }}
                <span v-if="item.minQuantity && !item.location.active" class="text-xs"
                  >({{ t('consumables.stock.inactiveMinimum') }})</span
                >
              </dd>
            </dl>
          </template>
        </ResponsiveTable>
      </section>

      <section class="flex flex-col gap-3" aria-labelledby="cs-history">
        <h2 id="cs-history" class="m-0 text-lg font-semibold text-highlighted">
          {{ t('consumables.history.title') }}
        </h2>
        <div class="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <label class="flex flex-col gap-1 text-sm">
            <span class="text-muted">{{ t('consumables.history.filterWarehouse') }}</span>
            <WarehouseSelect
              id="hs-warehouse"
              :model-value="filters.locationId"
              :items="warehouseItems"
              :all-label="t('consumables.history.allWarehouses')"
              :placeholder="t('consumables.history.allWarehouses')"
              @update:model-value="(v: string) => setFilter('locationId', v)"
            />
          </label>
          <label class="flex flex-col gap-1 text-sm">
            <span class="text-muted">{{ t('consumables.history.filterKind') }}</span>
            <AppSelect
              :model-value="filters.kind"
              :items="kindItems"
              class="w-full"
              @update:model-value="(v: string | number) => setFilter('kind', v)"
            />
          </label>
          <label class="flex flex-col gap-1 text-sm">
            <span class="text-muted">{{ t('consumables.history.filterFrom') }}</span>
            <UInput
              :model-value="filters.from"
              type="date"
              class="w-full"
              @update:model-value="(v: string | number) => setFilter('from', v)"
            />
          </label>
          <label class="flex flex-col gap-1 text-sm">
            <span class="text-muted">{{ t('consumables.history.filterTo') }}</span>
            <UInput
              :model-value="filters.to"
              type="date"
              class="w-full"
              @update:model-value="(v: string | number) => setFilter('to', v)"
            />
          </label>
        </div>
        <UButton
          v-if="filtered"
          icon="i-lucide-x"
          :label="t('consumables.history.clear')"
          color="neutral"
          variant="ghost"
          size="sm"
          class="self-start"
          @click="clearFilters"
        />

        <p v-if="historyPending" class="m-0 text-muted">{{ t('common.loading') }}</p>
        <p v-else-if="historyError" class="m-0 text-error" role="alert">
          {{ t('common.genericError') }}
        </p>
        <p v-else-if="!views.length" class="m-0 text-muted">
          {{ filtered ? t('consumables.history.emptyFiltered') : t('consumables.history.empty') }}
        </p>
        <ol v-else class="m-0 flex list-none flex-col gap-4 p-0">
          <li
            v-for="{ m, view } in views"
            :id="`mov-${m.id}`"
            :key="m.id"
            tabindex="-1"
            class="flex gap-3 rounded-lg border-2 border-transparent p-1 transition-colors duration-1000 outline-none motion-reduce:transition-none"
            :class="highlighted === m.id ? 'border-primary bg-primary/15' : ''"
          >
            <span
              class="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-elevated"
            >
              <UIcon :name="MOVEMENT_ICONS[m.kind]" class="size-4" aria-hidden="true" />
            </span>
            <div class="min-w-0 flex-1">
              <p class="m-0 flex flex-wrap items-center gap-x-2 font-medium text-highlighted">
                <span>{{ view.headline }}</span>
                <UBadge
                  v-if="m.reversedBy"
                  :label="t('consumables.history.reversedBadge')"
                  color="neutral"
                  variant="subtle"
                />
              </p>
              <p
                class="m-0 text-sm text-default"
                :title="view.route?.title"
                :data-testid="view.route ? 'transfer-route' : undefined"
              >
                {{ view.place }}
              </p>
              <p v-if="m.backdated" class="m-0 text-sm text-muted">
                {{ formatDate(m.occurredAt) }}
              </p>
              <p v-if="m.backdated" class="m-0 text-sm text-muted">
                {{
                  m.actor
                    ? t('consumables.history.registeredOn', {
                        date: formatDateTime(m.registeredAt),
                        name: m.actor.name,
                      })
                    : t('consumables.history.registeredOnAnon', {
                        date: formatDateTime(m.registeredAt),
                      })
                }}
              </p>
              <p v-else class="m-0 text-sm text-muted">
                {{ formatDateTime(m.occurredAt) }}
                <template v-if="m.actor">
                  · {{ t('consumables.history.by', { name: m.actor.name }) }}</template
                >
              </p>
              <ul
                v-if="view.lines.length"
                class="m-0 mt-1 flex list-none flex-col gap-1 p-0 text-sm"
              >
                <li v-for="line in view.lines" :key="line.label" class="break-words">
                  <UBadge :label="line.label" color="neutral" variant="subtle" class="mr-1" />
                  <span class="text-default">{{ line.value }}</span>
                </li>
              </ul>
              <p v-if="m.reverses" class="m-0 mt-1 text-sm text-muted">
                {{
                  t('consumables.history.reverses', {
                    kind: kindLabel(m.reverses.kind).toLowerCase(),
                    date: formatDateTime(m.reverses.at),
                  })
                }}
                <a
                  v-if="present(m.reverses.id)"
                  :href="`#mov-${m.reverses.id}`"
                  class="ml-1 whitespace-nowrap underline"
                  @click.prevent="goTo(m.reverses.id)"
                  >{{ t('consumables.history.goTo') }}</a
                >
              </p>
              <p
                v-if="m.returned !== null && compareQuantities(m.returned, '0') > 0"
                class="m-0 mt-1 text-sm text-default"
              >
                {{
                  t('consumables.history.returned', {
                    returned: qty(m.returned),
                    total: qty(m.delta.replace('-', '')),
                  })
                }}
                <span v-if="!m.reversedBy" class="block text-muted">{{
                  t('consumables.history.returnsBlockReverse')
                }}</span>
              </p>
              <p v-if="m.returnOf" class="m-0 mt-1 text-sm text-muted">
                {{ t('consumables.history.returnOf', { date: formatDateTime(m.returnOf.at) }) }}
                <a
                  v-if="present(m.returnOf.id)"
                  :href="`#mov-${m.returnOf.id}`"
                  class="ml-1 whitespace-nowrap underline"
                  @click.prevent="goTo(m.returnOf.id)"
                  >{{ t('consumables.history.goTo') }}</a
                >
              </p>
              <p v-if="m.reversedBy" class="m-0 mt-1 text-sm text-muted">
                {{
                  m.reversedBy.actorName
                    ? t('consumables.history.reversedBy', {
                        name: m.reversedBy.actorName,
                        date: formatDateTime(m.reversedBy.at),
                      })
                    : t('consumables.history.reversedByUnknown', {
                        date: formatDateTime(m.reversedBy.at),
                      })
                }}
                <a
                  v-if="present(m.reversedBy.id)"
                  :href="`#mov-${m.reversedBy.id}`"
                  class="ml-1 whitespace-nowrap underline"
                  @click.prevent="goTo(m.reversedBy.id)"
                  >{{ t('consumables.history.goTo') }}</a
                >
              </p>
              <div class="mt-2 flex flex-wrap gap-2">
                <UButton
                  v-if="m.returnable && !inactive && auth.can('consumables:deliver')"
                  :icon="ACTION_ICONS.return"
                  :label="t('consumables.actions.return')"
                  :aria-label="`${t('consumables.actions.return')}: ${view.headline}`"
                  color="neutral"
                  variant="outline"
                  size="sm"
                  @click="returning = m"
                />
                <UButton
                  v-if="m.reversible && auth.can('consumables:reverse')"
                  :icon="ACTION_ICONS.reverse"
                  :label="t('consumables.actions.reverse')"
                  :aria-label="`${t('consumables.actions.reverse')} ${view.headline}`"
                  color="neutral"
                  variant="outline"
                  size="sm"
                  @click="reversing = m"
                />
              </div>
            </div>
          </li>
        </ol>
        <UButton
          v-if="hasNextPage"
          :label="t('consumables.history.more')"
          :loading="isFetchingNextPage"
          color="neutral"
          variant="subtle"
          class="self-start"
          @click="fetchNextPage()"
        />
      </section>

      <MovementDialog
        v-if="movementKind"
        v-model:visible="movementOpen"
        :kind="movementKind"
        :consumable="consumable"
      />
      <ReturnDialog v-model:visible="returnOpen" :delivery="returning" :consumable="consumable" />
      <ReverseDialog v-model:visible="reverseOpen" :movement="reversing" :consumable="consumable" />
      <ConsumableFormDialog v-model:visible="editing" :item="consumable" />
    </template>
  </div>
</template>
