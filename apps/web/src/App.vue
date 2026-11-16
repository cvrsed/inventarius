<script setup lang="ts">
import UApp from '@nuxt/ui/components/App.vue';
import { es } from '@nuxt/ui/locale';
import AppLayout from '@/app/layout/AppLayout.vue';
import ConfirmDialog from '@/shared/ui/ConfirmDialog.vue';
</script>

<template>
  <UApp :locale="es" :toaster="{ position: 'bottom-center' }">
    <AppLayout />
    <ConfirmDialog />
  </UApp>
</template>
