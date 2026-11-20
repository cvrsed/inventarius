import { randomUUID } from 'node:crypto';
import type { LorawanImportPreview } from '@inventarius/shared';
import type { Executor } from '../../core/db/executor.js';
import { ValidationError } from '../../core/errors.js';
import type { Actor, AuditService } from '../audit/service.js';
import { parseLorawanImport, type ParsedImportRow } from './import-domain.js';
import type { LorawanRepository } from './repository.js';
import type { LorawanService, RegistrationReader } from './service.js';

/** Búsqueda de activos por número de serie; la implementa el módulo de activos. */
export interface SerialLookup {
  bySerials(
    exec: Executor,
    serials: string[],
  ): Promise<
    {
      id: string;
      assetTag: string;
      serial: string;
      deleted: boolean;
      categoryExtension: string;
      modelName: string;
      modelNumber: string | null;
    }[]
  >;
}

interface Analyzed extends ParsedImportRow {
  assetId: string | null;
  assetTag: string | null;
}

const REMOTE = new Set<string>(['registered', 'registering', 'deregistering', 'partial']);

/**
 * Importación CSV de datos LoRaWAN por número de serie (RF-66): vista previa con errores por fila y aplicación en una
 * sola transacción, todo o nada. Las claves no se escriben en logs ni en la auditoría.
 */
export class LorawanImportService {
  constructor(
    private readonly db: Executor,
    private readonly repo: LorawanRepository,
    private readonly lorawan: LorawanService,
    private readonly assets: SerialLookup,
    private readonly registrations: RegistrationReader,
    private readonly audit: AuditService,
  ) {}

  async preview(csv: string): Promise<LorawanImportPreview> {
    const { rows, fileErrors } = await this.analyze(this.db, csv);
    return summarize(rows, fileErrors);
  }

  /** Aplica el archivo completo o nada: con cualquier error (de archivo o de fila) responde 422 sin escribir. */
  async apply(actor: Actor, csv: string): Promise<{ applied: number }> {
    return this.db.transaction(async (tx) => {
      const { rows, fileErrors } = await this.analyze(tx, csv);
      const invalid = rows.filter((r) => r.errors.length);
      if (fileErrors.length || invalid.length) {
        throw new ValidationError('El archivo tiene errores; no se aplicó nada', {
          csv: [...fileErrors, ...(invalid.length ? [`${invalid.length} filas con errores`] : [])],
        });
      }
      const batchId = randomUUID();
      for (const row of rows) {
        await this.lorawan.apply(tx, actor, row.assetId!, row.data, {
          fillEmptyFromModel: true,
          batchId,
        });
      }
      await this.audit.record(tx, {
        ...actor,
        action: 'lorawan.import',
        entity: 'lorawan_import',
        entityId: batchId,
        entityLabel: `Importación de ${rows.length} dispositivos LoRaWAN`,
        // Solo cantidades y series: nunca claves.
        diff: { after: { count: rows.length, serials: rows.map((r) => r.serial) } },
      });
      return { applied: rows.length };
    });
  }

  private async analyze(
    exec: Executor,
    csv: string,
  ): Promise<{ rows: Analyzed[]; fileErrors: string[] }> {
    const parsed = parseLorawanImport(csv);
    const serials = [...new Set(parsed.rows.map((r) => r.serial).filter(Boolean))];
    const found = serials.length ? await this.assets.bySerials(exec, serials) : [];
    const bySerial = new Map<string, typeof found>();
    for (const a of found) {
      const k = a.serial.toLowerCase();
      bySerial.set(k, [...(bySerial.get(k) ?? []), a]);
    }
    const rows: Analyzed[] = [];
    for (const row of parsed.rows) {
      const out: Analyzed = { ...row, assetId: null, assetTag: null, errors: [...row.errors] };
      const candidates = row.serial ? (bySerial.get(row.serial.toLowerCase()) ?? []) : [];
      const matches = row.model ? candidates.filter((a) => isModel(a, row.model)) : candidates;
      if (row.serial && candidates.length === 0) {
        out.errors.push('Ningún activo tiene ese número de serie');
      } else if (row.serial && matches.length === 0) {
        out.errors.push('Ningún activo de ese modelo tiene ese número de serie');
      } else if (matches.length > 1) {
        const models = [...new Set(matches.map((a) => a.modelName))].join(', ');
        out.errors.push(
          `Número de serie ambiguo: existe en más de un modelo (${models}); agrega la columna «modelo»`,
        );
      } else if (matches[0]) {
        const asset = matches[0];
        out.assetId = asset.id;
        out.assetTag = asset.assetTag;
        if (asset.deleted) out.errors.push('El activo está dado de baja');
        if (asset.categoryExtension !== 'lorawan') {
          out.errors.push('El modelo del activo no es de una categoría LoRaWAN');
        }
        const registration = await this.registrations.find(exec, asset.id);
        if (registration && REMOTE.has(registration.status)) {
          out.errors.push(
            'El activo está registrado en un LNS: dalo de baja allí antes de cambiar sus datos',
          );
        }
        if (row.data.devEui) {
          const owner = await this.repo.ownerOfDevEui(exec, row.data.devEui);
          if (owner && owner.assetId !== asset.id) {
            out.errors.push(`El DevEUI ya lo usa el activo ${owner.assetTag}`);
          }
        }
      }
      rows.push(out);
    }
    return { rows, fileErrors: parsed.fileErrors };
  }
}

/** El texto coincide con el nombre o el código del modelo, sin distinguir mayúsculas. */
function isModel(a: { modelName: string; modelNumber: string | null }, text: string): boolean {
  const t = text.trim().toLowerCase();
  return a.modelName.toLowerCase() === t || a.modelNumber?.toLowerCase() === t;
}

function summarize(rows: Analyzed[], fileErrors: string[]): LorawanImportPreview {
  const invalid = rows.filter((r) => r.errors.length).length;
  return {
    rows: rows.map((r) => ({
      line: r.line,
      serial: r.serial,
      assetId: r.assetId,
      assetTag: r.assetTag,
      devEui: r.data.devEui ?? null,
      errors: r.errors,
    })),
    total: rows.length,
    valid: rows.length - invalid,
    invalid,
    fileErrors,
  };
}
