<script setup lang="ts">
import UButton from '@nuxt/ui/components/Button.vue';
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
    <span class="hidden max-w-40 truncate text-sm text-muted sm:inline" :title="auth.user.email">{{
      auth.user.name
    }}</span>
    <UButton
      icon="i-lucide-key-round"
      :aria-label="t('session.changePassword')"
      color="neutral"
      variant="ghost"
      @click="router.push({ name: 'change-password' })"
    />
    <UButton
      icon="i-lucide-log-out"
      :aria-label="t('session.logout')"
      color="neutral"
      variant="ghost"
      @click="logout"
    />
  </div>
</template>
