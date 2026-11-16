import { z } from 'zod';

/** Cuerpo de error RFC 9457 (`application/problem+json`). */
export const problemSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string().optional(),
  errors: z.record(z.string(), z.array(z.string())).optional(),
});

export type Problem = z.infer<typeof problemSchema>;
