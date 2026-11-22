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
    <template v-if="state.options?.rows?.length || state.options?.bullets?.length" #body>
      <div class="flex flex-col gap-3 text-sm">
        <dl
          v-if="state.options?.rows?.length"
          class="m-0 grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-[max-content_1fr]"
        >
          <template v-for="row in state.options.rows" :key="row.label">
            <dt class="text-muted">{{ row.label }}</dt>
            <dd
              class="m-0 min-w-0 break-words"
              :class="
                row.highlight
                  ? 'w-fit rounded-md bg-primary/15 px-2 py-0.5 font-semibold text-highlighted'
                  : 'text-default'
              "
              :data-highlight="row.highlight ? 'true' : undefined"
            >
              {{ row.value }}
            </dd>
          </template>
        </dl>
        <ul v-if="state.options?.bullets?.length" class="m-0 list-disc pl-5 text-default">
          <li v-for="b in state.options.bullets" :key="b">{{ b }}</li>
        </ul>
        <p v-if="state.options?.footnote" class="m-0 text-muted">{{ state.options.footnote }}</p>
      </div>
    </template>
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
