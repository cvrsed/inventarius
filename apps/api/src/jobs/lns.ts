import type { PgBoss } from 'pg-boss';
import { LNS_DEREGISTER_QUEUE, LNS_REGISTER_QUEUE } from '../core/queues.js';
import type { RegistrationService } from '../modules/lns/registration-service.js';

interface RegistrationJob {
  registrationId?: string;
}

/**
 * Atiende las colas de registro y baja en el LNS (RF-61, RF-62). Una excepción del handler hace que pg-boss
 * reintente con espera creciente (solo errores transitorios, RF-63); el servicio decide cuándo rendirse.
 */
export async function startLnsJobs(
  boss: PgBoss,
  registrations: Pick<RegistrationService, 'runRegister' | 'runDeregister'>,
  log: { info: (obj: object, msg: string) => void },
): Promise<void> {
  const handle =
    (run: (id: string) => Promise<void>, what: string) =>
    async (jobs: { data: RegistrationJob }[]): Promise<void> => {
      for (const job of jobs) {
        const id = job.data.registrationId;
        if (!id) continue;
        log.info({ registrationId: id }, what);
        await run(id);
      }
    };
  await boss.work(
    LNS_REGISTER_QUEUE,
    handle((id) => registrations.runRegister(id), 'registrando en el LNS'),
  );
  await boss.work(
    LNS_DEREGISTER_QUEUE,
    handle((id) => registrations.runDeregister(id), 'dando de baja en el LNS'),
  );
}
