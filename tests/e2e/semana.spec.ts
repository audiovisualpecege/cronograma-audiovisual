/// <reference lib="dom" />
// Semana do administrador de ponta a ponta: painel, link direto, prévia e montagem, mudança da agenda,
// pré-escala, escala com sobreposição, descarte de alterações e edição sem internet com conflito.
import { expect, test, type Page } from '@playwright/test';
import { fixture } from '../../apps/worker/src/test/mocks.ts';
import { resetDatabase, withDb } from '../integration/helpers/db.ts';
import { EVENT, SLOT, person, type as serviceType } from '../integration/helpers/ids.ts';
import { e2eEnv } from './env.ts';
import { email, isMobile, login } from './helpers';
import { CALENDARS, startWorker, type RunningWorker } from './worker.ts';

const WEEK_A = '2026-10-19';
const WEEK_B = '2026-10-26';
const AI_KEY = 'AIzaSy-chave-aceita-a1b2';

const db = <T extends Record<string, unknown>>(text: string, params: unknown[] = []) =>
  withDb(e2eEnv().dbUrl, (c) => c.query<T>(text, params)).then((r) => r.rows);

/** Pessoa da vaga no banco. */
const slotPerson = (slotId: string) =>
  db<{ person_id: string | null; status: string | null }>('select person_id, status from public.assignments where slot_id = $1', [slotId]).then((r) => r[0]);

async function openAs(page: Page, path: string, who = 1) {
  await page.goto(`#${path}`);
  await login(page, email(who));
  await expect(page).toHaveURL(new RegExp(`#${path.replace(/[/?]/g, (c) => `\\${c}`)}$`));
}

const eventCard = (page: Page, title: string) => page.getByRole('article', { name: title });

test.describe('semana do administrador', () => {
  let worker: RunningWorker | null = null;
  test.beforeEach(async () => {
    await resetDatabase(e2eEnv().dbUrl);
  });
  test.afterEach(async () => {
    await worker?.stop();
    worker = null;
  });

  test('E2E-002 desktop, P1 entra e vê o painel com as pendências no topo', async ({ page }, info) => {
    test.skip(isMobile(info), 'cenário de desktop');
    await page.goto('#/entrar');
    await login(page, email(1));
    await expect(page).toHaveURL(/#\/painel$/);
    await expect(page.getByRole('heading', { name: 'PAINEL DA SEMANA' })).toBeVisible();
    const pending = page.getByRole('list', { name: 'Pendências' });
    await expect(pending).toContainText('Semana de 26/10 sem montagem: 5 eventos na agenda');
    // As pendências vêm antes dos atalhos das semanas.
    const top = (await pending.boundingBox())?.y ?? Infinity;
    const shortcut = (await page.getByRole('link', { name: /Semana atual/ }).boundingBox())?.y ?? 0;
    expect(top).toBeLessThan(shortcut);
    await pending.getByRole('link', { name: /Semana de 26\/10 sem montagem/ }).click();
    await expect(page).toHaveURL(/#\/semana\/2026-10-26$/);
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(7, 0, 16)');
  });

  test('E2E-005 sem sessão, abrir #/evento/E1, entrar, e a tela do evento E1 abre', async ({ page }) => {
    await page.goto(`#/evento/${EVENT.E1}`);
    await expect(page).toHaveURL(/#\/entrar\?volta=/);
    await login(page, email(1));
    await expect(page).toHaveURL(new RegExp(`#/evento/${EVENT.E1}$`));
    await expect(page.getByRole('heading', { name: /Gravação aula Matemática/ })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Dados da agenda' })).toContainText('Estúdio 1');
    await expect(page.getByRole('note')).toContainText('Corrija na Google Agenda');
  });

  test('E2E-012 prévia da semana B, troca de tipo, observação e "Montar semana"', async ({ page }) => {
    await openAs(page, `/semana/${WEEK_B}`);
    await expect(page.getByRole('heading', { name: 'SEMANA DE 26/10' })).toBeVisible();
    await expect(page.getByText('Sem montagem', { exact: true })).toBeVisible();

    const biologia = page.getByRole('listitem', { name: 'Gravação aula Biologia' });
    await expect(biologia).toContainText('certeza alta');
    await expect(biologia).toContainText('Equipe estimada: 1 Câmera, 1 Técnico de aula');
    const visita = page.getByRole('listitem', { name: 'Visita técnica' });
    await expect(visita).toContainText('certeza baixa');
    await expect(visita).toContainText('a definir');
    await expect(page.getByRole('list', { name: 'Horas por função' })).toContainText('Câmera');

    await visita.getByRole('button', { name: 'Trocar o tipo de Visita técnica' }).click();
    await visita.getByLabel('Tipo de serviço de Visita técnica').selectOption({ label: 'Evento externo' });
    await expect(visita).toContainText('Equipe estimada: 2 Câmera, 1 Áudio, 1 Produção');
    await expect(visita).toContainText('certeza alta');

    await visita.getByRole('link', { name: 'Visita técnica' }).click();
    await expect(page).toHaveURL(new RegExp(`#/evento/${EVENT.B5}$`));
    await page.getByLabel(/^Observações/).fill('Levar o drone e baterias extras');
    await page.getByRole('button', { name: 'Salvar dados extras' }).click();
    await expect(page.getByText('Dados extras salvos.')).toBeVisible();
    await page.getByRole('link', { name: 'Ver a semana' }).click();

    await page.getByRole('button', { name: 'Montar semana' }).click();
    await expect(page.getByText('Em montagem', { exact: true })).toBeVisible();
    await expect(eventCard(page, 'Visita técnica').getByRole('listitem')).toHaveCount(4);

    const [week] = await db<{ state: string }>('select state from public.weeks where week_start = $1', [WEEK_B]);
    expect(week?.state).toBe('building');
    const [b5] = await db<{ notes: string; service_type_id: string }>('select notes, service_type_id from public.events where id = $1', [EVENT.B5]);
    expect(b5).toEqual({ notes: 'Levar o drone e baterias extras', service_type_id: serviceType(2) });
  });

  test('E2E-013 a agenda muda o local de um evento; "Reler agora" mostra antes e depois e P1 marca "revisado"', async ({ page }, info) => {
    test.skip(isMobile(info), 'o worker roda uma vez por rodada');
    // A agenda já mudou quando o worker sobe: qualquer leitura (a do agendador ou a do botão) vê a mudança.
    const list = fixture<{ items: { id: string; location?: string }[] }>('google/week-b.json');
    const moved = { ...list, items: list.items.map((e) => (e.id === 'g-e1' ? { ...e, location: 'Estúdio 3' } : e)) };
    worker = await startWorker({ configure: ({ google }) => google.list(CALENDARS.pecegeworks, { body: moved }) });

    await openAs(page, '/painel');
    await page.getByRole('button', { name: 'Reler agora' }).click();
    const item = page.getByRole('link', { name: 'Gravação aula Matemática (22/10): mudou na agenda' });
    await expect(item).toBeVisible({ timeout: 20_000 });
    await item.click();

    const table = page.getByRole('table', { name: 'Antes e depois' });
    await expect(table.getByRole('row', { name: /Local/ })).toContainText('Estúdio 1');
    await expect(table.getByRole('row', { name: /Local/ })).toContainText('Estúdio 3');
    await page.getByRole('button', { name: 'Marcar como revisado' }).click();
    await expect(page.getByRole('region', { name: 'Mudança da agenda' })).toHaveCount(0);
    await expect.poll(async () => (await db<{ r: boolean }>('select review_pending as r from public.events where id = $1', [EVENT.E1]))[0]?.r).toBe(false);

    await page.goto('#/painel');
    await expect(page.getByRole('list', { name: 'Pendências' })).not.toContainText('Gravação aula Matemática');
    expect(worker.google.nonGet).toHaveLength(0);
  });

  test('E2E-014 "Propor escala" com o Gemini simulado, aceitar todas de um evento e trocar uma pessoa', async ({ page }, info) => {
    test.skip(isMobile(info), 'o worker roda uma vez por rodada');
    await db("select public.build_week_internal($1::date)", [WEEK_B]);
    await db("select public.set_secret('ai_key', $1)", [AI_KEY]);
    await db("update public.settings set ai_key_hint = '...a1b2'");
    worker = await startWorker();

    await openAs(page, `/semana/${WEEK_B}`);
    await page.getByRole('button', { name: 'Propor escala' }).click();
    const biologia = eventCard(page, 'Gravação aula Biologia');
    await expect(biologia.getByText('proposta', { exact: true }).first()).toBeVisible({ timeout: 30_000 });
    await expect(biologia).toContainText('primeiro apto da lista');
    expect(worker.gemini.requests.length).toBeGreaterThan(0);
    // Nada vira alocação confirmada sem o administrador.
    expect(await db("select 1 from public.assignments a join public.events e on e.id = a.event_id where e.week_start = $1 and a.status = 'confirmed'", [WEEK_B])).toHaveLength(0);

    await biologia.getByRole('button', { name: 'Aceitar todas do evento' }).click();
    await expect(biologia.getByText('proposta', { exact: true })).toHaveCount(0);
    await expect
      .poll(async () => (await db<{ n: string }>("select count(*) as n from public.assignments where event_id = $1 and status = 'confirmed'", [EVENT.B1]))[0]?.n)
      .toBe('2');

    const quimica = eventCard(page, 'Gravação aula Química');
    const proposed = quimica.getByRole('listitem').filter({ hasText: 'proposta' }).first();
    const label = (await proposed.getAttribute('aria-label')) ?? '';
    await proposed.getByRole('button', { name: 'Trocar pessoa' }).click();
    const apt = page.getByRole('list', { name: 'Aptos' });
    const first = apt.getByRole('button').first();
    const chosen = (await first.getAttribute('aria-label')) ?? '';
    await expect(first).toContainText(/\d+ h e \d+ atividades? na semana/);
    await first.click();
    const role = label.split(': ')[0];
    await expect(quimica.getByRole('listitem', { name: `${role}: ${chosen}` })).toBeVisible();
    await expect
      .poll(async () => (await db<{ name: string; status: string }>("select p.name, a.status from public.assignments a join public.people p on p.id = a.person_id where a.event_id = $1 and a.status = 'confirmed'", [EVENT.B2])).map((r) => r.name))
      .toContain(chosen);
  });

  test('E2E-015 P1 escala P5 em horário sobreposto, confirma "Escalar mesmo assim" e a alocação fica com o selo', async ({ page }, info) => {
    test.skip(isMobile(info), 'cenário de desktop');
    const plantao = '20000000-0000-4000-8000-000000000099';
    await db(
      `insert into public.events (id, origin, title, location, starts_at, ends_at, service_type_id, type_certainty, type_source)
       values ($1, 'internal', 'Plantão de câmera', 'Estúdio 2', '2026-10-22T15:00:00-03:00', '2026-10-22T16:00:00-03:00', $2, 'alta', 'admin')`,
      [plantao, serviceType(1)],
    );
    await db('select public.create_event_slots($1)', [plantao]);

    await openAs(page, `/semana/${WEEK_A}`);
    const card = eventCard(page, 'Plantão de câmera');
    await card.getByRole('listitem', { name: 'Câmera: Vaga aberta' }).getByRole('button', { name: 'Escalar' }).click();
    const p5 = page.getByRole('list', { name: 'Outras pessoas' }).getByRole('button', { name: 'Pessoa Exemplo 05' });
    await expect(p5).toContainText('horário sobreposto');
    await p5.click();
    await expect(page.getByRole('alert').filter({ hasText: 'Pessoa Exemplo 05: horário sobreposto' })).toBeVisible();
    await page.getByRole('button', { name: 'Escalar mesmo assim' }).click();

    const line = card.getByRole('listitem', { name: 'Câmera: Pessoa Exemplo 05' });
    await expect(line).toContainText('horário sobreposto');
    await expect
      .poll(async () => (await db<{ person_id: string; override: boolean; warnings: string[] }>('select a.person_id, a.override, a.warnings from public.assignments a join public.slots s on s.id = a.slot_id where s.event_id = $1 and s.job_role_id = $2', [plantao, 'b0000000-0000-4000-8000-000000000001']))[0])
      .toEqual({ person_id: person(5), override: true, warnings: ['overlap'] });
    await expect(line).not.toContainText('a enviar');
  });

  test('E2E-019 P1 faz duas edições e clica "Descartar alterações"; a semana volta ao publicado e o destaque some', async ({ page }, info) => {
    test.skip(isMobile(info), 'cenário de desktop');
    await openAs(page, `/semana/${WEEK_A}`);
    const e1 = eventCard(page, 'Gravação aula Matemática');
    await e1.getByRole('listitem', { name: 'Câmera: Pessoa Exemplo 05' }).getByRole('button', { name: 'Desfazer' }).click();
    await expect(e1.getByRole('listitem', { name: 'Câmera: Vaga aberta' })).toBeVisible();

    const e2 = eventCard(page, 'Congresso de Agronegócio');
    await e2.getByRole('listitem', { name: 'Áudio: Pessoa Exemplo 10' }).getByRole('button', { name: 'Trocar pessoa' }).click();
    await page.getByRole('list', { name: 'Aptos' }).getByRole('button', { name: 'Pessoa Exemplo 09' }).click();
    await expect(e2.getByRole('listitem', { name: 'Áudio: Pessoa Exemplo 09' })).toBeVisible();

    const banner = page.getByRole('region', { name: 'Alterações não publicadas' });
    await expect(banner).toContainText('2 alterações não publicadas');
    await expect.poll(async () => (await slotPerson(SLOT.E2_R2))?.person_id).toBe(person(9));
    await banner.getByRole('button', { name: 'Descartar alterações' }).click();
    await page.getByRole('dialog', { name: 'Descartar alterações' }).getByRole('button', { name: 'Descartar alterações' }).click();

    await expect(banner).toHaveCount(0);
    await expect(e1.getByRole('listitem', { name: 'Câmera: Pessoa Exemplo 05' })).toBeVisible();
    await expect(e2.getByRole('listitem', { name: 'Áudio: Pessoa Exemplo 10' })).toBeVisible();
    expect(await slotPerson(SLOT.E1_R1)).toEqual({ person_id: person(5), status: 'confirmed' });
    expect(await slotPerson(SLOT.E2_R2)).toEqual({ person_id: person(10), status: 'confirmed' });
    // A equipe nunca viu o rascunho: a fotografia corrente segue na revisão 2.
    expect(await db('select revision from public.weeks where week_start = $1', [WEEK_A])).toEqual([{ revision: 2 }]);
  });

  test('E2E-025 troca sem internet com "a enviar", reconexão e conflito com P2 resolvido pela versão de P1', async ({ page, browser }, info) => {
    test.skip(isMobile(info), 'cenário de desktop');
    await openAs(page, `/semana/${WEEK_A}`);
    const context = page.context();
    const e2 = eventCard(page, 'Congresso de Agronegócio');
    await expect(e2.getByRole('listitem', { name: 'Câmera: Pessoa Exemplo 07' })).toBeVisible();

    // Primeira troca: sem internet fica "a enviar"; ao reconectar, vai e o selo some.
    await context.setOffline(true);
    await e2.getByRole('listitem', { name: 'Câmera: Pessoa Exemplo 07' }).getByRole('button', { name: 'Trocar pessoa' }).click();
    await page.getByRole('list', { name: 'Aptos' }).getByRole('button', { name: 'Pessoa Exemplo 03' }).click();
    const swapped = e2.getByRole('listitem', { name: 'Câmera: Pessoa Exemplo 03' });
    await expect(swapped).toContainText('a enviar');
    await context.setOffline(false);
    await expect(swapped).not.toContainText('a enviar', { timeout: 15_000 });
    await expect.poll(async () => (await slotPerson(SLOT.E2_R1a))?.person_id).toBe(person(3));

    // Segunda troca: P1 sem internet e P2 muda a mesma vaga; ao reconectar, P1 vê o conflito e fica com a sua.
    await context.setOffline(true);
    const e1 = eventCard(page, 'Gravação aula Matemática');
    await e1.getByRole('listitem', { name: 'Câmera: Pessoa Exemplo 05' }).getByRole('button', { name: 'Trocar pessoa' }).click();
    await page.getByRole('list', { name: 'Aptos' }).getByRole('button', { name: 'Pessoa Exemplo 04' }).click();
    await expect(e1.getByRole('listitem', { name: 'Câmera: Pessoa Exemplo 04' })).toContainText('a enviar');

    const other = await browser.newContext({ baseURL: info.project.use.baseURL, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', viewport: { width: 1440, height: 900 } });
    const p2 = await other.newPage();
    await openAs(p2, `/semana/${WEEK_A}`, 2);
    const p2e1 = eventCard(p2, 'Gravação aula Matemática');
    await p2e1.getByRole('listitem', { name: 'Câmera: Pessoa Exemplo 05' }).getByRole('button', { name: 'Trocar pessoa' }).click();
    await p2.getByRole('list', { name: 'Aptos' }).getByRole('button', { name: 'Pessoa Exemplo 08' }).click();
    await expect.poll(async () => (await slotPerson(SLOT.E1_R1))?.person_id).toBe(person(8));
    await other.close();

    await context.setOffline(false);
    const conflict = page.getByRole('dialog', { name: 'Conflito de edição' });
    await expect(conflict).toBeVisible({ timeout: 15_000 });
    await expect(conflict.getByLabel('Minha versão')).toContainText('Pessoa Exemplo 04');
    await expect(conflict.getByLabel('Versão do servidor')).toContainText('Pessoa Exemplo 08');
    await conflict.getByRole('button', { name: 'Ficar com a minha versão' }).click();
    await expect(conflict).toHaveCount(0);
    await expect.poll(async () => (await slotPerson(SLOT.E1_R1))?.person_id, { timeout: 15_000 }).toBe(person(4));
    await expect(e1.getByRole('listitem', { name: 'Câmera: Pessoa Exemplo 04' })).not.toContainText('a enviar');
  });
});
