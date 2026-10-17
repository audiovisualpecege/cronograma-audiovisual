// Relógio do worker. Os testes trocam por um relógio fixo ou usam os temporizadores falsos do Vitest,
// por isso a espera é sempre por setTimeout e a hora por Date.
export interface Clock {
  now(): Date;
  sleep(ms: number): Promise<void>;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, Math.max(0, ms)));

export const systemClock: Clock = { now: () => new Date(), sleep };

/** Relógio que começa num instante dado e anda junto com o real (testes contra o Supabase local). */
export function clockFrom(start: Date): Clock {
  const offset = start.getTime() - Date.now();
  return { now: () => new Date(Date.now() + offset), sleep };
}
