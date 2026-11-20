import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { parseMasterKey, SecretBox } from './secret-box.js';

const key = () => randomBytes(32);

describe('SecretBox (AES-256-GCM)', () => {
  it('cifra y descifra con el mismo contexto', () => {
    const box = new SecretBox('k1', new Map([['k1', key()]]));
    const sealed = box.seal('secreto de prueba', 'asset_lorawan:1:app_key');
    expect(sealed.keyId).toBe('k1');
    expect(sealed.data.includes(Buffer.from('secreto'))).toBe(false);
    expect(box.open(sealed.data, sealed.keyId, 'asset_lorawan:1:app_key')).toBe(
      'secreto de prueba',
    );
  });

  it('usa un IV distinto en cada cifrado', () => {
    const box = new SecretBox('k1', new Map([['k1', key()]]));
    expect(box.seal('x', 'c').data.equals(box.seal('x', 'c').data)).toBe(false);
  });

  it('el AAD ata el valor a su fila y columna', () => {
    const box = new SecretBox('k1', new Map([['k1', key()]]));
    const sealed = box.seal('x', 'asset_lorawan:1:app_key');
    expect(() => box.open(sealed.data, 'k1', 'asset_lorawan:1:nwk_key')).toThrow();
    expect(() => box.open(sealed.data, 'k1', 'asset_lorawan:2:app_key')).toThrow();
  });

  it('detecta manipulación del texto cifrado', () => {
    const box = new SecretBox('k1', new Map([['k1', key()]]));
    const sealed = box.seal('x', 'c');
    sealed.data[sealed.data.length - 1]! ^= 1;
    expect(() => box.open(sealed.data, 'k1', 'c')).toThrow();
  });

  it('descifra con una clave anterior y cifra con la vigente (rotación)', () => {
    const old = key();
    const before = new SecretBox('k1', new Map([['k1', old]])).seal('x', 'c');
    const rotated = new SecretBox(
      'k2',
      new Map([
        ['k2', key()],
        ['k1', old],
      ]),
    );
    expect(rotated.open(before.data, 'k1', 'c')).toBe('x');
    expect(rotated.needsRotation('k1')).toBe(true);
    expect(rotated.seal('x', 'c').keyId).toBe('k2');
  });

  it('falla con un key_id desconocido', () => {
    const box = new SecretBox('k1', new Map([['k1', key()]]));
    expect(() => box.open(Buffer.alloc(40), 'zz', 'c')).toThrow(/zz/);
  });

  it('exige claves de 32 bytes', () => {
    expect(() => new SecretBox('k1', new Map([['k1', Buffer.alloc(16)]]))).toThrow();
  });
});

describe('parseMasterKey', () => {
  it('acepta 64 hex o base64 de 32 bytes', () => {
    const raw = key();
    expect(parseMasterKey(raw.toString('hex')).equals(raw)).toBe(true);
    expect(parseMasterKey(raw.toString('base64')).equals(raw)).toBe(true);
  });
  it('rechaza otros largos', () => {
    expect(() => parseMasterKey('abc')).toThrow(/32 bytes/);
  });
});
