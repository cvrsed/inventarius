<script setup lang="ts">
import UIcon from '@nuxt/ui/components/Icon.vue';
import { useI18n } from 'vue-i18n';
import StatusCard from '@/features/system/StatusCard.vue';

const { t } = useI18n();
</script>

<template>
  <div class="flex flex-col gap-6">
    <h1 class="m-0 text-2xl font-semibold text-highlighted">{{ t('home.title') }}</h1>

    <section
      class="flex flex-col items-center gap-2 py-8 text-center"
      aria-labelledby="empty-title"
    >
      <UIcon name="i-lucide-box" class="size-10 text-muted" aria-hidden="true" />
      <h2 id="empty-title" class="m-0 text-lg font-semibold">{{ t('home.emptyTitle') }}</h2>
      <p class="m-0 max-w-md text-muted">{{ t('home.emptyBody') }}</p>
    </section>

    <StatusCard />
  </div>
</template>
