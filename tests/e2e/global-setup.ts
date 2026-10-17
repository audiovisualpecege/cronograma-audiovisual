// Semente nova antes da rodada de ponta a ponta.
import { resetDatabase } from '../integration/helpers/db.ts';
import { e2eEnv } from './env.ts';

export default async function globalSetup() {
  await resetDatabase(e2eEnv().dbUrl);
}
