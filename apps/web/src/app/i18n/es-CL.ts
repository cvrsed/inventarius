/** Textos de la UI en español (Chile). Todo texto visible se declara aquí (RNF-05). */
export const messages = {
  app: {
    name: 'Inventarius',
    tagline: 'Inventario de activos',
    skipToContent: 'Saltar al contenido',
  },
  nav: {
    label: 'Navegación principal',
    home: 'Inicio',
  },
  theme: {
    toDark: 'Cambiar a modo oscuro',
    toLight: 'Cambiar a modo claro',
  },
  home: {
    title: 'Inicio',
    emptyTitle: 'Aún no hay activos registrados',
    emptyBody:
      'Cuando se agreguen activos, aparecerán aquí. Esta vista se completa en las próximas fases.',
  },
  status: {
    title: 'Estado del sistema',
    loading: 'Consultando el estado…',
    ok: 'Todo funciona con normalidad',
    degraded: 'Hay componentes con problemas',
    error: 'No se pudo consultar el estado del sistema. Revisa tu conexión e intenta de nuevo.',
    retry: 'Reintentar',
    database: 'Base de datos',
    queue: 'Cola de tareas',
    up: 'Operativo',
    down: 'Sin respuesta',
  },
  notFound: {
    title: 'Página no encontrada',
    body: 'La dirección que buscas no existe o fue movida.',
    back: 'Volver al inicio',
  },
} as const;

export type Messages = typeof messages;
