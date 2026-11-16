<script setup lang="ts">
import UAlert from '@nuxt/ui/components/Alert.vue';
import UBadge from '@nuxt/ui/components/Badge.vue';
import UButton from '@nuxt/ui/components/Button.vue';
import { useToast } from '@nuxt/ui/composables/useToast';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import { errorMessage } from '@/features/auth/errors';
import { useAuthStore } from '@/features/auth/useAuthStore';
import { useConfirm } from '@/shared/ui/useConfirm';
import AssetActionDialog from './AssetActionDialog.vue';
import AssetHistory from './AssetHistory.vue';
import CheckoutDialog from './CheckoutDialog.vue';
import { useAsset, useAssetMutations } from './api';
import { statusColor } from './status';

const { t, d } = useI18n();
const route = useRoute();
const auth = useAuthStore();
const toast = useToast();
const confirm = useConfirm();

const id = computed(() => String(route.params['id']));
const { data: asset, isPending, isError, refetch } = useAsset(id);
const { restore } = useAssetMutations();

const assigned = computed(
  () => !!asset.value && !!(asset.value.assignedUser || asset.value.assignedLocation),
);
const deleted = computed(() => asset.value?.deleted === true);
const assigneeName = computed(
  () => asset.value?.assignedUser?.name ?? asset.value?.assignedLocation?.name ?? '',
);
const canAssign = computed(
  () => !assigned.value && asset.value?.status.kind === 'deployable' && auth.can('asset:checkout'),
);

const dialog = ref<'checkout' | 'checkin' | 'status' | 'delete' | null>(null);
const open = computed({
  get: () => dialog.value !== null,
  set: (v: boolean) => {
    if (!v) dialog.value = null;
  },
});
const actionMode = computed(() =>
  dialog.value === 'checkin' || dialog.value === 'status' || dialog.value === 'delete'
    ? dialog.value
    : 'status',
);

function askRestore(): void {
  confirm.require({
    title: t('assets.actions.restore'),
    message: t('assets.restore.confirm'),
    acceptLabel: t('assets.actions.restore'),
    rejectLabel: t('common.cancel'),
    accept: async () => {
      try {
        await restore.mutateAsync(id.value);
        toast.add({ title: t('assets.restore.done'), color: 'success', duration: 4000 });
      } catch (e) {
        toast.add({ title: errorMessage(e, t), color: 'error', duration: 6000 });
      }
    },
  });
}

const rows = computed(() => {
  const a = asset.value;
  if (!a) return [];
  return [
    [t('assets.fields.model'), `${a.manufacturer.name} ${a.model.name}`],
    [t('assets.fields.category'), a.category.name],
    [t('assets.fields.serial'), a.serial],
    [t('assets.fields.purchaseDate'), a.purchaseDate],
    [
      t('assets.fields.purchaseCost'),
      a.purchaseCost === null ? null : `$${a.purchaseCost.toLocaleString('es-CL')}`,
    ],
    [t('assets.fields.supplier'), a.supplier],
    [t('assets.fields.warrantyEndsOn'), a.warrantyEndsOn],
    [t('assets.fields.notes'), a.notes],
  ].filter(([, v]) => v !== null && v !== '') as [string, string][];
});
</script>

<template>
  <div class="mx-auto flex max-w-3xl flex-col gap-5">
    <UButton
      :to="{ name: 'assets' }"
      icon="i-lucide-arrow-left"
      :label="t('assets.title')"
      color="neutral"
      variant="ghost"
      class="self-start"
    />

    <p v-if="isPending" class="text-muted">{{ t('common.loading') }}</p>
    <UAlert v-else-if="isError || !asset" color="error" variant="subtle" role="alert">
      <template #description>
        {{ t('assets.notFound') }}
        <UButton
          class="ml-2"
          :label="t('common.retry')"
          size="sm"
          variant="link"
          @click="refetch()"
        />
      </template>
    </UAlert>

    <template v-else>
      <header class="flex flex-col gap-2">
        <p class="m-0 text-sm font-medium text-muted">{{ asset.assetTag }}</p>
        <h1 class="m-0 text-2xl font-semibold break-words text-highlighted">{{ asset.name }}</h1>
        <div class="flex flex-wrap items-center gap-2">
          <UBadge
            :label="asset.status.name"
            :color="statusColor(asset.status.kind)"
            variant="subtle"
          />
          <UBadge
            v-if="deleted"
            :label="t('assets.deletedBadge')"
            color="neutral"
            variant="subtle"
          />
          <span class="text-sm text-muted">
            {{ asset.location?.name ?? t('assets.noLocation') }} ·
            {{ assigneeName || t('assets.unassigned') }}
          </span>
        </div>
      </header>

      <UAlert
        v-if="deleted"
        color="warning"
        variant="subtle"
        :title="t('assets.deletedBadge')"
        :description="asset.deleteReason ?? ''"
      />

      <div
        class="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap"
        role="group"
        :aria-label="t('assets.history.title')"
      >
        <template v-if="!deleted">
          <UButton
            v-if="assigned && auth.can('asset:checkout')"
            icon="i-lucide-undo-2"
            :label="t('assets.actions.checkin')"
            @click="dialog = 'checkin'"
          />
          <UButton
            v-else-if="canAssign"
            icon="i-lucide-user-plus"
            :label="t('assets.actions.checkout')"
            @click="dialog = 'checkout'"
          />
          <UButton
            v-if="auth.can('asset:write') && !assigned"
            icon="i-lucide-arrow-right-left"
            :label="t('assets.actions.changeStatus')"
            color="neutral"
            variant="outline"
            @click="dialog = 'status'"
          />
          <UButton
            v-if="auth.can('asset:write')"
            :to="{ name: 'asset-edit', params: { id } }"
            icon="i-lucide-pencil"
            :label="t('assets.actions.edit')"
            color="neutral"
            variant="outline"
          />
          <UButton
            v-if="auth.can('asset:delete') && !assigned"
            icon="i-lucide-archive"
            :label="t('assets.actions.delete')"
            color="error"
            variant="outline"
            @click="dialog = 'delete'"
          />
        </template>
        <UButton
          v-else-if="auth.can('asset:restore')"
          icon="i-lucide-archive-restore"
          :label="t('assets.actions.restore')"
          @click="askRestore"
        />
      </div>

      <section
        v-if="asset.assignment"
        class="rounded-lg border border-default p-4"
        aria-labelledby="assignment-title"
      >
        <h2 id="assignment-title" class="m-0 mb-2 text-lg font-semibold text-highlighted">
          {{ t('assets.assignment.current') }}
        </h2>
        <dl class="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          <dt class="text-muted">{{ t('assets.fields.assignedUser') }}</dt>
          <dd class="m-0">{{ assigneeName }}</dd>
          <dt class="text-muted">{{ t('assets.assignment.since') }}</dt>
          <dd class="m-0">{{ d(new Date(asset.assignment.since), 'long') }}</dd>
          <template v-if="asset.assignment.expectedReturnOn">
            <dt class="text-muted">{{ t('assets.assignment.expected') }}</dt>
            <dd class="m-0">{{ asset.assignment.expectedReturnOn }}</dd>
          </template>
          <template v-if="asset.assignment.note">
            <dt class="text-muted">{{ t('assets.assignment.note') }}</dt>
            <dd class="m-0 break-words">{{ asset.assignment.note }}</dd>
          </template>
        </dl>
      </section>

      <section class="rounded-lg border border-default p-4" aria-labelledby="details-title">
        <h2 id="details-title" class="m-0 mb-2 text-lg font-semibold text-highlighted">
          {{ t('assets.sections.details') }}
        </h2>
        <dl class="m-0 grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-[auto_1fr]">
          <template v-for="[label, value] in rows" :key="label">
            <dt class="text-muted">{{ label }}</dt>
            <dd class="m-0 break-words">{{ value }}</dd>
          </template>
        </dl>
      </section>

      <AssetHistory :asset-id="asset.id" />

      <CheckoutDialog
        :visible="dialog === 'checkout'"
        :asset="asset"
        @update:visible="open = $event"
      />
      <AssetActionDialog
        :visible="dialog === 'checkin' || dialog === 'status' || dialog === 'delete'"
        :asset="asset"
        :mode="actionMode"
        @update:visible="open = $event"
      />
    </template>
  </div>
</template>
