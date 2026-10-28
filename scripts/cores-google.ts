// Lê do Google as cores dos eventos e das agendas e grava em apps/web/public/dev/cores-google.json, para o app
// local (npm run dev) pintar os cartões antes da migração 0024 e do serviço de fundo novo. Só lê: no Google (como o
// serviço de fundo) e, no banco, a lista de agendas. Não grava nada no banco.
//
//   npx tsx --env-file=..\teste-servico-de-fundo\worker-teste.env scripts/cores-google.ts
//
// O .env precisa de SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e GOOGLE_SERVICE_ACCOUNT_FILE (o JSON da conta de
// serviço, o mesmo do NAS). O arquivo gerado fica fora do git (.gitignore).
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { GoogleCalendar } from '../apps/worker/src/calendar/google.ts';
import { syncWindow } from '../apps/worker/src/calendar/sync.ts';
import { loadConfig } from '../apps/worker/src/config.ts';

const config = loadConfig();
if (!config.googleServiceAccount) throw new Error('Falta GOOGLE_SERVICE_ACCOUNT_FILE (o JSON da conta de serviço) no .env.');
const google = new GoogleCalendar(config.googleServiceAccount, { now: () => new Date() });
const db = createClient(config.supabaseUrl, config.serviceRoleKey, { auth: { persistSession: false } });

const { data: sources, error } = await db.from('calendar_sources').select('id, label, google_calendar_id').eq('enabled', true).is('archived_at', null);
if (error) throw new Error(`Lista de agendas: ${error.message}`);

const window = syncWindow(new Date());
const out = { events: {} as Record<string, string>, sources: {} as Record<string, string>, read_at: new Date().toISOString() };
for (const s of sources ?? []) {
  const items = await google.listEvents(s.google_calendar_id, window);
  let colored = 0;
  for (const e of items) {
    if (e.status === 'cancelled' || !e.colorId) continue;
    out.events[e.id] = e.colorId;
    colored++;
  }
  const color = await google.calendarColor(s.google_calendar_id);
  if (color) out.sources[s.id] = color;
  console.log(`${s.label}: ${items.length} eventos, ${colored} com cor própria; cor da agenda ${color ?? 'não lida (fica a cor da família)'}`);
}

const file = join(dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'web', 'public', 'dev', 'cores-google.json');
mkdirSync(dirname(file), { recursive: true });
writeFileSync(file, JSON.stringify(out, null, 2));
console.log(`Gravado em ${file}. Recarregue o app local.`);
