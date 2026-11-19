<script setup lang="ts">
import type { AssetDto } from '@inventarius/shared';
import UAlert from '@nuxt/ui/components/Alert.vue';
import UBadge from '@nuxt/ui/components/Badge.vue';
import UButton from '@nuxt/ui/components/Button.vue';
import { useToast } from '@nuxt/ui/composables/useToast';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { errorMessage } from '@/features/auth/errors';
import { useAuthStore } from '@/features/auth/useAuthStore';
import { formatDateTime } from '@/shared/format/format';
import { useConfirm } from '@/shared/ui/useConfirm';
import { useLorawan, useLorawanMutations } from './api';
import LorawanFormDialog from './LorawanFormDialog.vue';
import RegisterLnsDialog from './RegisterLnsDialog.vue';
import RevealKeysDialog from './RevealKeysDialog.vue';
import { lnsActions, lnsStatusColor, lnsStatusKey } from './status';

/** Sección LoRaWAN de la ficha (RF-21, RF-41): datos del dispositivo y su registro en el LNS (RF-60 a RF-64). */
const props = defineProps<{ asset: AssetDto }>();

const { t, te } = useI18n();
const auth = useAuthStore();
const toast = useToast();
const confirm = useConfirm();

const assetId = computed(() => props.asset.id);
const enabled = computed(() => auth.can('lorawan:read'));
const { data, isPending, isError, refetch } = useLorawan(assetId, enabled);
const { deregister, retry, resolve } = useLorawanMutations(assetId);

const dialog = ref<'edit' | 'register' | 'reveal' | null>(null);
const open = (which: 'edit' | 'register' | 'reveal') => (dialog.value = which);
const bind = (which: 'edit' | 'register' | 'reveal') =>
  computed({
    get: () => dialog.value === which,
    set: (v: boolean) => {
      if (!v) dialog.value = null;
    },
  });
const editOpen = bind('edit');
const registerOpen = bind('register');
const revealOpen = bind('reveal');

const registration = computed(() => data.value?.registration ?? null);
const status = computed(() => registration.value?.status ?? null);
const actions = computed(() => lnsActions(status.value));
const busy = computed(() => status.value === 'registering' || status.value === 'deregistering');
const canRegister = computed(() => auth.can('lorawan:register') && !props.asset.deleted);
const canEdit = computed(() => auth.can('asset:write') && !props.asset.deleted);
const hasKeys = computed(() => !!data.value && (data.value.hasAppKey || data.value.hasNwkKey));

const missing = computed(() =>
  (data.value?.missingForRegistration ?? [])
    .map((f) => (te(`lorawan.missingFields.${f}`) ? t(`lorawan.missingFields.${f}`) : f))
    .join(', '),
);
const orphans = computed(() =>
  (registration.value?.orphans ?? [])
    .map((o) =>
      te(`lorawan.registration.orphanNames.${o}`) ? t(`lorawan.registration.orphanNames.${o}`) : o,
    )
    .join(', '),
);

const rows = computed(() => {
  const d = data.value;
  if (!d) return [];
  const none = t('lorawan.notSet');
  const key = (has: boolean) => (has ? t('lorawan.keySet') : t('lorawan.keyUnset'));
  return [
    ['devEui', d.devEui ?? none, true],
    ['joinEui', d.joinEui ?? none, true],
    ['appKey', key(d.hasAppKey), false],
    ['nwkKey', key(d.hasNwkKey), false],
    ['deviceClass', d.deviceClass ?? none, false],
    ['lorawanVersion', d.lorawanVersion ?? none, false],
    ['region', d.region ?? none, false],
    ['activation', d.activation, false],
  ] as [string, string, boolean][];
});

function ask(
  message: string,
  label: string,
  danger: boolean,
  run: () => Promise<unknown>,
  done: string,
) {
  confirm.require({
    title: label,
    message,
    acceptLabel: label,
    rejectLabel: t('common.cancel'),
    danger,
    accept: async () => {
      try {
        await run();
        toast.add({ title: done, color: 'success', duration: 4000 });
      } catch (e) {
        toast.add({ title: errorMessage(e, t), color: 'error', duration: 6000 });
      }
    },
  });
}

const askDeregister = () =>
  ask(
    registration.value?.origin === 'linked'
      ? t('lorawan.confirmDeregisterLinked')
      : t('lorawan.confirmDeregister'),
    t('lorawan.actions.deregister'),
    true,
    () => deregister.mutateAsync(),
    t('lorawan.done.deregister'),
  );
const askResolve = (action: 'link' | 'cancel') =>
  ask(
    action === 'link' ? t('lorawan.confirmLink') : t('lorawan.confirmCancel'),
    t(`lorawan.actions.${action}`),
    action === 'cancel',
    () => resolve.mutateAsync(action),
    t(`lorawan.done.${action}`),
  );
async function doRetry(): Promise<void> {
  try {
    await retry.mutateAsync();
    toast.add({ title: t('lorawan.done.retry'), color: 'success', duration: 4000 });
  } catch (e) {
    toast.add({ title: errorMessage(e, t), color: 'error', duration: 6000 });
  }
}
</script>

<template>
  <section
    v-if="enabled"
    class="rounded-lg border border-default p-4"
    aria-labelledby="lorawan-title"
    data-testid="lorawan-section"
  >
    <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
      <h2 id="lorawan-title" class="m-0 text-lg font-semibold text-highlighted">
        {{ t('lorawan.title') }}
      </h2>
      <UBadge
        v-if="data"
        :label="t(lnsStatusKey(status))"
        :color="lnsStatusColor(status)"
        variant="subtle"
      />
    </div>

    <p v-if="isPending" class="m-0 text-muted">{{ t('common.loading') }}</p>
    <UAlert v-else-if="isError || !data" color="error" variant="subtle" role="alert">
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

    <div v-else class="flex flex-col gap-4">
      <div
        class="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap"
        role="group"
        :aria-label="t('lorawan.registration.title')"
      >
        <template v-if="canRegister">
          <UButton
            v-if="actions.register"
            icon="i-lucide-radio-tower"
            :label="t('lorawan.actions.register')"
            :disabled="data.missingForRegistration.length > 0"
            @click="open('register')"
          />
          <UButton
            v-if="actions.retry"
            icon="i-lucide-refresh-cw"
            :label="t('lorawan.actions.retry')"
            :loading="retry.isPending.value"
            @click="doRetry"
          />
          <UButton
            v-if="actions.resolve"
            icon="i-lucide-link"
            :label="t('lorawan.actions.link')"
            @click="askResolve('link')"
          />
          <UButton
            v-if="actions.resolve"
            icon="i-lucide-x"
            :label="t('lorawan.actions.cancel')"
            color="neutral"
            variant="outline"
            @click="askResolve('cancel')"
          />
          <UButton
            v-if="actions.deregister"
            icon="i-lucide-trash-2"
            :label="t('lorawan.actions.deregister')"
            color="error"
            variant="outline"
            @click="askDeregister"
          />
        </template>
        <UButton
          v-if="canEdit"
          icon="i-lucide-pencil"
          :label="t('lorawan.edit.action')"
          color="neutral"
          variant="outline"
          @click="open('edit')"
        />
        <UButton
          v-if="auth.can('lorawan:keys:reveal') && hasKeys"
          icon="i-lucide-key-round"
          :label="t('lorawan.reveal.action')"
          color="neutral"
          variant="outline"
          @click="open('reveal')"
        />
      </div>

      <UAlert
        v-if="data.missingForRegistration.length && actions.register"
        color="info"
        variant="subtle"
        :description="t('lorawan.missing', { fields: missing })"
      />

      <dl class="m-0 grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-[auto_1fr]">
        <template v-for="[key, value, mono] in rows" :key="key">
          <dt class="text-muted">{{ t(`lorawan.fields.${key}`) }}</dt>
          <dd class="m-0 break-all" :class="mono ? 'font-mono' : ''">{{ value }}</dd>
        </template>
      </dl>

      <div v-if="registration" class="rounded-md border border-default p-3" aria-live="polite">
        <h3 class="m-0 mb-2 text-base font-semibold text-highlighted">
          {{ t('lorawan.registration.title') }}
        </h3>
        <p v-if="busy" class="m-0 mb-2 text-sm text-muted">
          {{ t('lorawan.registration.working') }}
        </p>
        <dl class="m-0 grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-[auto_1fr]">
          <dt class="text-muted">{{ t('lorawan.registration.profile') }}</dt>
          <dd class="m-0 break-words">{{ registration.profile.name }}</dd>
          <template v-if="registration.externalId">
            <dt class="text-muted">{{ t('lorawan.registration.externalId') }}</dt>
            <dd class="m-0 font-mono break-all">{{ registration.externalId }}</dd>
          </template>
          <template v-if="registration.registeredAt">
            <dt class="text-muted">{{ t('lorawan.registration.registeredAt') }}</dt>
            <dd class="m-0">{{ formatDateTime(registration.registeredAt) }}</dd>
          </template>
          <template v-if="status === 'registered'">
            <dt class="text-muted">{{ t('lorawan.registration.origin') }}</dt>
            <dd class="m-0">
              {{
                registration.origin === 'linked'
                  ? t('lorawan.registration.originLinked')
                  : t('lorawan.registration.originCreated')
              }}
            </dd>
          </template>
          <template v-if="registration.attempts > 1">
            <dt class="text-muted">{{ t('lorawan.registration.attempts') }}</dt>
            <dd class="m-0">{{ registration.attempts }}</dd>
          </template>
        </dl>
        <UAlert
          v-if="registration.lastError"
          class="mt-3"
          :color="status === 'error' ? 'error' : 'warning'"
          variant="subtle"
          :title="t('lorawan.registration.lastError')"
          :description="registration.lastError"
        />
        <UAlert
          v-if="orphans"
          class="mt-3"
          color="warning"
          variant="subtle"
          :description="t('lorawan.registration.orphans', { parts: orphans })"
        />
        <p v-if="status === 'conflict'" class="mt-3 mb-0 text-sm">
          {{ t('lorawan.registration.conflictHelp') }}
        </p>
        <p v-if="status === 'partial'" class="mt-3 mb-0 text-sm">
          {{ t('lorawan.registration.partialHelp') }}
        </p>
      </div>
    </div>

    <template v-if="data">
      <LorawanFormDialog v-model:visible="editOpen" :asset-id="asset.id" :data="data" />
      <RegisterLnsDialog v-model:visible="registerOpen" :asset-id="asset.id" />
      <RevealKeysDialog v-model:visible="revealOpen" :asset-id="asset.id" />
    </template>
  </section>
</template>
