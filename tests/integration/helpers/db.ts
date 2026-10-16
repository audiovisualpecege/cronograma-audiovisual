// Acesso direto ao Postgres local (como postgres) para gravar a semente e montar cenários.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

// Datas de calendário ('YYYY-MM-DD') ficam texto, como chegam pelo REST.
pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v);

const SEED = readFileSync(fileURLToPath(new URL('../../../supabase/seed.test.sql', import.meta.url)), 'utf8');

export async function withDb<T>(dbUrl: string, fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

export async function resetDatabase(dbUrl: string): Promise<void> {
  await withDb(dbUrl, (c) => c.query(SEED).then(() => undefined));
}
