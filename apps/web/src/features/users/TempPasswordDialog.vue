<script setup lang="ts">
import UButton from '@nuxt/ui/components/Button.vue';
import UInput from '@nuxt/ui/components/Input.vue';
import UModal from '@nuxt/ui/components/Modal.vue';
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';

defineProps<{ password: string }>();
const visible = defineModel<boolean>('visible', { required: true });

const { t } = useI18n();
const copied = ref(false);

async function copy(value: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value);
    copied.value = true;
  } catch {
    copied.value = false;
  }
}
</script>

<template>
  <UModal v-model:open="visible" :title="t('users.resetTitle')" :description="t('users.resetBody')">
    <template #body>
      <div class="flex items-center gap-2">
        <UInput
          :model-value="password"
          readonly
          :aria-label="t('users.resetTitle')"
          class="w-full"
          :ui="{ base: 'font-mono' }"
        />
        <UButton
          icon="i-lucide-copy"
          :aria-label="t('users.copy')"
          color="neutral"
          variant="subtle"
          @click="copy(password)"
        />
      </div>
      <p v-if="copied" class="mb-0 mt-2 text-sm text-muted" role="status">
        {{ t('users.copied') }}
      </p>
    </template>
    <template #footer>
      <div class="flex w-full justify-end">
        <UButton :label="t('common.close')" @click="visible = false" />
      </div>
    </template>
  </UModal>
</template>
