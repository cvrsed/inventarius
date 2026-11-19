/**
 * Nombres de las colas de pg-boss. Viven aquí, sin dependencias de dominio, porque el migrador las crea (DDL) y no debe
 * importar módulos de negocio; el worker y los servicios importan estos mismos nombres.
 */
export const PURGE_SESSIONS_QUEUE = 'maintenance-purge-sessions';
export const MAINTENANCE_QUEUES = [PURGE_SESSIONS_QUEUE] as const;

export const LNS_REGISTER_QUEUE = 'lns-register';
export const LNS_DEREGISTER_QUEUE = 'lns-deregister';
export const LNS_QUEUES = [LNS_REGISTER_QUEUE, LNS_DEREGISTER_QUEUE] as const;

/** Todas las colas que debe crear el migrador. */
export const ALL_QUEUES = [...MAINTENANCE_QUEUES, ...LNS_QUEUES] as const;
