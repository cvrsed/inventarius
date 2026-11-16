import type { FastifyRequest } from 'fastify';
import { PreconditionRequiredError } from './errors.js';
import type { Actor } from '../modules/audit/service.js';

/** Arma el actor de auditoría (quién y desde qué IP) a partir de la petición. */
export function actorOf(req: FastifyRequest): Actor {
  return { actorId: req.auth?.user.id ?? null, ip: req.ip };
}

/** Extrae la versión de `If-Match` (con o sin comillas / prefijo débil). Obligatoria en PATCH (sección 9.1). */
export function ifMatchOf(header: string | undefined): string {
  if (!header) throw new PreconditionRequiredError();
  return header.replace(/^W\//, '').replace(/^"|"$/g, '');
}
