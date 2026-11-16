<script setup lang="ts">
import Button from 'primevue/button';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';

const { t } = useI18n();
const router = useRouter();
</script>

<template>
  <section class="flex flex-col items-center gap-3 py-12 text-center">
    <h1 class="m-0 text-2xl font-semibold">{{ t('notFound.title') }}</h1>
    <p class="app-muted m-0">{{ t('notFound.body') }}</p>
    <Button class="app-touch" :label="t('notFound.back')" @click="router.push({ name: 'home' })" />
  </section>
</template>
