<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import { useAuthStore } from '@/features/auth/useAuthStore';
import AppNav from './AppNav.vue';
import ThemeToggle from './ThemeToggle.vue';
import UserMenu from './UserMenu.vue';

const { t } = useI18n();
const route = useRoute();
const auth = useAuthStore();
/** Sin menú en el login ni mientras la contraseña temporal sigue pendiente. */
const showNav = computed(() => !route.meta.bare && !!auth.user && !auth.user.mustChangePassword);
</script>

<template>
  <a class="app-skip-link" href="#contenido">{{ t('app.skipToContent') }}</a>

  <div class="flex min-h-screen flex-col bg-default text-default">
    <header
      class="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-default bg-default px-4 py-2"
    >
      <div class="flex items-center gap-2">
        <img src="/favicon.svg" alt="" width="28" height="28" />
        <span class="text-lg font-semibold text-highlighted">{{ t('app.name') }}</span>
        <span class="hidden text-sm text-muted sm:inline">{{ t('app.tagline') }}</span>
      </div>
      <div class="flex items-center gap-1">
        <UserMenu />
        <ThemeToggle />
      </div>
    </header>

    <div class="flex flex-1">
      <aside
        v-if="showNav"
        class="hidden w-56 shrink-0 border-r border-default bg-default p-3 md:block"
      >
        <AppNav orientation="vertical" />
      </aside>

      <main
        id="contenido"
        class="mx-auto w-full max-w-6xl min-w-0 flex-1 px-4 py-6 md:px-8 md:pb-8"
        :class="showNav ? 'pb-28' : ''"
        tabindex="-1"
      >
        <RouterView />
      </main>
    </div>

    <div
      v-if="showNav"
      class="app-bottom-nav fixed inset-x-0 bottom-0 z-10 border-t border-default bg-default px-2 py-1 md:hidden"
    >
      <AppNav orientation="horizontal" />
    </div>
  </div>
</template>
