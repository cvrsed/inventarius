<script setup lang="ts">
import UButton from '@nuxt/ui/components/Button.vue';
import UModal from '@nuxt/ui/components/Modal.vue';
import { useConfirm } from './useConfirm';

const { state, close } = useConfirm();

async function accept(): Promise<void> {
  const run = state.options?.accept;
  close();
  await run?.();
}
</script>

<template>
  <UModal
    v-model:open="state.open"
    :title="state.options?.title ?? ''"
    :description="state.options?.message ?? ''"
    :ui="{ overlay: 'z-[60]', content: 'z-[60]' }"
  >
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          color="neutral"
          variant="ghost"
          :label="state.options?.rejectLabel"
          @click="close"
        />
        <UButton
          :color="state.options?.danger ? 'error' : 'primary'"
          :label="state.options?.acceptLabel"
          @click="accept"
        />
      </div>
    </template>
  </UModal>
</template>
