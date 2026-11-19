import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const IV_LENGTH = 12;
const TAG_LENGTH = 16;

/** Valor cifrado y la clave maestra con que se cifró (`key_id`), listo para guardarse. */
export interface Sealed {
  /** `iv (12) | tag (16) | texto cifrado`. */
  data: Buffer;
  keyId: string;
}

/** Interpreta una clave maestra de 32 bytes escrita como 64 caracteres hex o como base64. */
export function parseMasterKey(value: string): Buffer {
  const v = value.trim();
  const buf = /^[0-9a-fA-F]{64}$/.test(v) ? Buffer.from(v, 'hex') : Buffer.from(v, 'base64');
  if (buf.length !== 32) throw new Error('la clave maestra debe ser de 32 bytes (64 hex o base64)');
  return buf;
}

/**
 * Cifrado de secretos en reposo (sección 10.1): AES-256-GCM con IV aleatorio por valor y AAD que ata el valor a su
 * tabla, fila y columna. Admite varias claves para rotar: se cifra con la vigente y se descifra con la que indique `key_id`.
 */
export class SecretBox {
  constructor(
    readonly currentKeyId: string,
    private readonly keys: ReadonlyMap<string, Buffer>,
  ) {
    for (const [id, k] of keys) {
      if (k.length !== 32) throw new Error(`la clave ${id} debe ser de 32 bytes`);
    }
    if (!keys.has(currentKeyId)) throw new Error('falta la clave vigente');
  }

  /** Cifra `plain`; `context` es el AAD (p. ej. `asset_lorawan:<id>:app_key`). */
  seal(plain: string, context: string): Sealed {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv('aes-256-gcm', this.key(this.currentKeyId), iv);
    cipher.setAAD(Buffer.from(context));
    const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return { data: Buffer.concat([iv, cipher.getAuthTag(), body]), keyId: this.currentKeyId };
  }

  /** Descifra; lanza si la clave no existe, el contexto no coincide o el valor fue alterado. */
  open(data: Buffer, keyId: string, context: string): string {
    const decipher = createDecipheriv('aes-256-gcm', this.key(keyId), data.subarray(0, IV_LENGTH));
    decipher.setAAD(Buffer.from(context));
    decipher.setAuthTag(data.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH));
    return Buffer.concat([
      decipher.update(data.subarray(IV_LENGTH + TAG_LENGTH)),
      decipher.final(),
    ]).toString('utf8');
  }

  /** `true` si el valor se cifró con una clave que ya no es la vigente. */
  needsRotation(keyId: string): boolean {
    return keyId !== this.currentKeyId;
  }

  private key(id: string): Buffer {
    const k = this.keys.get(id);
    if (!k) throw new Error(`clave de cifrado desconocida: ${id}`);
    return k;
  }
}
