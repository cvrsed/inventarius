<script setup lang="ts">
import type { DashboardSummary } from '@inventarius/shared';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { auditActionLabel } from '@/app/i18n/audit';
import { actorDisplay } from '@/features/audit/actor';
import { useAuthStore } from '@/features/auth/useAuthStore';
import { useRecentConsumableMovements } from '@/features/consumables/api';
import { describeMovement } from '@/features/consumables/movements';
import { formatDate, formatDateTime } from '@/shared/format/format';

/**
 * «Últimos movimientos» de Inicio: los eventos de activos (quien puede leer activos) y los movimientos de consumibles
 * (quien puede leer consumibles) en una sola lista por fecha, con el mismo formato que el historial de cada uno (P10).
 */
const props = defineProps<{ assets: DashboardSummary['recent'] }>();
const LIMIT = 5;

const { t } = useI18n();
const auth = useAuthStore();
const { data: consumables } = useRecentConsumableMovements(
  computed(() => auth.can('consumables:read')),
  LIMIT,
);

type Entry =
  | { kind: 'asset'; key: string; at: string; item: DashboardSummary['recent'][number] }
  | {
      kind: 'consumable';
      key: string;
      at: string;
      headline: string;
      place: string;
      placeTitle: string | undefined;
      name: string;
      id: string;
      date: string;
      by: string | null;
    };

const entries = computed<Entry[]>(() => {
  const fromAssets = props.assets.map((item): Entry => ({
    kind: 'asset',
    key: `a-${item.id}`,
    at: item.at,
    item,
  }));
  const fromConsumables = (consumables.value ?? []).map((r): Entry => {
    const view = describeMovement(r.movement, r.consumable.unit, t as never);
    return {
      kind: 'consumable',
      key: `c-${r.movement.id}`,
      at: r.movement.registeredAt,
      headline: view.headline,
      place: view.place,
      placeTitle: view.route?.title,
      name: r.consumable.name,
      id: r.consumable.id,
      date: r.movement.backdated
        ? formatDate(r.movement.occurredAt)
        : formatDateTime(r.movement.occurredAt),
      by: r.movement.actor?.name ?? null,
    };
  });
  return [...fromAssets, ...fromConsumables]
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
    .slice(0, LIMIT);
});
</script>

<template>
  <section aria-labelledby="recent-title" class="flex flex-col gap-2">
    <h2 id="recent-title" class="m-0 text-lg font-semibold text-highlighted">
      {{ t('home.recentTitle') }}
    </h2>
    <p v-if="!entries.length" class="m-0 text-sm text-muted">{{ t('home.noData') }}</p>
    <ol v-else class="m-0 flex list-none flex-col gap-1 p-0">
      <li v-for="e in entries" :key="e.key">
        <component
          :is="e.kind === 'asset' ? (e.item.assetId ? 'RouterLink' : 'div') : 'RouterLink'"
          :to="
            e.kind === 'consumable'
              ? { name: 'consumable', params: { id: e.id } }
              : e.item.assetId
                ? { name: 'asset', params: { id: e.item.assetId } }
                : undefined
          "
          class="flex min-h-11 flex-col justify-center rounded-md px-1 no-underline hover:bg-elevated"
        >
          <template v-if="e.kind === 'asset'">
            <span class="text-sm">
              <span class="font-medium text-highlighted">{{
                auditActionLabel(e.item.action)
              }}</span>
              {{ e.item.assetTag ?? '' }} {{ e.item.assetName ?? '' }}
            </span>
            <span class="text-xs text-muted">
              {{ formatDateTime(e.item.at) }} ·
              {{ t('assets.history.by', { name: actorDisplay(e.item, t) }) }}
            </span>
          </template>
          <template v-else>
            <span class="text-sm">
              <span class="font-medium text-highlighted">{{ e.headline }}</span>
              {{ e.name }}
            </span>
            <span class="text-xs text-muted">
              <template v-if="e.place"
                ><span :title="e.placeTitle">{{ e.place }}</span> · </template
              >{{ e.date }}
              <template v-if="e.by"> · {{ t('assets.history.by', { name: e.by }) }}</template>
            </span>
          </template>
        </component>
      </li>
    </ol>
  </section>
</template>
