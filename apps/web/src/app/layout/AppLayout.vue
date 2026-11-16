<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import AppNav from './AppNav.vue';
import ThemeToggle from './ThemeToggle.vue';

const { t } = useI18n();
</script>

<template>
  <a class="app-skip-link" href="#contenido">{{ t('app.skipToContent') }}</a>

  <div class="flex min-h-screen flex-col">
    <header
      class="app-header sticky top-0 z-10 flex items-center justify-between gap-3 border-b px-4 py-2"
    >
      <div class="flex items-center gap-2">
        <img src="/favicon.svg" alt="" width="28" height="28" />
        <span class="text-lg font-semibold">{{ t('app.name') }}</span>
        <span class="app-muted hidden text-sm sm:inline">{{ t('app.tagline') }}</span>
      </div>
      <ThemeToggle />
    </header>

    <div class="flex flex-1">
      <aside class="app-sidebar hidden w-56 shrink-0 border-r p-3 md:block">
        <AppNav orientation="vertical" />
      </aside>

      <main
        id="contenido"
        class="mx-auto w-full max-w-6xl flex-1 px-4 py-6 pb-28 md:px-8 md:pb-8"
        tabindex="-1"
      >
        <RouterView />
      </main>
    </div>

    <div class="app-bottom-nav fixed inset-x-0 bottom-0 z-10 border-t px-2 py-1 md:hidden">
      <AppNav orientation="horizontal" />
    </div>
  </div>
</template>
