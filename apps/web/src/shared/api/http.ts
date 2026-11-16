import { csrfResponseSchema, problemSchema, type Problem } from '@inventarius/shared';
import type { z } from 'zod';

/** Error de la API ya normalizado (RFC 9457). `status` 0 = sin conexión. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly problem: Problem | null,
    message?: string,
    /** Segundos de espera indicados por `Retry-After` (429). */
    readonly retryAfterSeconds = 60,
  ) {
    super(message ?? problem?.detail ?? problem?.title ?? 'Error de red');
  }

  get fieldErrors(): Record<string, string[]> {
    return this.problem?.errors ?? {};
  }
}

let csrfToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function resetCsrfToken(): void {
  csrfToken = null;
}

/** El store de sesión se registra aquí para reaccionar a una sesión vencida sin acoplar el cliente a Pinia. */
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

async function ensureCsrf(force = false): Promise<string> {
  if (csrfToken && !force) return csrfToken;
  const res = await fetch('/api/v1/auth/csrf', { headers: { accept: 'application/json' } });
  csrfToken = csrfResponseSchema.parse(await res.json()).token;
  return csrfToken;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Valor de `If-Match` (versión del recurso) para PATCH. */
  ifMatch?: string;
  /** No notificar el 401 (p. ej. `me` al arrancar, donde 401 es lo esperado). */
  silent401?: boolean;
  /** Devuelve también el ETag junto con los datos. */
  withMeta?: boolean;
  signal?: AbortSignal;
}

async function send(path: string, opts: RequestOptions, retried = false): Promise<Response> {
  const method = opts.method ?? 'GET';
  const headers: Record<string, string> = { accept: 'application/json' };
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  if (opts.ifMatch) headers['if-match'] = `"${opts.ifMatch}"`;
  if (method !== 'GET') headers['x-csrf-token'] = await ensureCsrf();

  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers,
      credentials: 'same-origin',
      ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
      ...(opts.signal ? { signal: opts.signal } : {}),
    });
  } catch {
    throw new ApiError(0, null, 'Sin conexión con el servidor');
  }

  if (res.status === 403 && method !== 'GET' && !retried) {
    const peek = (await res
      .clone()
      .json()
      .catch(() => null)) as { detail?: string } | null;
    if (peek?.detail && /csrf/i.test(peek.detail)) {
      await ensureCsrf(true);
      return send(path, opts, true);
    }
  }
  return res;
}

async function toError(res: Response): Promise<ApiError> {
  const parsed = problemSchema.safeParse(await res.json().catch(() => null));
  const retryAfter = Number(res.headers.get('retry-after'));
  return new ApiError(
    res.status,
    parsed.success ? parsed.data : null,
    undefined,
    Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 60,
  );
}

/** Llama a la API, valida la respuesta con un esquema Zod compartido y normaliza los errores. */
export async function api<S extends z.ZodType>(
  path: string,
  schema: S,
  opts: RequestOptions & { withMeta: true },
): Promise<{ data: z.infer<S>; etag: string | null } & { etag: string | null }>;
export async function api<S extends z.ZodType>(
  path: string,
  schema: S,
  opts?: RequestOptions,
): Promise<z.infer<S>>;
export async function api<S extends z.ZodType>(
  path: string,
  schema: S,
  opts: RequestOptions = {},
): Promise<unknown> {
  const res = await send(path, opts);
  if (!res.ok) {
    if (res.status === 401 && !opts.silent401) onUnauthorized?.();
    throw await toError(res);
  }
  const data = res.status === 204 ? null : schema.parse(await res.json());
  if (opts.withMeta) {
    return {
      data,
      etag: res.headers.get('etag')?.replace(/^W\//, '').replace(/^"|"$/g, '') ?? null,
    };
  }
  return data;
}
