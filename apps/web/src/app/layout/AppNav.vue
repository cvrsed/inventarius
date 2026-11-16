<script setup lang="ts">
import UIcon from '@nuxt/ui/components/Icon.vue';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { navigationItems } from '@/app/navigation';
import { useAuthStore } from '@/features/auth/useAuthStore';

defineProps<{ orientation: 'vertical' | 'horizontal' }>();

const { t } = useI18n();
const auth = useAuthStore();
const items = computed(() => navigationItems.filter((i) => auth.canAny(i.permissions ?? [])));
</script>

<template>
  <nav :aria-label="t('nav.label')">
    <ul
      class="m-0 flex list-none gap-1 p-0"
      :class="orientation === 'vertical' ? 'flex-col' : 'flex-row justify-around'"
    >
      <li v-for="item in items" :key="item.routeName">
        <RouterLink
          class="app-nav-link gap-3 px-3 py-2"
          :class="orientation === 'horizontal' ? 'flex-col justify-center text-xs' : ''"
          :to="{ name: item.routeName }"
        >
          <UIcon :name="item.icon" class="size-5" aria-hidden="true" />
          <span>{{ t(item.labelKey) }}</span>
        </RouterLink>
      </li>
    </ul>
  </nav>
</template>
