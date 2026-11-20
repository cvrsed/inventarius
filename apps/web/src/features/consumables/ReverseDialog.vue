<script setup lang="ts">
import {
  addDelta,
  formatQuantity,
  negateDelta,
  type ConsumableDetailDto,
  type MovementDto,
} from '@inventarius/shared';
import UAlert from '@nuxt/ui/components/Alert.vue';
import UButton from '@nuxt/ui/components/Button.vue';
import UFormField from '@nuxt/ui/components/FormField.vue';
import UModal from '@nuxt/ui/components/Modal.vue';
import UTextarea from '@nuxt/ui/components/Textarea.vue';
import { useToast } from '@nuxt/ui/composables/useToast';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { errorMessage } from '@/features/auth/errors';
import { ApiError } from '@/shared/api/http';
import { formatDateTime } from '@/shared/format/format';
import { useConsumableMutations } from './api';
import { describeMovement } from './movements';

const props = defineProps<{ movement: MovementDto | null; consumable: ConsumableDetailDto }>();
const visible = defineModel<boolean>('visible', { required: true });

const { t } = useI18n();
const toast = useToast();
const { reverse } = useConsumableMutations();

const reason = ref('');
const fieldError = ref('');
const error = ref('');

watch(visible, (open) => {
  if (!open) return;
  reason.value = '';
  fieldError.value = error.value = '';
});

const unit = computed(() => props.consumable.unit);
const balanceAt = (id: string) =>
  props.consumable.stockByWarehouse.find((s) => s.location.id === id)?.quantity ?? '0';

/** Qué le pasa al stock de cada bodega tocada (un traslado toca dos), antes y después de anular. */
const effects = computed(() => {
  const m = props.movement;
  if (!m) return [];
  const legs = [{ id: m.location.id, name: m.location.name, delta: negateDelta(m.delta) }];
  if (m.counterpartLocation) {
    legs.push({ id: m.counterpartLocation.id, name: m.counterpartLocation.name, delta: m.delta });
  }
  return legs.map((l) => {
    const before = balanceAt(l.id);
    const after = addDelta(before, l.delta);
    return { ...l, before, after, negative: after.startsWith('-') };
  });
});
const blocked = computed(() => effects.value.find((e) => e.negative));
const what = computed(() => {
  const m = props.movement;
  if (!m) return '';
  const v = describeMovement(m, unit.value, t);
  return `${v.headline} (${m.counterpartLocation ? '' : `${v.place}, `}${formatDateTime(m.occurredAt)})`;
});

async function submit(): Promise<void> {
  error.value = fieldError.value = '';
  if (!reason.value.trim()) {
    fieldError.value = t('common.required');
    return;
  }
  try {
    await reverse.mutateAsync({ movementId: props.movement!.id, reason: reason.value.trim() });
    toast.add({ title: t('consumables.reverse.done'), color: 'success', duration: 4000 });
    visible.value = false;
  } catch (e) {
    if (
      e instanceof ApiError &&
      [400, 422].includes(e.status) &&
      Object.keys(e.fieldErrors).length
    ) {
      fieldError.value = Object.values(e.fieldErrors).flat().join(' ');
    } else error.value = errorMessage(e, t);
  }
}
</script>

<template>
  <UModal
    v-model:open="visible"
    :title="t('consumables.reverse.title')"
    :description="t('consumables.reverse.description')"
  >
    <template #body>
      <form id="reverse-form" class="flex flex-col gap-4" novalidate @submit.prevent="submit">
        <UAlert v-if="error" color="error" variant="subtle" role="alert" :description="error" />
        <p class="m-0 font-medium text-highlighted">
          {{ t('consumables.reverse.summary', { what }) }}
        </p>
        <ul class="m-0 flex list-none flex-col gap-1 p-0 text-sm">
          <li v-for="e in effects" :key="e.id">
            {{
              t('consumables.reverse.effect', {
                where: e.name,
                before: formatQuantity(e.before, unit),
                after: e.negative
                  ? '−' + formatQuantity(e.after.slice(1), unit)
                  : formatQuantity(e.after, unit),
              })
            }}
          </li>
        </ul>
        <UAlert
          v-if="blocked"
          color="warning"
          variant="subtle"
          role="alert"
          :description="t('consumables.reverse.negative', { where: blocked.name })"
        />
        <UFormField
          :label="t('consumables.reverse.reason')"
          name="rv-reason"
          required
          :help="t('consumables.reverse.reasonHelp')"
          :error="fieldError || undefined"
        >
          <UTextarea id="rv-reason" v-model="reason" :rows="2" :maxlength="300" class="w-full" />
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
          form="reverse-form"
          :label="t('consumables.reverse.submit')"
          :loading="reverse.isPending.value"
          :disabled="!!blocked"
        />
      </div>
    </template>
  </UModal>
</template>
