import { computed, type ComputedRef } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { parseListQuery, serializeListQuery, type ListDefaults } from './listQuery';

/**
 * Estado de un listado con paginación, orden y filtros reflejados en la URL (RF-22).
 * `update` cambia filtros y vuelve a la página 1; `setPage` solo cambia de página.
 */
export function useListQuery<D extends ListDefaults>(defaults: D) {
  const route = useRoute();
  const router = useRouter();
  const query: ComputedRef<D> = computed(() => parseListQuery(route.query, defaults));

  function replace(next: D): Promise<unknown> {
    return router.replace({ query: serializeListQuery(next, defaults) });
  }
  return {
    query,
    update: (patch: Partial<D>) => replace({ ...query.value, ...patch, page: 1 }),
    setPage: (page: number) => replace({ ...query.value, page }),
    reset: () => router.replace({ query: {} }),
  };
}
