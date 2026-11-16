import type { Problem } from '@inventarius/shared';

/** Base de los errores del dominio; el mapeo a HTTP vive solo en `toProblem`. */
export abstract class DomainError extends Error {
  abstract readonly status: number;
  abstract readonly slug: string;
  abstract readonly title: string;
  readonly fieldErrors: Record<string, string[]> | undefined;

  constructor(message: string, fieldErrors?: Record<string, string[]>) {
    super(message);
    this.name = new.target.name;
    this.fieldErrors = fieldErrors;
  }
}

export class NotFoundError extends DomainError {
  readonly status = 404;
  readonly slug = 'not-found';
  readonly title = 'Recurso no encontrado';
  constructor(message = 'Recurso no encontrado') {
    super(message);
  }
}

export class ConflictError extends DomainError {
  readonly status = 409;
  readonly slug = 'conflict';
  readonly title = 'Conflicto';
}

export class ForbiddenError extends DomainError {
  readonly status = 403;
  readonly slug = 'forbidden';
  readonly title = 'Sin permiso';
  constructor(message = 'No tienes permiso para realizar esta acción') {
    super(message);
  }
}

export class UnauthorizedError extends DomainError {
  readonly status = 401;
  readonly slug = 'unauthorized';
  readonly title = 'No autenticado';
  constructor(message = 'Debes iniciar sesión') {
    super(message);
  }
}

export class ValidationError extends DomainError {
  readonly status = 422;
  readonly slug = 'validation';
  readonly title = 'Datos inválidos';
}

const TYPE_BASE = 'https://inventarius.local/problems/';

/** Convierte un error del dominio en el cuerpo RFC 9457. */
export function toProblem(error: DomainError): Problem {
  return {
    type: `${TYPE_BASE}${error.slug}`,
    title: error.title,
    status: error.status,
    detail: error.message,
    ...(error.fieldErrors ? { errors: error.fieldErrors } : {}),
  };
}

/** Problem genérico para errores no controlados: nunca expone detalles internos. */
export function internalProblem(): Problem {
  return {
    type: `${TYPE_BASE}internal`,
    title: 'Error interno',
    status: 500,
    detail: 'Ocurrió un error inesperado. Intenta de nuevo en unos minutos.',
  };
}

/** Problem para fallas de validación de esquema (400). */
export function badRequestProblem(errors: Record<string, string[]>): Problem {
  return {
    type: `${TYPE_BASE}bad-request`,
    title: 'Solicitud inválida',
    status: 400,
    detail: 'Revisa los datos enviados.',
    errors,
  };
}
