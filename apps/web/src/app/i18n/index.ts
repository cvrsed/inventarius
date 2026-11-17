import { createI18n } from 'vue-i18n';
import { messages } from './es-CL';

/** i18n con es-CL como único idioma del MVP; agregar `en` es sumar un archivo de mensajes. */
export function createAppI18n() {
  return createI18n({
    legacy: false,
    locale: 'es-CL',
    fallbackLocale: 'es-CL',
    messages: { 'es-CL': messages },
  });
}
