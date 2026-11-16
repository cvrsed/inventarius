<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { navigationItems } from '@/app/navigation';

defineProps<{ orientation: 'vertical' | 'horizontal' }>();

const { t } = useI18n();
</script>

<template>
  <nav :aria-label="t('nav.label')">
    <ul
      class="m-0 flex list-none gap-1 p-0"
      :class="orientation === 'vertical' ? 'flex-col' : 'flex-row justify-around'"
    >
      <li v-for="item in navigationItems" :key="item.routeName">
        <RouterLink
          class="app-nav-link gap-3 px-3 py-2"
          :class="orientation === 'horizontal' ? 'flex-col justify-center text-xs' : ''"
          :to="{ name: item.routeName }"
        >
          <i :class="item.icon" aria-hidden="true" />
          <span>{{ t(item.labelKey) }}</span>
        </RouterLink>
      </li>
    </ul>
  </nav>
</template>
