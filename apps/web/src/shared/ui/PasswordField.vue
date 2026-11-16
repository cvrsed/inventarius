<script setup lang="ts">
import Password from 'primevue/password';

defineProps<{
  id: string;
  label: string;
  autocomplete: 'current-password' | 'new-password';
  error?: string | undefined;
}>();
const model = defineModel<string>({ required: true });

// PrimeVue pone aria-expanded/aria-haspopup en el <input type=password>, atributos inválidos ahí (axe: aria-allowed-attr).
const inputPt = { pcInputText: { root: { 'aria-expanded': null, 'aria-haspopup': null } } };
</script>

<template>
  <div class="flex flex-col gap-1">
    <label :for="id">{{ label }}</label>
    <Password
      v-model="model"
      :input-id="id"
      :autocomplete="autocomplete"
      :feedback="false"
      :invalid="!!error"
      :aria-describedby="error ? `${id}-error` : undefined"
      toggle-mask
      fluid
      :pt="inputPt"
    />
    <small v-if="error" :id="`${id}-error`" class="field-error" role="alert">{{ error }}</small>
  </div>
</template>
