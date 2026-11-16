import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ApiError, api, resetCsrfToken, setUnauthorizedHandler } from './http';

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  resetCsrfToken();
  setUnauthorizedHandler(null);
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('api()', () => {
  it('GET no pide token CSRF y valida la respuesta con el esquema', async () => {
    fetchMock.mockResolvedValueOnce(json({ a: 1 }));
    await expect(api('/api/v1/x', z.object({ a: z.number() }))).resolves.toEqual({ a: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('POST obtiene el token CSRF una vez y lo envía en la cabecera', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ token: 'tok-1' }))
      .mockResolvedValueOnce(json({ ok: true }))
      .mockResolvedValueOnce(json({ ok: true }));
    const schema = z.object({ ok: z.boolean() });
    await api('/api/v1/x', schema, { method: 'POST', body: { a: 1 } });
    await api('/api/v1/x', schema, { method: 'POST', body: { a: 2 } });
    expect(fetchMock.mock.calls.filter((c) => String(c[0]).endsWith('/auth/csrf'))).toHaveLength(1);
    const init = fetchMock.mock.calls[1]![1] as RequestInit;
    expect((init.headers as Record<string, string>)['x-csrf-token']).toBe('tok-1');
    expect(init.body).toBe(JSON.stringify({ a: 1 }));
  });

  it('reintenta una vez con un token nuevo si el servidor rechaza el CSRF', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ token: 'viejo' }))
      .mockResolvedValueOnce(
        json({ title: 'Solicitud inválida', status: 403, detail: 'Invalid csrf token' }, 403),
      )
      .mockResolvedValueOnce(json({ token: 'nuevo' }))
      .mockResolvedValueOnce(json({ ok: true }));
    await expect(
      api('/api/v1/x', z.object({ ok: z.boolean() }), { method: 'POST' }),
    ).resolves.toEqual({ ok: true });
  });

  it('convierte problem+json en ApiError con campos', async () => {
    fetchMock.mockResolvedValueOnce(json({ token: 't' })).mockResolvedValueOnce(
      json(
        {
          type: 'x',
          title: 'Datos inválidos',
          status: 422,
          detail: 'Revisa',
          errors: { name: ['Requerido'] },
        },
        422,
      ),
    );
    const err = await api('/api/v1/x', z.unknown(), { method: 'POST' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(422);
    expect((err as ApiError).fieldErrors).toEqual({ name: ['Requerido'] });
  });

  it('avisa al handler de sesión ante un 401 (salvo que se pida lo contrario)', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    fetchMock.mockResolvedValue(json({ title: 'No autenticado', status: 401 }, 401));
    await api('/api/v1/users', z.unknown()).catch(() => undefined);
    expect(handler).toHaveBeenCalledTimes(1);
    await api('/api/v1/auth/me', z.unknown(), { silent401: true }).catch(() => undefined);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('devuelve el ETag para usarlo como If-Match', async () => {
    fetchMock.mockResolvedValueOnce(json({ a: 1 }, 200, { etag: '"v1"' }));
    const res = await api('/api/v1/x', z.object({ a: z.number() }), { withMeta: true });
    expect(res.etag).toBe('v1');
  });

  it('un error de red se convierte en ApiError de status 0', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('network'));
    const err = await api('/api/v1/x', z.unknown()).catch((e: unknown) => e);
    expect((err as ApiError).status).toBe(0);
  });
});
