import { z } from 'zod';

/** Respuesta de `GET /api/health/live`. */
export const liveResponseSchema = z.object({
  status: z.literal('ok'),
});

/** Estado de un componente chequeado por `GET /api/health/ready`. */
export const checkStatusSchema = z.enum(['up', 'down']);

/** Respuesta de `GET /api/health/ready`. */
export const readyResponseSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  checks: z.object({
    database: checkStatusSchema,
    queue: checkStatusSchema,
  }),
});

export type LiveResponse = z.infer<typeof liveResponseSchema>;
export type ReadyResponse = z.infer<typeof readyResponseSchema>;

/** Calcula el estado global a partir de los chequeos individuales. */
export function overallStatus(checks: ReadyResponse['checks']): ReadyResponse['status'] {
  return Object.values(checks).every((c) => c === 'up') ? 'ok' : 'degraded';
}
