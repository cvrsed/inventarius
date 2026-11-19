import { onBeforeUnmount, onMounted, ref } from 'vue';

/** `true` mientras el navegador tiene red. Sin modo offline en el MVP (RF-42): solo sirve para avisar. */
export function useOnline() {
  const online = ref(typeof navigator === 'undefined' ? true : navigator.onLine);
  const set = (value: boolean) => () => (online.value = value);
  const up = set(true);
  const down = set(false);
  onMounted(() => {
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
  });
  onBeforeUnmount(() => {
    window.removeEventListener('online', up);
    window.removeEventListener('offline', down);
  });
  return online;
}
