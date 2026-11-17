<script setup lang="ts">
import UButton from '@nuxt/ui/components/Button.vue';
import USlideover from '@nuxt/ui/components/Slideover.vue';
import UIcon from '@nuxt/ui/components/Icon.vue';
import { watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import type { NavigationItem } from '@/app/navigation';
import { useAccountActions } from '@/features/auth/useAccountActions';

/** Panel «Más» de la barra inferior móvil: destinos secundarios y acciones de la cuenta. */
defineProps<{ items: readonly NavigationItem[] }>();
const open = defineModel<boolean>('open', { required: true });

const { t } = useI18n();
const route = useRoute();
const { themeLabel, themeIcon, changePassword, toggleTheme, logout } = useAccountActions();

// Navegar a un destino cierra el panel.
watch(
  () => route.fullPath,
  () => (open.value = false),
);

const run = (action: () => unknown) => async () => {
  open.value = false;
  await action();
};
</script>

<template>
  <USlideover
    v-model:open="open"
    side="bottom"
    :title="t('nav.more')"
    :description="t('nav.moreHint')"
  >
    <template #body>
      <nav v-if="items.length" :aria-label="t('nav.moreLabel')" class="mb-3">
        <ul class="m-0 flex list-none flex-col gap-1 p-0">
          <li v-for="item in items" :key="item.routeName">
            <RouterLink v-slot="{ href, navigate }" custom :to="item.path">
              <a :href="href" class="app-nav-link gap-3 px-3 py-2" @click="navigate">
                <UIcon :name="item.icon" class="size-5" aria-hidden="true" />
                <span>{{ t(item.labelKey) }}</span>
              </a>
            </RouterLink>
          </li>
        </ul>
      </nav>
      <ul class="m-0 flex list-none flex-col gap-1 border-t border-default p-0 pt-3">
        <li>
          <UButton
            icon="i-lucide-key-round"
            :label="t('session.changePassword')"
            color="neutral"
            variant="ghost"
            block
            class="justify-start"
            @click="run(changePassword)()"
          />
        </li>
        <li>
          <UButton
            :icon="themeIcon"
            :label="themeLabel"
            color="neutral"
            variant="ghost"
            block
            class="justify-start"
            @click="run(toggleTheme)()"
          />
        </li>
        <li>
          <UButton
            icon="i-lucide-log-out"
            :label="t('session.logout')"
            color="neutral"
            variant="ghost"
            block
            class="justify-start"
            @click="run(logout)()"
          />
        </li>
      </ul>
    </template>
  </USlideover>
</template>
