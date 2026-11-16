<script setup lang="ts">
import Button from 'primevue/button';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/features/auth/useAuthStore';

const { t } = useI18n();
const auth = useAuthStore();
const router = useRouter();

async function logout(): Promise<void> {
  await auth.logout();
  await router.replace({ name: 'login' });
}
</script>

<template>
  <div v-if="auth.user" class="flex items-center gap-1">
    <span class="app-muted hidden max-w-40 truncate text-sm sm:inline" :title="auth.user.email">{{
      auth.user.name
    }}</span>
    <Button
      class="app-touch"
      icon="pi pi-key"
      :aria-label="t('session.changePassword')"
      severity="secondary"
      text
      rounded
      @click="router.push({ name: 'change-password' })"
    />
    <Button
      class="app-touch"
      icon="pi pi-sign-out"
      :aria-label="t('session.logout')"
      severity="secondary"
      text
      rounded
      @click="logout"
    />
  </div>
</template>
