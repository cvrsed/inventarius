<script setup lang="ts">
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
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
  <Dialog
    v-model:visible="visible"
    modal
    :header="t('users.resetTitle')"
    :style="{ width: '28rem' }"
    :breakpoints="{ '640px': '94vw' }"
  >
    <p class="mt-0">{{ t('users.resetBody') }}</p>
    <div class="flex items-center gap-2">
      <InputText
        :model-value="password"
        readonly
        :aria-label="t('users.resetTitle')"
        class="font-mono"
        fluid
      />
      <Button
        class="app-touch"
        icon="pi pi-copy"
        :aria-label="t('users.copy')"
        severity="secondary"
        @click="copy(password)"
      />
    </div>
    <p v-if="copied" class="app-muted mb-0 text-sm" role="status">{{ t('users.copied') }}</p>
    <template #footer>
      <Button class="app-touch" :label="t('common.close')" @click="visible = false" />
    </template>
  </Dialog>
</template>
