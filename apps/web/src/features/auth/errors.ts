import { ApiError } from '@/shared/api/http';

type Translate = (key: string, named?: Record<string, unknown>) => string;

/** Texto accionable para mostrar al usuario a partir de cualquier error. */
export function errorMessage(e: unknown, t: Translate): string {
  if (e instanceof ApiError) {
    if (e.status === 0) return t('common.offline');
    if (e.status === 412) return t('common.stale');
    if (e.status >= 400 && e.status < 500 && e.problem?.detail) return e.problem.detail;
  }
  return t('common.genericError');
}
