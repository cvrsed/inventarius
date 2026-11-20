import type { DashboardSummary, StatusKind } from '@inventarius/shared';
import type { Executor } from '../../core/db/executor.js';
import type { ActorDirectory } from '../audit/service.js';
import type { DashboardRepository } from './repository.js';

const TOP = 10;
const OVERDUE_LISTED = 5;
const RECENT = 5;
const MINE_LISTED = 20;
const KIND_ORDER: readonly StatusKind[] = ['deployable', 'pending', 'undeployable', 'archived'];

/** Resumen del Inicio (RF-28): una sola operación de lectura, con conteos agregados en SQL. */
export class DashboardService {
  constructor(
    private readonly repo: DashboardRepository,
    private readonly db: Executor,
    private readonly actors: ActorDirectory,
    /** «Hoy» (AAAA-MM-DD) en la zona horaria de la instalación. */
    private readonly today: () => string,
  ) {}

  async summary(userId: string): Promise<DashboardSummary> {
    const today = this.today();
    const [totals, statuses, byCategory, stock, overdueCount, overdueItems, recent, mine] =
      await Promise.all([
        this.repo.totals(this.db),
        this.repo.byStatus(this.db),
        this.repo.byCategory(this.db, TOP),
        this.repo.stockByWarehouse(this.db, TOP),
        this.repo.overdueCount(this.db, today),
        this.repo.overdueItems(this.db, today, OVERDUE_LISTED),
        this.repo.recent(this.db, RECENT),
        this.repo.mine(this.db, userId, MINE_LISTED),
      ]);
    const names = await this.actors.namesByIds([
      ...new Set(recent.flatMap((r) => (r.actorId ? [r.actorId] : []))),
    ]);
    return {
      totals,
      byStatus: statuses
        .map((st) => ({ ...st, kind: st.kind as StatusKind }))
        .sort(
          (a, b) =>
            KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
            a.name.localeCompare(b.name, 'es'),
        ),
      byCategory,
      stockByWarehouse: stock,
      overdue: { count: overdueCount, items: overdueItems },
      recent: recent.map((r) => ({
        id: r.id.toString(),
        at: r.at.toISOString(),
        action: r.action,
        actorName: r.actorId ? (names.get(r.actorId) ?? null) : null,
        actorLabel: r.actorLabel,
        assetId: r.assetId,
        assetTag: r.assetTag,
        assetName: r.assetName,
      })),
      mine: mine.map((m) => ({ ...m, since: m.since.toISOString() })),
    };
  }
}
