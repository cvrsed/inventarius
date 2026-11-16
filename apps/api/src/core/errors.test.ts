import { describe, expect, it } from 'vitest';
import {
  ConflictError,
  DomainError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
  toProblem,
} from './errors.js';

describe('errores del dominio', () => {
  it.each([
    [new NotFoundError('Activo no encontrado'), 404],
    [new ConflictError('Etiqueta duplicada'), 409],
    [new ForbiddenError(), 403],
    [new UnauthorizedError(), 401],
    [new ValidationError('Datos inválidos', { name: ['Requerido'] }), 422],
  ])('%s se mapea al status HTTP correcto', (error, status) => {
    expect(error).toBeInstanceOf(DomainError);
    expect(toProblem(error).status).toBe(status);
  });

  it('incluye errores por campo en problem+json', () => {
    const problem = toProblem(new ValidationError('Datos inválidos', { name: ['Requerido'] }));
    expect(problem.errors).toEqual({ name: ['Requerido'] });
    expect(problem.type).toContain('validation');
  });
});
