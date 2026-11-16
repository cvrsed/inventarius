<script setup lang="ts">
import UAlert from '@nuxt/ui/components/Alert.vue';
import UButton from '@nuxt/ui/components/Button.vue';
import UCard from '@nuxt/ui/components/Card.vue';
import UFormField from '@nuxt/ui/components/FormField.vue';
import UInput from '@nuxt/ui/components/Input.vue';
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import PasswordField from '@/shared/ui/PasswordField.vue';
import { ApiError } from '@/shared/api/http';
import { errorMessage } from './errors';
import { useAuthStore } from './useAuthStore';

const { t } = useI18n();
const auth = useAuthStore();
const router = useRouter();
const route = useRoute();

const email = ref('');
const password = ref('');
const error = ref('');
const emailError = ref('');
const submitting = ref(false);

async function submit(): Promise<void> {
  error.value = '';
  emailError.value = /^\S+@\S+\.\S+$/.test(email.value.trim()) ? '' : t('login.invalidEmail');
  if (emailError.value || !password.value) {
    error.value = emailError.value || t('common.required');
    return;
  }
  submitting.value = true;
  try {
    await auth.login(email.value.trim(), password.value);
    const redirect = typeof route.query['redirect'] === 'string' ? route.query['redirect'] : '/';
    await router.replace(redirect.startsWith('/') && !redirect.startsWith('//') ? redirect : '/');
  } catch (e) {
    password.value = '';
    error.value =
      e instanceof ApiError && e.status === 429
        ? t('login.locked', { minutes: Math.max(1, Math.ceil(e.retryAfterSeconds / 60)) })
        : errorMessage(e, t);
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="flex min-h-[70vh] items-center justify-center">
    <UCard class="w-full max-w-md">
      <template #header>
        <h1 class="m-0 text-xl font-semibold text-highlighted">{{ t('login.title') }}</h1>
        <p class="m-0 mt-1 text-sm text-muted">{{ t('login.subtitle') }}</p>
      </template>
      <form class="flex flex-col gap-4" novalidate @submit.prevent="submit">
        <UAlert v-if="error" color="error" variant="subtle" role="alert" :description="error" />
        <UFormField :label="t('login.email')" name="login-email" :error="emailError || undefined">
          <UInput
            id="login-email"
            v-model="email"
            type="email"
            autocomplete="username"
            inputmode="email"
            class="w-full"
          />
        </UFormField>
        <PasswordField
          id="login-password"
          v-model="password"
          :label="t('login.password')"
          autocomplete="current-password"
        />
        <UButton type="submit" block :label="t('login.submit')" :loading="submitting" />
        <p class="m-0 text-sm text-muted">{{ t('login.next') }}</p>
      </form>
    </UCard>
  </div>
</template>
