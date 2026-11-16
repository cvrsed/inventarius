<script setup lang="ts">
import UAlert from '@nuxt/ui/components/Alert.vue';
import UButton from '@nuxt/ui/components/Button.vue';
import UCard from '@nuxt/ui/components/Card.vue';
import { useToast } from '@nuxt/ui/composables/useToast';
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import PasswordField from '@/shared/ui/PasswordField.vue';
import { ApiError } from '@/shared/api/http';
import { errorMessage } from './errors';
import { useAuthStore } from './useAuthStore';

const { t } = useI18n();
const auth = useAuthStore();
const router = useRouter();
const toast = useToast();

const current = ref('');
const next = ref('');
const confirm = ref('');
const error = ref('');
const fieldErrors = ref<Record<string, string>>({});
const submitting = ref(false);

async function submit(): Promise<void> {
  error.value = '';
  fieldErrors.value = {};
  if (next.value.length < 12) fieldErrors.value['newPassword'] = t('changePassword.tooShort');
  else if (next.value !== confirm.value)
    fieldErrors.value['confirm'] = t('changePassword.mismatch');
  if (!current.value) fieldErrors.value['currentPassword'] = t('common.required');
  if (Object.keys(fieldErrors.value).length) return;

  submitting.value = true;
  try {
    await auth.changePassword(current.value, next.value);
    toast.add({ title: t('changePassword.done'), color: 'success', duration: 4000 });
    await router.replace({ name: 'home' });
  } catch (e) {
    if (e instanceof ApiError && e.status === 422) {
      for (const [k, v] of Object.entries(e.fieldErrors)) fieldErrors.value[k] = v.join(' ');
    } else {
      error.value = errorMessage(e, t);
    }
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="flex min-h-[60vh] items-center justify-center">
    <UCard class="w-full max-w-md">
      <template #header>
        <h1 class="m-0 text-xl font-semibold text-highlighted">{{ t('changePassword.title') }}</h1>
        <p v-if="auth.user?.mustChangePassword" class="m-0 mt-1 text-sm text-muted">
          {{ t('changePassword.forced') }}
        </p>
      </template>
      <form class="flex flex-col gap-4" novalidate @submit.prevent="submit">
        <UAlert v-if="error" color="error" variant="subtle" role="alert" :description="error" />
        <PasswordField
          id="cp-current"
          v-model="current"
          :label="t('changePassword.current')"
          :error="fieldErrors['currentPassword']"
          autocomplete="current-password"
        />
        <PasswordField
          id="cp-new"
          v-model="next"
          :label="t('changePassword.new')"
          :error="fieldErrors['newPassword']"
          autocomplete="new-password"
        />
        <PasswordField
          id="cp-confirm"
          v-model="confirm"
          :label="t('changePassword.confirm')"
          :error="fieldErrors['confirm']"
          autocomplete="new-password"
        />
        <p class="m-0 text-sm text-muted">{{ t('changePassword.hint') }}</p>
        <UButton type="submit" block :label="t('changePassword.submit')" :loading="submitting" />
      </form>
    </UCard>
  </div>
</template>
