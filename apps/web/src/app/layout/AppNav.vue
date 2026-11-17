<script setup lang="ts">
import UIcon from '@nuxt/ui/components/Icon.vue';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import { navigationItems } from '@/app/navigation';
import { useAuthStore } from '@/features/auth/useAuthStore';
import MoreSheet from './MoreSheet.vue';

const props = defineProps<{ orientation: 'vertical' | 'horizontal' }>();

const { t } = useI18n();
const auth = useAuthStore();
const route = useRoute();
/** El catálogo cuelga de `/catalogo/<sección>`: se compara por el primer tramo de la ruta. */
const firstSegment = (path: string): string => path.split('/')[1] ?? '';
const isCurrent = (path: string): boolean => firstSegment(route.path) === firstSegment(path);
const allowed = computed(() => navigationItems.filter((i) => auth.canAny(i.permissions ?? [])));
/** En móvil la barra lleva solo los destinos principales y «Más»; el resto va dentro del panel. */
const items = computed(() =>
  props.orientation === 'horizontal'
    ? allowed.value.filter((i) => i.placement === 'primary')
    : allowed.value,
);
const moreItems = computed(() => allowed.value.filter((i) => i.placement === 'more'));
const moreOpen = ref(false);
const moreActive = computed(() => moreItems.value.some((i) => isCurrent(i.path)));
</script>

<template>
  <nav :aria-label="t('nav.label')">
    <ul
      class="m-0 flex list-none gap-1 p-0"
      :class="orientation === 'vertical' ? 'flex-col' : 'flex-row justify-around'"
    >
      <li v-for="item in items" :key="item.routeName">
        <RouterLink v-slot="{ href, navigate }" custom :to="item.path">
          <a
            :href="href"
            class="app-nav-link gap-3 px-3 py-2"
            :class="orientation === 'horizontal' ? 'flex-col justify-center text-xs' : ''"
            :aria-current="isCurrent(item.path) ? 'page' : undefined"
            @click="navigate"
          >
            <UIcon :name="item.icon" class="size-5" aria-hidden="true" />
            <span>{{ t(item.labelKey) }}</span>
          </a>
        </RouterLink>
      </li>
      <li v-if="orientation === 'horizontal'">
        <button
          type="button"
          class="app-nav-link flex-col justify-center gap-3 px-3 py-2 text-xs"
          :aria-current="moreActive ? 'page' : undefined"
          aria-haspopup="dialog"
          :aria-expanded="moreOpen"
          @click="moreOpen = true"
        >
          <UIcon name="i-lucide-ellipsis" class="size-5" aria-hidden="true" />
          <span>{{ t('nav.more') }}</span>
        </button>
      </li>
    </ul>
  </nav>
  <MoreSheet v-if="orientation === 'horizontal'" v-model:open="moreOpen" :items="moreItems" />
</template>
