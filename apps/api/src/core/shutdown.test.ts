import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { shutdown } from './shutdown.js';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const opts = () => ({
  timeoutMs: 10_000,
  log: { info: vi.fn(), error: vi.fn() },
  exit: vi.fn(),
});

describe('shutdown con tope de tiempo [P33]', () => {
  it('termina con código 0 si el cierre acaba a tiempo', async () => {
    const o = opts();
    await shutdown(async () => undefined, o);
    expect(o.exit).toHaveBeenCalledWith(0);
    expect(o.log.error).not.toHaveBeenCalled();
  });

  it('un cierre colgado termina igual con código 1 al pasar el tope', async () => {
    const o = opts();
    const pending = shutdown(() => new Promise<void>(() => undefined), o);
    await vi.advanceTimersByTimeAsync(9_999);
    expect(o.exit).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(o.exit).toHaveBeenCalledWith(1);
    expect(o.log.error).toHaveBeenCalledWith(
      { timeoutMs: 10_000 },
      expect.stringContaining('tope'),
    );
  });

  it('un cierre que falla se registra y termina con código 1', async () => {
    const o = opts();
    await shutdown(() => Promise.reject(new Error('pool roto')), o);
    expect(o.exit).toHaveBeenCalledWith(1);
    expect(o.log.error).toHaveBeenCalledWith({ err: expect.any(Error) }, expect.any(String));
  });
});
