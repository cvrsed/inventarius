import { describe, expect, it } from 'vitest';
import { assertMarkedAsTest } from './chirpstack-test-guard.js';

describe('assertMarkedAsTest', () => {
  it('corre solo si el endpoint está marcado como de prueba', () => {
    expect(() => assertMarkedAsTest('chirpstack:8080', 'chirpstack:8080')).not.toThrow();
  });

  it('se niega sin la marca o con la de otro endpoint, y lo dice', () => {
    expect(() => assertMarkedAsTest('cs.example.test:8080', undefined)).toThrow(
      /se niega a correr contra «cs\.example\.test:8080».*CHIRPSTACK_TEST_ENDPOINT/,
    );
    expect(() => assertMarkedAsTest('cs.example.test:8080', 'otro.example.test:8080')).toThrow(
      /se niega/,
    );
  });
});
