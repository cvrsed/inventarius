<script setup lang="ts">
import UAlert from '@nuxt/ui/components/Alert.vue';
import UButton from '@nuxt/ui/components/Button.vue';
import UCheckboxGroup from '@nuxt/ui/components/CheckboxGroup.vue';
import UModal from '@nuxt/ui/components/Modal.vue';
import { useToast } from '@nuxt/ui/composables/useToast';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { errorMessage } from '@/features/auth/errors';
import ReasonButton from '@/shared/ui/ReasonButton.vue';
import { useLorawanMutations } from './api';
import type { LinkAdoptField } from '@inventarius/shared';
import { describeDifference, deviceProfileText, isUnsetJoinEui, missingKeysText } from './link';

/**
 * Vincular (RF-64): lee el dispositivo que ya existe en el LNS y muestra en qué difiere del activo antes de confirmar.
 * Las opciones son adoptar los datos del LNS o cancelar; vincular nunca modifica el dispositivo remoto.
 */
const props = defineProps<{ assetId: string }>();
const visible = defineModel<boolean>('visible', { required: true });

const { t } = useI18n();
const toast = useToast();
const { linkPreview, resolve } = useLorawanMutations(computed(() => props.assetId));

const loadError = computed(() =>
  linkPreview.error.value ? errorMessage(linkPreview.error.value, t) : '',
);

watch(visible, async (open) => {
  linkPreview.reset();
  resolve.reset();
  if (!open) return;
  try {
    await linkPreview.mutateAsync();
  } catch {
    // El error se muestra desde `linkPreview.error`.
  }
});

const preview = computed(() => linkPreview.data.value);
const differences = computed(() =>
  (preview.value?.differences ?? []).map((d) =>
    describeDifference(d, t, {
      local: preview.value?.localDeviceProfile,
      remote: preview.value?.remote.deviceProfile,
    }),
  ),
);
// Lo que se adopta: parte de lo que el servidor propone y el usuario lo ajusta campo por campo.
const selected = ref<LinkAdoptField[]>([]);
watch(preview, (p) => (selected.value = p ? [...p.adopts] : []));
const adoptItems = computed(() =>
  (preview.value?.adoptable ?? []).map((f) => ({
    value: f,
    label: t(`lorawan.fields.${f}`),
    ...(f === 'joinEui' && isUnsetJoinEui(preview.value?.remote.joinEui ?? null)
      ? { description: t('lorawan.linkDialog.unsetJoinEuiHint') }
      : {}),
  })),
);
const failure = computed(() => (resolve.error.value ? errorMessage(resolve.error.value, t) : ''));

async function adopt(): Promise<void> {
  try {
    await resolve.mutateAsync({ action: 'link', adopt: selected.value });
    toast.add({ title: t('lorawan.done.link'), color: 'success', duration: 4000 });
    visible.value = false;
  } catch {
    // El error se muestra desde `resolve.error`.
  }
}
</script>

<template>
  <UModal
    v-model:open="visible"
    :title="t('lorawan.linkDialog.title')"
    :description="t('lorawan.linkDialog.description')"
  >
    <template #body>
      <!-- Enfocable para que el contenido, que puede desbordar en 360 px, se desplace con el teclado. -->
      <div
        class="flex flex-col gap-4 rounded-md outline-primary/25 focus-visible:outline-3"
        role="region"
        tabindex="0"
        :aria-label="t('lorawan.linkDialog.title')"
      >
        <UAlert
          v-if="loadError"
          color="error"
          variant="subtle"
          role="alert"
          :description="loadError"
        />
        <UAlert v-if="failure" color="error" variant="subtle" role="alert" :description="failure" />
        <p v-if="linkPreview.isPending.value" class="m-0 text-muted">{{ t('common.loading') }}</p>

        <template v-if="preview">
          <section aria-labelledby="link-remote-title">
            <h3 id="link-remote-title" class="m-0 mb-2 text-base font-semibold text-highlighted">
              {{ t('lorawan.linkDialog.remoteTitle') }}
            </h3>
            <dl class="m-0 grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-[auto_1fr]">
              <dt class="text-muted">{{ t('lorawan.linkDialog.rows.name') }}</dt>
              <dd class="m-0 break-words">{{ preview.remote.name || t('lorawan.notSet') }}</dd>
              <dt class="text-muted">{{ t('lorawan.fields.joinEui') }}</dt>
              <dd class="m-0 font-mono break-all">
                {{ preview.remote.joinEui ?? t('lorawan.notSet') }}
              </dd>
              <dt class="text-muted">{{ t('lorawan.linkDialog.rows.deviceProfile') }}</dt>
              <dd class="m-0 break-words">
                {{
                  deviceProfileText(
                    preview.remote.deviceProfile,
                    preview.remote.deviceProfileId,
                    t('lorawan.notSet'),
                  )
                }}
              </dd>
              <dt class="text-muted">{{ t('lorawan.fields.appKey') }}</dt>
              <dd class="m-0">
                {{
                  preview.remote.hasAppKey
                    ? t('lorawan.linkDialog.inLns')
                    : t('lorawan.linkDialog.notInLns')
                }}
              </dd>
              <dt class="text-muted">{{ t('lorawan.fields.nwkKey') }}</dt>
              <dd class="m-0">
                {{
                  preview.remote.hasNwkKey
                    ? t('lorawan.linkDialog.inLns')
                    : t('lorawan.linkDialog.notInLns')
                }}
              </dd>
            </dl>
          </section>

          <UAlert
            v-if="preview.remote.missingKeys.length"
            color="warning"
            variant="subtle"
            role="alert"
            :description="
              t('lorawan.linkDialog.missingKeys', {
                keys: missingKeysText(preview.remote.missingKeys, t),
              })
            "
          />

          <section aria-labelledby="link-diff-title">
            <h3 id="link-diff-title" class="m-0 mb-2 text-base font-semibold text-highlighted">
              {{ t('lorawan.linkDialog.diffTitle') }}
            </h3>
            <p v-if="!differences.length" class="m-0 text-muted">
              {{ t('lorawan.linkDialog.same') }}
            </p>
            <ul v-else class="m-0 flex list-none flex-col gap-2 p-0" data-testid="link-differences">
              <li
                v-for="d in differences"
                :key="d.field"
                class="rounded-md border border-default p-2 text-sm"
              >
                <span class="font-medium text-highlighted">{{ d.label }}:</span>
                {{ d.text }}
              </li>
            </ul>
          </section>

          <section v-if="adoptItems.length">
            <UCheckboxGroup
              v-model="selected"
              :legend="t('lorawan.linkDialog.adoptLegend')"
              :items="adoptItems"
              value-key="value"
            />
            <p class="m-0 mt-1 text-sm text-muted">{{ t('lorawan.linkDialog.adoptHelp') }}</p>
          </section>
          <UAlert
            v-else
            color="info"
            variant="subtle"
            :description="t('lorawan.linkDialog.nothingToAdopt')"
          />
          <p class="m-0 text-sm text-muted">{{ t('lorawan.linkDialog.readOnly') }}</p>
        </template>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          :label="t('common.cancel')"
          color="neutral"
          variant="ghost"
          @click="visible = false"
        />
        <ReasonButton
          :label="t('lorawan.linkDialog.adopt')"
          :reason="preview ? undefined : t('lorawan.linkDialog.needRead')"
          :loading="resolve.isPending.value"
          @click="adopt"
        />
      </div>
    </template>
  </UModal>
</template>
