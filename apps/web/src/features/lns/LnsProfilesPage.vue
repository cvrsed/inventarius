<script setup lang="ts">
import type { LnsProfileDto } from '@inventarius/shared';
import UAlert from '@nuxt/ui/components/Alert.vue';
import UBadge from '@nuxt/ui/components/Badge.vue';
import UButton from '@nuxt/ui/components/Button.vue';
import { useToast } from '@nuxt/ui/composables/useToast';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { errorMessage } from '@/features/auth/errors';
import IconAction from '@/shared/ui/IconAction.vue';
import PagedFooter from '@/shared/ui/PagedFooter.vue';
import ResponsiveTable from '@/shared/ui/ResponsiveTable.vue';
import { useConfirm } from '@/shared/ui/useConfirm';
import { useLnsProfileMutations, useLnsProfiles } from './api';
import LnsProfileFormDialog from './LnsProfileFormDialog.vue';

const { t } = useI18n();
const toast = useToast();
const confirm = useConfirm();
const page = ref(1);
const { data, isPending, isError, refetch } = useLnsProfiles(page);
const { remove, test } = useLnsProfileMutations();

const formVisible = ref(false);
const editing = ref<LnsProfileDto | null>(null);
const open = (p: LnsProfileDto | null) => {
  editing.value = p;
  formVisible.value = true;
};

const columns = computed(() => [
  { id: 'name', header: t('lns.columns.name') },
  { id: 'kind', header: t('lns.columns.kind') },
  { accessorKey: 'endpoint', header: t('lns.columns.endpoint') },
  { accessorKey: 'registeredDevices', header: t('lns.columns.devices') },
  { id: 'state', header: t('lns.columns.state') },
  { id: 'actions', header: t('common.actions') },
]);

/** Resultado de «Probar conexión» por perfil: se muestra junto al perfil, sin la credencial. */
const results = ref<Record<string, { ok: boolean; text: string }>>({});

async function runTest(p: LnsProfileDto): Promise<void> {
  try {
    const res = await test.mutateAsync(p);
    const failed = res.checks.filter((c) => !c.ok);
    const detail = failed
      .map((c) => `${t(`lns.test.checks.${c.name}`)}: ${c.detail ?? ''}`)
      .join(' · ');
    results.value = {
      ...results.value,
      [p.id]: {
        ok: res.ok,
        text: res.ok
          ? t('lns.test.ok', { ms: res.latencyMs })
          : `${t('lns.test.fail', { ms: res.latencyMs })}${detail ? ` — ${detail}` : ''}`,
      },
    };
  } catch (e) {
    results.value = { ...results.value, [p.id]: { ok: false, text: errorMessage(e, t) } };
  }
}

function askDelete(p: LnsProfileDto): void {
  confirm.require({
    title: t('common.delete'),
    message: t('lns.deleteConfirm', { name: p.name }),
    acceptLabel: t('common.delete'),
    rejectLabel: t('common.cancel'),
    danger: true,
    accept: async () => {
      try {
        await remove.mutateAsync(p);
        toast.add({ title: t('lns.deleted'), color: 'success', duration: 4000 });
      } catch (e) {
        toast.add({ title: errorMessage(e, t), color: 'error', duration: 6000 });
      }
    },
  });
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="m-0 text-2xl font-semibold text-highlighted">{{ t('lns.title') }}</h1>
        <p class="m-0 mt-1 text-sm text-muted">{{ t('lns.description') }}</p>
      </div>
      <UButton icon="i-lucide-plus" :label="t('lns.new')" @click="open(null)" />
    </div>

    <UAlert v-if="isError" color="error" variant="subtle" role="alert">
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

    <ResponsiveTable
      :data="data?.data ?? []"
      :columns="columns"
      :loading="isPending"
      :get-row-id="(p: LnsProfileDto) => p.id"
    >
      <template #empty>{{ t('lns.empty') }}</template>
      <template #name-cell="{ row }">
        <span class="font-medium">{{ row.original.name }}</span>
        <span
          v-if="results[row.original.id]"
          class="block text-sm"
          :class="results[row.original.id]!.ok ? 'text-success' : 'text-error'"
          role="status"
        >
          {{ results[row.original.id]!.text }}
        </span>
      </template>
      <template #kind-cell="{ row }">{{ t(`lns.kinds.${row.original.kind}`) }}</template>
      <template #state-cell="{ row }">
        <UBadge
          :label="row.original.active ? t('common.active') : t('common.inactive')"
          :color="row.original.active ? 'success' : 'neutral'"
          variant="subtle"
        />
      </template>
      <template #actions-cell="{ row }">
        <span class="flex gap-1">
          <IconAction
            icon="i-lucide-plug-zap"
            :label="t('lns.test.action')"
            :target="row.original.name"
            @click="runTest(row.original)"
          />
          <IconAction
            icon="i-lucide-pencil"
            :label="t('common.edit')"
            :target="row.original.name"
            @click="open(row.original)"
          />
          <IconAction
            v-if="row.original.registeredDevices === 0"
            icon="i-lucide-trash-2"
            :label="t('common.delete')"
            :target="row.original.name"
            color="error"
            @click="askDelete(row.original)"
          />
        </span>
      </template>
      <template #card="{ item }">
        <div class="flex flex-wrap items-center gap-2">
          <span class="font-semibold text-highlighted">{{ item.name }}</span>
          <UBadge
            :label="item.active ? t('common.active') : t('common.inactive')"
            :color="item.active ? 'success' : 'neutral'"
            variant="subtle"
          />
        </div>
        <p class="m-0 text-sm text-muted">{{ t(`lns.kinds.${item.kind}`) }}</p>
        <p class="m-0 text-sm break-all text-muted">{{ item.endpoint }}</p>
        <p class="m-0 text-sm text-muted">{{ t('lns.devices') }}: {{ item.registeredDevices }}</p>
        <p
          v-if="results[item.id]"
          class="m-0 text-sm"
          :class="results[item.id]!.ok ? 'text-success' : 'text-error'"
          role="status"
        >
          {{ results[item.id]!.text }}
        </p>
        <div class="flex flex-wrap gap-2">
          <UButton
            icon="i-lucide-plug-zap"
            :label="t('lns.test.action')"
            :aria-label="`${t('lns.test.action')} ${item.name}`"
            color="neutral"
            variant="outline"
            size="sm"
            @click="runTest(item)"
          />
          <UButton
            icon="i-lucide-pencil"
            :label="t('common.edit')"
            :aria-label="`${t('common.edit')} ${item.name}`"
            color="neutral"
            variant="outline"
            size="sm"
            @click="open(item)"
          />
          <UButton
            v-if="item.registeredDevices === 0"
            icon="i-lucide-trash-2"
            :label="t('common.delete')"
            :aria-label="`${t('common.delete')} ${item.name}`"
            color="error"
            variant="outline"
            size="sm"
            @click="askDelete(item)"
          />
        </div>
      </template>
    </ResponsiveTable>

    <PagedFooter
      :page="page"
      :page-size="25"
      :total="data?.meta.total ?? 0"
      :page-sizes="[25]"
      @update:page="(n: number) => (page = n)"
      @update:page-size="() => undefined"
    />

    <LnsProfileFormDialog v-model:visible="formVisible" :profile="editing" />
  </div>
</template>
