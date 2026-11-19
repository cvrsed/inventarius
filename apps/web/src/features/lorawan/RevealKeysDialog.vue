<script setup lang="ts">
import type { RevealKeysResult } from '@inventarius/shared';
import UAlert from '@nuxt/ui/components/Alert.vue';
import UButton from '@nuxt/ui/components/Button.vue';
import UModal from '@nuxt/ui/components/Modal.vue';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { errorMessage } from '@/features/auth/errors';
import { useLorawanMutations } from './api';

/**
 * Muestra AppKey y NwkKey en claro. Exige confirmar primero (el acceso queda auditado) y las claves viven solo
 * mientras el diálogo está abierto: al cerrarlo se descartan.
 */
const props = defineProps<{ assetId: string }>();
const visible = defineModel<boolean>('visible', { required: true });

const { t } = useI18n();
const { reveal } = useLorawanMutations(computed(() => props.assetId));
const keys = ref<RevealKeysResult | null>(null);
const error = ref('');
const copied = ref('');

watch(visible, (open) => {
  if (open) return;
  keys.value = null;
  error.value = '';
  copied.value = '';
  reveal.reset();
});

async function show(): Promise<void> {
  error.value = '';
  try {
    keys.value = await reveal.mutateAsync();
  } catch (e) {
    error.value = errorMessage(e, t);
  }
}

async function copy(name: string, value: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value);
    copied.value = name;
  } catch {
    copied.value = '';
  }
}
</script>

<template>
  <UModal v-model:open="visible" :title="t('lorawan.reveal.title')">
    <template #body>
      <div class="flex flex-col gap-4">
        <UAlert color="warning" variant="subtle" :description="t('lorawan.reveal.warning')" />
        <UAlert v-if="error" color="error" variant="subtle" role="alert" :description="error" />
        <template v-if="keys">
          <p v-if="!keys.appKey && !keys.nwkKey" class="m-0 text-muted">
            {{ t('lorawan.reveal.none') }}
          </p>
          <dl v-else class="m-0 flex flex-col gap-3">
            <template v-for="k in ['appKey', 'nwkKey'] as const" :key="k">
              <div v-if="keys[k]" class="flex flex-col gap-1">
                <dt class="text-muted">{{ t(`lorawan.fields.${k}`) }}</dt>
                <dd class="m-0 flex flex-wrap items-center gap-2">
                  <code class="font-mono break-all" data-testid="revealed-key">{{ keys[k] }}</code>
                  <UButton
                    :label="copied === k ? t('lorawan.reveal.copied') : t('lorawan.reveal.copy')"
                    :aria-label="`${t('lorawan.reveal.copy')} ${t(`lorawan.fields.${k}`)}`"
                    icon="i-lucide-copy"
                    size="sm"
                    color="neutral"
                    variant="outline"
                    @click="copy(k, keys[k]!)"
                  />
                </dd>
              </div>
            </template>
          </dl>
        </template>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          :label="keys ? t('lorawan.reveal.hide') : t('common.cancel')"
          color="neutral"
          variant="ghost"
          @click="visible = false"
        />
        <UButton
          v-if="!keys"
          :label="t('lorawan.reveal.confirm')"
          :loading="reveal.isPending.value"
          @click="show"
        />
      </div>
    </template>
  </UModal>
</template>
