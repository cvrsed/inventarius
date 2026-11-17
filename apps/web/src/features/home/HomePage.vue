<script setup lang="ts">
import UAlert from '@nuxt/ui/components/Alert.vue';
import UButton from '@nuxt/ui/components/Button.vue';
import UIcon from '@nuxt/ui/components/Icon.vue';
import USkeleton from '@nuxt/ui/components/Skeleton.vue';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/features/auth/useAuthStore';
import StatusCard from '@/features/system/StatusCard.vue';
import { formatDateOnly, formatDateTime } from '@/shared/format/format';
import { useDashboard } from './api';
import HomeBars, { type BarItem } from './HomeBars.vue';
import HomeTile from './HomeTile.vue';
import { hasNoAssets, isFieldTech, links } from './summary';

const { t, te } = useI18n();
const auth = useAuthStore();
const { data, isPending, isError, refetch } = useDashboard();

const canRead = computed(() => auth.can('asset:read'));
const tech = computed(() => isFieldTech(auth.can));
/** El estado del sistema es solo para administradores (quien gestiona roles). */
const isAdmin = computed(() => auth.can('role:manage'));
const empty = computed(() => hasNoAssets(data.value));

const kindBars = computed<BarItem[]>(() =>
  (data.value?.byStatusKind ?? []).map((k) => ({
    key: k.kind,
    label: t(`catalog.kinds.${k.kind}`),
    count: k.count,
    to: links.statusKind(k.kind),
  })),
);
const categoryBars = computed<BarItem[]>(() =>
  (data.value?.byCategory ?? []).map((c) => ({
    key: c.id,
    label: c.name,
    count: c.count,
    to: links.category(c.id),
  })),
);
const warehouseBars = computed<BarItem[]>(() =>
  (data.value?.stockByWarehouse ?? []).map((w) => ({
    key: w.id,
    label: w.name,
    count: w.count,
    to: links.warehouse(w.id),
  })),
);

const actionLabel = (action: string) =>
  te(`home.recent.${action}`) ? t(`home.recent.${action}`) : action;
</script>

<template>
  <div class="flex flex-col gap-6">
    <h1 class="m-0 text-2xl font-semibold text-highlighted">{{ t('home.title') }}</h1>

    <template v-if="canRead">
      <div
        v-if="isPending"
        class="flex flex-col gap-3"
        role="status"
        :aria-label="t('home.loading')"
      >
        <USkeleton class="h-20 w-full" />
        <USkeleton class="h-40 w-full" />
      </div>

      <UAlert v-else-if="isError" color="error" variant="subtle" role="alert">
        <template #description>
          {{ t('home.error') }}
          <UButton
            class="ml-2"
            :label="t('common.retry')"
            size="sm"
            variant="link"
            @click="refetch()"
          />
        </template>
      </UAlert>

      <template v-else-if="data">
        <!-- Técnico: sus equipos en lugar de los totales. -->
        <section v-if="tech" aria-labelledby="mine-title" class="flex flex-col gap-3">
          <h2 id="mine-title" class="m-0 text-lg font-semibold text-highlighted">
            {{ t('home.mine') }}
          </h2>
          <p v-if="!data.mine.length" class="m-0 text-muted">{{ t('home.mineEmpty') }}</p>
          <ul v-else class="m-0 flex list-none flex-col gap-2 p-0">
            <li v-for="m in data.mine" :key="m.id">
              <RouterLink
                :to="{ name: 'asset', params: { id: m.id } }"
                class="flex min-h-11 flex-col gap-1 rounded-lg border border-default p-3 no-underline hover:bg-elevated"
              >
                <span class="flex flex-wrap items-baseline justify-between gap-2">
                  <span class="font-semibold text-highlighted">{{ m.assetTag }}</span>
                  <span class="text-sm text-muted">{{
                    t('home.since', { date: formatDateTime(m.since) })
                  }}</span>
                </span>
                <span class="text-default">{{ m.name }}</span>
                <span v-if="m.expectedReturnOn" class="text-sm text-muted">
                  {{ t('home.returnOn', { date: formatDateOnly(m.expectedReturnOn) }) }}
                </span>
              </RouterLink>
            </li>
          </ul>
        </section>

        <section
          v-else-if="empty"
          class="flex flex-col items-center gap-2 py-8 text-center"
          aria-labelledby="empty-title"
        >
          <UIcon name="i-lucide-box" class="size-10 text-muted" aria-hidden="true" />
          <h2 id="empty-title" class="m-0 text-lg font-semibold">{{ t('home.emptyTitle') }}</h2>
          <p class="m-0 max-w-md text-muted">{{ t('home.emptyBody') }}</p>
          <UButton :to="{ name: 'assets' }" :label="t('home.goToAssets')" />
        </section>

        <template v-else>
          <section aria-labelledby="totals-title">
            <h2 id="totals-title" class="sr-only">{{ t('home.totals') }}</h2>
            <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <HomeTile
                :label="t('home.pendingSetup')"
                :value="data.totals.pendingSetup"
                :to="links.pendingSetup()"
                highlight
              />
              <HomeTile :label="t('home.total')" :value="data.totals.total" :to="links.total()" />
              <HomeTile
                :label="t('home.available')"
                :value="data.totals.available"
                :to="links.available()"
              />
              <HomeTile
                :label="t('home.assigned')"
                :value="data.totals.assigned"
                :to="links.assigned()"
              />
            </div>
          </section>

          <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <section aria-labelledby="kind-title" class="flex flex-col gap-2">
              <h2 id="kind-title" class="m-0 text-lg font-semibold text-highlighted">
                {{ t('home.byStatus') }}
              </h2>
              <HomeBars :items="kindBars" :empty-text="t('home.noData')" />
            </section>
            <section aria-labelledby="category-title" class="flex flex-col gap-2">
              <h2 id="category-title" class="m-0 text-lg font-semibold text-highlighted">
                {{ t('home.byCategory') }}
              </h2>
              <HomeBars :items="categoryBars" :empty-text="t('home.noData')" />
            </section>
            <section aria-labelledby="stock-title" class="flex flex-col gap-2">
              <h2 id="stock-title" class="m-0 text-lg font-semibold text-highlighted">
                {{ t('home.stock') }}
              </h2>
              <p class="m-0 text-sm text-muted">{{ t('home.stockHint') }}</p>
              <HomeBars :items="warehouseBars" :empty-text="t('home.noData')" />
            </section>
            <section aria-labelledby="overdue-title" class="flex flex-col gap-2">
              <h2 id="overdue-title" class="m-0 text-lg font-semibold text-highlighted">
                {{ t('home.overdue') }}
              </h2>
              <p v-if="!data.overdue.count" class="m-0 text-sm text-muted">
                {{ t('home.overdueNone') }}
              </p>
              <template v-else>
                <RouterLink
                  :to="links.overdue()"
                  class="inline-flex min-h-11 items-center self-start text-sm font-medium text-primary underline"
                >
                  {{ t('home.overdueAll', { n: data.overdue.count }, data.overdue.count) }}
                </RouterLink>
                <ul class="m-0 flex list-none flex-col gap-1 p-0">
                  <li v-for="o in data.overdue.items" :key="o.id">
                    <RouterLink
                      :to="{ name: 'asset', params: { id: o.id } }"
                      class="flex min-h-11 flex-col justify-center rounded-md px-1 no-underline hover:bg-elevated"
                    >
                      <span class="text-sm">
                        <span class="font-semibold text-highlighted">{{ o.assetTag }}</span>
                        {{ o.name }}
                      </span>
                      <span class="text-xs text-muted">
                        {{ o.assignedTo ?? '—' }} ·
                        {{ t('home.dueOn', { date: formatDateOnly(o.expectedReturnOn) }) }}
                      </span>
                    </RouterLink>
                  </li>
                </ul>
              </template>
            </section>
          </div>

          <section aria-labelledby="recent-title" class="flex flex-col gap-2">
            <h2 id="recent-title" class="m-0 text-lg font-semibold text-highlighted">
              {{ t('home.recentTitle') }}
            </h2>
            <p v-if="!data.recent.length" class="m-0 text-sm text-muted">{{ t('home.noData') }}</p>
            <ol v-else class="m-0 flex list-none flex-col gap-1 p-0">
              <li v-for="r in data.recent" :key="r.id">
                <component
                  :is="r.assetId ? 'RouterLink' : 'div'"
                  :to="r.assetId ? { name: 'asset', params: { id: r.assetId } } : undefined"
                  class="flex min-h-11 flex-col justify-center rounded-md px-1 no-underline hover:bg-elevated"
                >
                  <span class="text-sm">
                    <span class="font-medium text-highlighted">{{ actionLabel(r.action) }}</span>
                    {{ r.assetTag ?? '' }} {{ r.assetName ?? '' }}
                  </span>
                  <span class="text-xs text-muted">
                    {{ formatDateTime(r.at) }} ·
                    {{ t('assets.history.by', { name: r.actorName ?? '—' }) }}
                  </span>
                </component>
              </li>
            </ol>
          </section>
        </template>
      </template>
    </template>

    <StatusCard v-if="isAdmin" compact />
  </div>
</template>
