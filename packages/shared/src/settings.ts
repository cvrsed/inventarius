import { z } from 'zod';
import { currencySchema } from './currency.js';

/** Ajustes de la instalación que la web necesita para mostrar datos (no incluye secretos). */
export const appSettingsSchema = z.object({
  /** Zona horaria IANA en que se muestran las fechas. */
  timezone: z.string(),
  /** Moneda que se propone para el costo de compra. */
  defaultCurrency: currencySchema,
});
export type AppSettings = z.infer<typeof appSettingsSchema>;
