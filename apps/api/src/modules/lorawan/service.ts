import {
  missingForRegistration,
  type LnsRegistrationDto,
  type LorawanDto,
  type LorawanClass,
  type LorawanRegion,
  type LorawanVersion,
  type RevealKeysResult,
  type UpdateLorawanInput,
} from '@inventarius/shared';
import type { Executor } from '../../core/db/executor.js';
import { changedFields } from '../../core/diff.js';
import { ConflictError, NotFoundError, ValidationError } from '../../core/errors.js';
import { isViolation } from '../catalog/entity.js';
import type { SecretBox } from '../../core/secret-box.js';
import type { Actor, AuditService } from '../audit/service.js';
import type { LorawanRepository, LorawanRow, LorawanValues } from './repository.js';

/** Lo que `lorawan` necesita saber de un activo; lo implementa el módulo de activos. */
export interface LorawanAssetPort {
  /** Lee y bloquea el activo; `undefined` si no existe. */
  lock(
    exec: Executor,
    id: string,
  ): Promise<
    | {
        id: string;
        assetTag: string;
        name: string;
        deleted: boolean;
        categoryExtension: string;
        modelDefaults: {
          deviceClass: string | null;
          lorawanVersion: string | null;
          region: string | null;
        };
      }
    | undefined
  >;
}

/** Estado del registro en el LNS de un activo; lo implementa el módulo de registro. */
export interface RegistrationReader {
  find(exec: Executor, assetId: string): Promise<LnsRegistrationDto | null>;
}

/** Datos descifrados de un dispositivo, solo para enviarlos al LNS. Nunca se registran en logs. */
export interface LorawanSecrets {
  devEui: string;
  joinEui: string;
  appKey: string;
  nwkKey: string | null;
  deviceClass: LorawanClass | null;
  lorawanVersion: LorawanVersion | null;
  region: LorawanRegion | null;
}

export class EncryptionNotConfiguredError extends ConflictError {
  constructor() {
    super('Falta APP_ENCRYPTION_KEY: el servidor no puede guardar ni leer claves');
  }
}

const ctx = (assetId: string, column: 'app_key' | 'nwk_key') =>
  `asset_lorawan:${assetId}:${column}`;

/** Campos de los datos LoRaWAN que cambian la identidad del dispositivo en el LNS. */
/** Estados en que el dispositivo existe (o puede existir) en el LNS: no se cambia su identidad. */
const REMOTE_STATUSES = new Set<string>(['registered', 'registering', 'deregistering', 'partial']);

const IDENTITY_FIELDS = ['devEui', 'joinEui', 'appKey', 'nwkKey'] as const;

/**
 * Datos LoRaWAN del activo (RF-21, 5.2): validación, unicidad de DevEUI, cifrado de claves, valores por defecto del
 * modelo y reveal auditado. Las claves nunca salen salvo por `reveal` (RF-30).
 */
export class LorawanService {
  constructor(
    private readonly repo: LorawanRepository,
    private readonly db: Executor,
    private readonly audit: AuditService,
    private readonly assets: LorawanAssetPort,
    private readonly registrations: RegistrationReader,
    private readonly box: SecretBox | undefined,
  ) {}

  private requireBox(): SecretBox {
    if (!this.box) throw new EncryptionNotConfiguredError();
    return this.box;
  }

  private async requireAsset(tx: Executor, assetId: string, forWrite: boolean) {
    const asset = await this.assets.lock(tx, assetId);
    if (!asset) throw new NotFoundError('Activo no encontrado');
    if (asset.categoryExtension !== 'lorawan') {
      throw new ConflictError('La categoría del modelo de este activo no tiene datos LoRaWAN');
    }
    if (forWrite && asset.deleted) {
      throw new ConflictError('El activo está dado de baja; restáuralo para modificarlo');
    }
    return asset;
  }

  async get(assetId: string): Promise<LorawanDto> {
    return this.db.transaction(async (tx) => {
      const asset = await this.requireAsset(tx, assetId, false);
      return this.toDto(tx, assetId, await this.repo.get(tx, assetId), asset.modelDefaults);
    });
  }

  /** Edita los datos LoRaWAN de un activo (campo omitido = sin cambios, `null` = borrar). */
  async update(actor: Actor, assetId: string, input: UpdateLorawanInput): Promise<LorawanDto> {
    return this.db.transaction((tx) => this.apply(tx, actor, assetId, input));
  }

  /**
   * Aplica el cambio dentro de la transacción del llamador (también se usa al crear el activo con datos
   * LoRaWAN, RF-21). Con una fila nueva, clase/versión/región vacías se completan con las del modelo; con
   * `fillEmptyFromModel` (importación CSV, RF-66) también las vacías de una fila que ya existía.
   */
  async apply(
    tx: Executor,
    actor: Actor,
    assetId: string,
    input: UpdateLorawanInput,
    options: { fillEmptyFromModel?: boolean } = {},
  ): Promise<LorawanDto> {
    const asset = await this.requireAsset(tx, assetId, true);
    const current = await this.repo.get(tx, assetId);
    const registration = await this.registrations.find(tx, assetId);
    if (
      registration &&
      REMOTE_STATUSES.has(registration.status) &&
      IDENTITY_FIELDS.some((f) => input[f] !== undefined && changes(current, f, input))
    ) {
      throw new ConflictError(
        'El activo está registrado en un LNS: dalo de baja allí antes de cambiar DevEUI, JoinEUI o claves',
      );
    }
    if (input.devEui) await this.assertDevEuiFree(tx, assetId, input.devEui);

    const values: LorawanValues = {};
    if (input.devEui !== undefined) values.devEui = input.devEui;
    if (input.joinEui !== undefined) values.joinEui = input.joinEui;
    const keyChanges: string[] = [];
    if (input.appKey !== undefined || input.nwkKey !== undefined) {
      const box = this.requireBox();
      // Las dos claves comparten `key_id`: si una cambia, la otra se recifra con la clave vigente.
      const appKey =
        input.appKey !== undefined ? input.appKey : this.plain(current, 'app_key', assetId);
      const nwkKey =
        input.nwkKey !== undefined ? input.nwkKey : this.plain(current, 'nwk_key', assetId);
      values.appKeyEnc = appKey === null ? null : box.seal(appKey, ctx(assetId, 'app_key')).data;
      values.nwkKeyEnc = nwkKey === null ? null : box.seal(nwkKey, ctx(assetId, 'nwk_key')).data;
      values.keyId = appKey === null && nwkKey === null ? null : box.currentKeyId;
      if (input.appKey !== undefined) keyChanges.push('appKey');
      if (input.nwkKey !== undefined) keyChanges.push('nwkKey');
    }
    for (const f of ['deviceClass', 'lorawanVersion', 'region'] as const) {
      if (input[f] !== undefined) values[f] = input[f];
      else if ((!current || (options.fillEmptyFromModel && !current[f])) && asset.modelDefaults[f])
        values[f] = asset.modelDefaults[f];
    }

    try {
      await this.repo.upsert(tx, assetId, values);
    } catch (e) {
      if (isViolation(e, '23505')) throw devEuiTaken();
      throw e;
    }
    const after = await this.repo.get(tx, assetId);
    const diff = changedFields(snapshot(current), snapshot(after));
    if (diff || keyChanges.length) {
      await this.audit.record(tx, {
        ...actor,
        action: 'lorawan.update',
        entity: 'asset',
        entityId: assetId,
        entityLabel: `${asset.assetTag} ${asset.name}`,
        diff: {
          before: diff?.before ?? {},
          after: {
            ...(diff?.after ?? {}),
            ...(keyChanges.includes('appKey') ? { appKeyChanged: true } : {}),
            ...(keyChanges.includes('nwkKey') ? { nwkKeyChanged: true } : {}),
          },
        },
      });
    }
    return this.toDto(tx, assetId, after, asset.modelDefaults);
  }

  /** Muestra las claves en claro. Exige `lorawan:keys:reveal` (la ruta) y deja rastro auditado (RF-30). */
  async reveal(actor: Actor, assetId: string): Promise<RevealKeysResult> {
    return this.db.transaction(async (tx) => {
      const asset = await this.requireAsset(tx, assetId, false);
      const row = await this.repo.get(tx, assetId);
      const result = {
        appKey: this.plain(row, 'app_key', assetId),
        nwkKey: this.plain(row, 'nwk_key', assetId),
      };
      await this.audit.record(tx, {
        ...actor,
        action: 'lorawan.reveal_keys',
        entity: 'asset',
        entityId: assetId,
        entityLabel: `${asset.assetTag} ${asset.name}`,
        diff: { keys: ['appKey', 'nwkKey'].filter((k) => result[k as keyof typeof result]) },
      });
      return result;
    });
  }

  /** Datos completos y descifrados para registrar en el LNS; valida lo exigido por RF-60. */
  async secretsFor(exec: Executor, assetId: string): Promise<LorawanSecrets> {
    const asset = await this.assets.lock(exec, assetId);
    if (!asset) throw new NotFoundError('Activo no encontrado');
    const row = await this.repo.get(exec, assetId);
    const missing = missingForRegistration(readiness(row, asset.modelDefaults));
    if (!row || missing.length) {
      throw new ValidationError('Faltan datos LoRaWAN para registrar en el LNS', {
        lorawan: missing.map((f) => `Falta ${f}`),
      });
    }
    return {
      devEui: row.devEui!,
      joinEui: row.joinEui!,
      appKey: this.plain(row, 'app_key', assetId)!,
      nwkKey: this.plain(row, 'nwk_key', assetId),
      deviceClass: (row.deviceClass ?? asset.modelDefaults.deviceClass) as LorawanClass | null,
      lorawanVersion: (row.lorawanVersion ??
        asset.modelDefaults.lorawanVersion) as LorawanVersion | null,
      region: (row.region ?? asset.modelDefaults.region) as LorawanRegion | null,
    };
  }

  /** DevEUI guardado del activo, sin tocar las claves. */
  async devEuiOf(exec: Executor, assetId: string): Promise<string | null> {
    return (await this.repo.get(exec, assetId))?.devEui ?? null;
  }

  /** Recifra todas las claves con la clave maestra vigente (rotación). Devuelve cuántas filas cambió. */
  async reencryptAll(): Promise<number> {
    const box = this.requireBox();
    return this.db.transaction(async (tx) => {
      let n = 0;
      for (const row of await this.repo.withSecrets(tx)) {
        if (!row.keyId || !box.needsRotation(row.keyId)) continue;
        await this.repo.upsert(tx, row.assetId, {
          appKeyEnc: reseal(box, row, 'app_key'),
          nwkKeyEnc: reseal(box, row, 'nwk_key'),
          keyId: box.currentKeyId,
        });
        n += 1;
      }
      return n;
    });
  }

  private plain(row: LorawanRow | undefined, column: 'app_key' | 'nwk_key', assetId: string) {
    const enc = column === 'app_key' ? row?.appKeyEnc : row?.nwkKeyEnc;
    if (!row || !enc || !row.keyId) return null;
    return this.requireBox().open(enc, row.keyId, ctx(assetId, column));
  }

  private async assertDevEuiFree(tx: Executor, assetId: string, devEui: string): Promise<void> {
    const owner = await this.repo.ownerOfDevEui(tx, devEui);
    if (owner && owner.assetId !== assetId) throw devEuiTaken(owner.assetTag);
  }

  private async toDto(
    exec: Executor,
    assetId: string,
    row: LorawanRow | undefined,
    modelDefaults: LorawanAssetModelDefaults,
  ): Promise<LorawanDto> {
    return {
      devEui: row?.devEui ?? null,
      joinEui: row?.joinEui ?? null,
      hasAppKey: Boolean(row?.appKeyEnc),
      hasNwkKey: Boolean(row?.nwkKeyEnc),
      activation: 'OTAA',
      deviceClass: (row?.deviceClass ?? null) as LorawanClass | null,
      lorawanVersion: (row?.lorawanVersion ?? null) as LorawanVersion | null,
      region: (row?.region ?? null) as LorawanRegion | null,
      modelDefaults: modelDefaults as LorawanDto['modelDefaults'],
      missingForRegistration: missingForRegistration(readiness(row, modelDefaults)),
      registration: await this.registrations.find(exec, assetId),
    };
  }
}

type LorawanAssetModelDefaults = {
  deviceClass: string | null;
  lorawanVersion: string | null;
  region: string | null;
};

function readiness(row: LorawanRow | undefined, defaults: LorawanAssetModelDefaults) {
  return {
    devEui: row?.devEui ?? null,
    joinEui: row?.joinEui ?? null,
    hasAppKey: Boolean(row?.appKeyEnc),
    hasNwkKey: Boolean(row?.nwkKeyEnc),
    lorawanVersion: row?.lorawanVersion ?? defaults.lorawanVersion,
  };
}

function snapshot(row: LorawanRow | undefined): Record<string, unknown> {
  return {
    devEui: row?.devEui ?? null,
    joinEui: row?.joinEui ?? null,
    hasAppKey: Boolean(row?.appKeyEnc),
    hasNwkKey: Boolean(row?.nwkKeyEnc),
    deviceClass: row?.deviceClass ?? null,
    lorawanVersion: row?.lorawanVersion ?? null,
    region: row?.region ?? null,
  };
}

/** `true` si el valor pedido difiere del guardado (las claves siempre cuentan como cambio). */
function changes(
  current: LorawanRow | undefined,
  field: (typeof IDENTITY_FIELDS)[number],
  input: UpdateLorawanInput,
): boolean {
  if (field === 'appKey' || field === 'nwkKey') return true;
  return (current?.[field] ?? null) !== input[field];
}

function reseal(box: SecretBox, row: LorawanRow, column: 'app_key' | 'nwk_key'): Buffer | null {
  const enc = column === 'app_key' ? row.appKeyEnc : row.nwkKeyEnc;
  if (!enc || !row.keyId) return null;
  const context = ctx(row.assetId, column);
  return box.seal(box.open(enc, row.keyId, context), context).data;
}

function devEuiTaken(assetTag?: string): ValidationError {
  const msg = assetTag ? `Ese DevEUI ya lo usa el activo ${assetTag}` : 'Ese DevEUI ya está en uso';
  return new ValidationError(msg, { devEui: [msg] });
}
