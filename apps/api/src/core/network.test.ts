import { describe, expect, it } from 'vitest';
import { isInternalAddress } from './network.js';

describe('isInternalAddress', () => {
  it.each([
    '127.0.0.1',
    '::1',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.10',
    '::ffff:10.0.0.1',
  ])('%s es interna', (ip) => expect(isInternalAddress(ip)).toBe(true));
  it.each(['8.8.8.8', '172.32.0.1', '11.0.0.1', '2001:db8::1', ''])('%s es externa', (ip) =>
    expect(isInternalAddress(ip)).toBe(false),
  );
});
