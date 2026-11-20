<script setup lang="ts">
import type { LnsKind, LnsProfileDto } from '@inventarius/shared';
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
import { useLnsProfileMutations } from './api';
import { profileBody, TARGET_FIELDS, DEFAULT_FIELDS, type ProfileForm } from './form';

const props = defineProps<{ profile: LnsProfileDto | null }>();
const visible = defineModel<boolean>('visible', { required: true });

const { t } = useI18n();
const toast = useToast();
const { create, update } = useLnsProfileMutations();

const empty = (): ProfileForm => ({
  kind: 'chirpstack',
  name: '',
  description: '',
  endpoint: '',
  tls: false,
  credential: '',
  active: true,
  target: {},
  deviceDefaults: {},
});
const form = ref<ProfileForm>(empty());
const error = ref('');
const fieldErrors = ref<Record<string, string>>({});

const editing = computed(() => props.profile !== null);
const kind = computed<LnsKind>(() => form.value.kind);
// Con dispositivos registrados el destino no se puede cambiar (RF-52).
const targetLocked = computed(() => (props.profile?.registeredDevices ?? 0) > 0);
const submitting = computed(() => create.isPending.value || update.isPending.value);

watch(
  () => [visible.value, props.profile] as const,
  ([open, profile]) => {
    if (!open) return;
    error.value = '';
    fieldErrors.value = {};
    form.value = profile
      ? {
          kind: profile.kind,
          name: profile.name,
          description: profile.description ?? '',
          endpoint: profile.endpoint,
          tls: profile.tls,
          credential: '',
          active: profile.active,
          target: { ...profile.target },
          deviceDefaults: { ...profile.deviceDefaults },
        }
      : empty();
  },
  { immediate: true },
);

const kindItems = computed(() =>
  (['chirpstack', 'ttn'] as const).map((k) => ({ value: k, label: t(`lns.kinds.${k}`) })),
);

async function submit(): Promise<void> {
  error.value = '';
  fieldErrors.value = {};
  const missing: Record<string, string> = {};
  if (!form.value.name.trim()) missing['name'] = t('common.required');
  if (!form.value.endpoint.trim()) missing['endpoint'] = t('common.required');
  if (!editing.value && !form.value.credential.trim()) missing['credential'] = t('common.required');
  for (const f of [...TARGET_FIELDS[kind.value], ...DEFAULT_FIELDS[kind.value]]) {
    const bag = TARGET_FIELDS[kind.value].includes(f)
      ? form.value.target
      : form.value.deviceDefaults;
    if (!(bag[f] ?? '').trim()) missing[f] = t('common.required');
  }
  if (Object.keys(missing).length) {
    fieldErrors.value = missing;
    return;
  }
  try {
    const body = profileBody(form.value, editing.value);
    if (props.profile) await update.mutateAsync({ profile: props.profile, body });
    else await create.mutateAsync(body);
    toast.add({
      title: editing.value ? t('common.saved') : t('lns.created'),
      color: 'success',
      duration: 4000,
    });
    visible.value = false;
  } catch (e) {
    error.value = errorMessage(e, t);
    if (e instanceof ApiError) {
      fieldErrors.value = Object.fromEntries(
        Object.entries(e.fieldErrors).map(([k, v]) => [k.split('.').pop() ?? k, v[0] ?? '']),
      );
      if (e.status === 412) visible.value = false;
    }
  }
}
</script>

<template>
  <UModal
    v-model:open="visible"
    :title="editing ? t('lns.edit') : t('lns.new')"
    :description="t('lns.description')"
  >
    <template #body>
      <form id="lns-form" class="flex flex-col gap-4" novalidate @submit.prevent="submit">
        <UAlert v-if="error" color="error" variant="subtle" role="alert" :description="error" />
        <UAlert
          v-if="targetLocked"
          color="info"
          variant="subtle"
          :description="t('lns.lockedTarget')"
        />
        <UFormField :label="t('lns.fields.kind')" name="lns-kind">
          <AppSelect
            id="lns-kind"
            v-model="form.kind"
            :items="kindItems"
            :disabled="editing"
            class="w-full"
          />
        </UFormField>
        <UFormField
          :label="t('lns.fields.name')"
          name="lns-name"
          required
          :error="fieldErrors['name']"
        >
          <UInput id="lns-name" v-model="form.name" :maxlength="80" class="w-full" />
        </UFormField>
        <UFormField :label="t('lns.fields.description')" name="lns-desc">
          <UTextarea id="lns-desc" v-model="form.description" :rows="2" autoresize class="w-full" />
        </UFormField>
        <UFormField
          :label="t('lns.fields.endpoint')"
          name="lns-endpoint"
          required
          :hint="
            kind === 'chirpstack' ? t('lns.fields.endpointChirpstack') : t('lns.fields.endpointTtn')
          "
          :error="fieldErrors['endpoint']"
        >
          <UInput
            id="lns-endpoint"
            v-model="form.endpoint"
            :disabled="targetLocked"
            autocomplete="off"
            class="w-full"
          />
        </UFormField>
        <label v-if="kind === 'chirpstack'" class="flex items-center gap-2">
          <input v-model="form.tls" type="checkbox" class="size-4" />
          {{ t('lns.fields.tls') }}
        </label>
        <UFormField
          :label="editing ? t('lns.fields.credentialNew') : t('lns.fields.credential')"
          name="lns-credential"
          :required="!editing"
          :hint="
            profile
              ? t('lns.fields.credentialCurrent', { hint: profile.credentialHint })
              : undefined
          "
          :error="fieldErrors['credential']"
        >
          <UInput
            id="lns-credential"
            v-model="form.credential"
            type="password"
            autocomplete="off"
            spellcheck="false"
            class="w-full"
          />
        </UFormField>
        <UFormField
          v-for="f in TARGET_FIELDS[kind]"
          :key="f"
          :label="t(`lns.fields.${f}`)"
          :name="`lns-${f}`"
          required
          :error="fieldErrors[f]"
        >
          <UInput
            :id="`lns-${f}`"
            v-model="form.target[f]"
            :disabled="targetLocked"
            autocomplete="off"
            class="w-full font-mono"
          />
        </UFormField>
        <UFormField
          v-for="f in DEFAULT_FIELDS[kind]"
          :key="f"
          :label="t(`lns.fields.${f}`)"
          :name="`lns-${f}`"
          required
          :error="fieldErrors[f]"
        >
          <UInput
            :id="`lns-${f}`"
            v-model="form.deviceDefaults[f]"
            autocomplete="off"
            class="w-full font-mono"
          />
        </UFormField>
        <label class="flex items-center gap-2">
          <input v-model="form.active" type="checkbox" class="size-4" />
          {{ t('lns.fields.active') }}
        </label>
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
        <UButton type="submit" form="lns-form" :label="t('common.save')" :loading="submitting" />
      </div>
    </template>
  </UModal>
</template>
