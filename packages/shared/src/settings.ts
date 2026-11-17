import { z } from 'zod';

/** Ajustes de la instalación que la web necesita para mostrar datos (no incluye secretos). */
export const appSettingsSchema = z.object({
  /** Zona horaria IANA en que se muestran las fechas. */
  timezone: z.string(),
});
export type AppSettings = z.infer<typeof appSettingsSchema>;
