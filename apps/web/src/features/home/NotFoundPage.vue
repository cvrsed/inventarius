<script setup lang="ts">
import UButton from '@nuxt/ui/components/Button.vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';

const { t } = useI18n();
const router = useRouter();
</script>

<template>
  <section class="flex flex-col items-center gap-3 py-12 text-center">
    <h1 class="m-0 text-2xl font-semibold text-highlighted">{{ t('notFound.title') }}</h1>
    <p class="m-0 text-muted">{{ t('notFound.body') }}</p>
    <UButton :label="t('notFound.back')" @click="router.push({ name: 'home' })" />
  </section>
</template>
