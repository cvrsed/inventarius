/** Topes de la conexión a Postgres, en milisegundos; `0` desactiva el tope. */
export interface DbTimeouts {
  /** Esperar una conexión libre del pool (o que abra una nueva) antes de fallar. */
  connectionTimeoutMs: number;
  /** `statement_timeout` de la sesión: una consulta más lenta se cancela. */
  statementTimeoutMs: number;
  /** `idle_in_transaction_session_timeout`: una transacción abierta sin actividad se termina. */
  idleInTransactionTimeoutMs: number;
}

export const DEFAULT_DB_TIMEOUTS: DbTimeouts = {
  connectionTimeoutMs: 5_000,
  statementTimeoutMs: 30_000,
  idleInTransactionTimeoutMs: 30_000,
};
