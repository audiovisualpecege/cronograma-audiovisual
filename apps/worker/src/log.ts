import pino from 'pino';

// Logs JSON no stdout do contêiner (TechSpec, Monitoring and Observability).
export type Logger = pino.Logger;

export function createLogger(level = 'info'): Logger {
  return pino({
    level,
    base: { service: 'cronograma-worker' },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: { level: (label) => ({ level: label }) },
  });
}

export const silentLogger = (): Logger => pino({ level: 'silent' });

/** Mensagem legível de qualquer erro, para logs e para `jobs.error`. */
export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
