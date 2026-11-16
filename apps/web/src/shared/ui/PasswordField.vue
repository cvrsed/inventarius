<script setup lang="ts">
import UButton from '@nuxt/ui/components/Button.vue';
import UFormField from '@nuxt/ui/components/FormField.vue';
import UInput from '@nuxt/ui/components/Input.vue';
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';

defineProps<{
  id: string;
  label: string;
  autocomplete: 'current-password' | 'new-password';
  error?: string | undefined;
}>();
const model = defineModel<string>({ required: true });

const { t } = useI18n();
const shown = ref(false);
</script>

<template>
  <UFormField :label="label" :name="id" :error="error || undefined" :ui="{ error: 'text-error' }">
    <UInput
      :id="id"
      v-model="model"
      :type="shown ? 'text' : 'password'"
      :autocomplete="autocomplete"
      class="w-full"
    >
      <template #trailing>
        <UButton
          type="button"
          color="neutral"
          variant="link"
          size="sm"
          :icon="shown ? 'i-lucide-eye-off' : 'i-lucide-eye'"
          :aria-label="shown ? t('common.hidePassword') : t('common.showPassword')"
          :aria-pressed="shown"
          @click="shown = !shown"
        />
      </template>
    </UInput>
  </UFormField>
</template>
