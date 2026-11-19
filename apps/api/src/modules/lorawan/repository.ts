import { eq, sql } from 'drizzle-orm';
import type { Executor } from '../../core/db/executor.js';
import { assetLorawan, assets } from '../../core/db/schema.js';

export type LorawanRow = typeof assetLorawan.$inferSelect;
export type LorawanValues = Partial<
  Pick<
    typeof assetLorawan.$inferInsert,
    | 'devEui'
    | 'joinEui'
    | 'appKeyEnc'
    | 'nwkKeyEnc'
    | 'keyId'
    | 'deviceClass'
    | 'lorawanVersion'
    | 'region'
  >
>;

/** Persistencia de la extensión LoRaWAN del activo. */
export class LorawanRepository {
  async get(exec: Executor, assetId: string): Promise<LorawanRow | undefined> {
    return (await exec.select().from(assetLorawan).where(eq(assetLorawan.assetId, assetId)))[0];
  }

  /** Crea o actualiza la fila del activo con solo los campos indicados. */
  async upsert(exec: Executor, assetId: string, values: LorawanValues): Promise<void> {
    await exec
      .insert(assetLorawan)
      .values({ assetId, ...values })
      .onConflictDoUpdate({
        target: assetLorawan.assetId,
        set: { ...values, updatedAt: sql`now()` },
      });
  }

  /** Activo que ya usa ese DevEUI, si lo hay. */
  async ownerOfDevEui(
    exec: Executor,
    devEui: string,
  ): Promise<{ assetId: string; assetTag: string } | undefined> {
    return (
      await exec
        .select({ assetId: assetLorawan.assetId, assetTag: assets.assetTag })
        .from(assetLorawan)
        .innerJoin(assets, eq(assets.id, assetLorawan.assetId))
        .where(eq(assetLorawan.devEui, devEui))
    )[0];
  }

  /** Filas con secretos, para recifrar tras rotar la clave maestra. */
  async withSecrets(exec: Executor): Promise<LorawanRow[]> {
    return exec
      .select()
      .from(assetLorawan)
      .where(sql`${assetLorawan.keyId} IS NOT NULL`);
  }
}
