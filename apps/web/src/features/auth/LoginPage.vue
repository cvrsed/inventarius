<script setup lang="ts">
import Button from 'primevue/button';
import Card from 'primevue/card';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
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
    <Card class="w-full max-w-md">
      <template #title>
        <h1 class="m-0 text-xl">{{ t('login.title') }}</h1>
      </template>
      <template #subtitle>{{ t('login.subtitle') }}</template>
      <template #content>
        <form class="flex flex-col gap-4" novalidate @submit.prevent="submit">
          <Message v-if="error" severity="error" :closable="false" role="alert">{{
            error
          }}</Message>
          <div class="flex flex-col gap-1">
            <label for="login-email">{{ t('login.email') }}</label>
            <InputText
              id="login-email"
              v-model="email"
              type="email"
              autocomplete="username"
              inputmode="email"
              :invalid="!!emailError"
              :aria-describedby="emailError ? 'login-email-error' : undefined"
              fluid
            />
          </div>
          <PasswordField
            id="login-password"
            v-model="password"
            :label="t('login.password')"
            autocomplete="current-password"
          />
          <Button
            type="submit"
            class="app-touch"
            :label="t('login.submit')"
            :loading="submitting"
          />
          <p class="app-muted m-0 text-sm">{{ t('login.next') }}</p>
        </form>
      </template>
    </Card>
  </div>
</template>
