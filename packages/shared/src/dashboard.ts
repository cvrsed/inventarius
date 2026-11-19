import { z } from 'zod';
import { statusKindSchema } from './catalog.js';

const countRef = z.object({ id: z.uuid(), name: z.string(), count: z.number().int() });

/**
 * Resumen del Inicio (RF-28). Todo son conteos agregados en el servidor: la web no recibe activos.
 * Los totales se calculan por **tipo** de estado (nunca por nombre); el desglose muestra cada estado.
 */
export const dashboardSummarySchema = z.object({
  totals: z.object({
    /** Activos vigentes (sin los dados de baja). */
    total: z.number().int(),
    /** Tipo de estado «desplegable» y sin asignar. */
    available: z.number().int(),
    /** Con una persona o en un sitio. */
    assigned: z.number().int(),
    /** Tipo de estado «pendiente» (p. ej. «Pendiente de configuración»). */
    pendingSetup: z.number().int(),
  }),
  /** Cada estado en uso con su nombre real; el tipo solo sirve para ordenar y colorear. */
  byStatus: z.array(
    z.object({ id: z.uuid(), name: z.string(), kind: statusKindSchema, count: z.number().int() }),
  ),
  byCategory: z.array(countRef),
  /** Disponibles por bodega base. */
  stockByWarehouse: z.array(countRef),
  overdue: z.object({
    count: z.number().int(),
    items: z.array(
      z.object({
        id: z.uuid(),
        assetTag: z.string(),
        name: z.string(),
        assignedTo: z.string().nullable(),
        expectedReturnOn: z.iso.date(),
      }),
    ),
  }),
  recent: z.array(
    z.object({
      id: z.string(),
      at: z.iso.datetime(),
      action: z.string(),
      actorName: z.string().nullable(),
      /** Quién actuó cuando no hay usuario (`cli`, `worker`). */
      actorLabel: z.string().nullable(),
      assetId: z.uuid().nullable(),
      assetTag: z.string().nullable(),
      assetName: z.string().nullable(),
    }),
  ),
  /** Equipos que tiene asignados quien consulta. */
  mine: z.array(
    z.object({
      id: z.uuid(),
      assetTag: z.string(),
      name: z.string(),
      since: z.iso.datetime(),
      expectedReturnOn: z.iso.date().nullable(),
    }),
  ),
});
export type DashboardSummary = z.infer<typeof dashboardSummarySchema>;
