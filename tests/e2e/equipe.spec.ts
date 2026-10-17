/// <reference lib="dom" />
// Lado de quem é escalado, de ponta a ponta: "Minha semana", "Equipe", avisos com Realtime, notificação pelo
// service worker, agenda pessoal iCal, app instalável sem internet e o tema Noite. O relógio do navegador não
// é falsificado (o Auth confere o vencimento da sessão pela hora real): as semanas da semente vêm pela rota.
import { readFileSync } from 'node:fs';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { fixture } from '../../apps/worker/src/test/mocks.ts';
import { resetDatabase } from '../integration/helpers/db.ts';
import { EVENT, person, type as serviceType } from '../integration/helpers/ids.ts';
import { e2eEnv } from './env.ts';
import { email, isMobile, login } from './helpers';
import { assign, db, openAs, publishAsP1 } from './team.ts';
import { CALENDARS, startWorker, type RunningWorker } from './worker.ts';

const WEEK_A = '2026-10-19';
const WEEK_B = '2026-10-26';
const ORIGIN = 'http://127.0.0.1:4173';
const NOITE = 'rgb(7, 0, 16)';
// Aviso em tempo real; se o Realtime descartar a mensagem, a leitura de segurança do app (30 s) traz o aviso.
const LIVE = { timeout: 45_000 };
const VERSION = (JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as { version: string }).version;

/** Outro aparelho (contexto novo), no tamanho de desktop, para o administrador. */
async function adminPage(page: Page, info: TestInfo): Promise<{ admin: Page; close: () => Promise<void> }> {
  const context = await page.context().browser()!.newContext({ baseURL: info.project.use.baseURL, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', viewport: { width: 1440, height: 900 } });
  return { admin: await context.newPage(), close: () => context.close() };
}

const bell = (page: Page) => page.getByRole('button', { name: /^Avisos/ });
const activity = (page: Page, title: string) => page.getByRole('article', { name: title });

async function expectNoite(page: Page) {
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'noite');
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(NOITE);
}

test.describe('equipe, avisos e app instalável', () => {
  let worker: RunningWorker | null = null;
  test.beforeEach(async () => {
    await resetDatabase(e2eEnv().dbUrl);
  });
  test.afterEach(async () => {
    await worker?.stop();
    worker = null;
  });

  test('E2E-001 P10 entra com e-mail e senha e vê "Minha semana" da semana A', async ({ page }) => {
    await openAs(page, `/minha-semana/${WEEK_A}`, 10);
    await expect(page.getByRole('heading', { name: 'MINHA SEMANA 19/10' })).toBeVisible();
    const congresso = activity(page, 'Congresso de Agronegócio');
    await expect(congresso).toBeVisible();
    await expect(congresso).toContainText('08:00 às 12:00');
    await expect(congresso).toContainText('Áudio');
    await expect(congresso).toContainText('Credenciamento às 7h30');
    await expect(congresso.getByRole('list', { name: 'Colegas' })).toContainText('Pessoa Exemplo 07');
    // A Reunião de pauta não exige equipe e a Matemática não é de P10.
    await expect(page.getByRole('article')).toHaveCount(1);
  });

  test('E2E-008 P1 cria "Drone", o tipo "Aéreo" e as férias de P10 em 22/10; P10 vê "férias" em 22/10', async ({ page }, info) => {
    test.skip(isMobile(info), 'cadastros no desktop; a visão da equipe é coberta no celular por E2E-001');
    await openAs(page, '/admin/funcoes', 1);
    await page.getByLabel('Nova função').fill('Drone');
    await page.getByRole('button', { name: 'Adicionar' }).click();
    await expect(page.getByRole('list', { name: 'Funções' })).toContainText('Drone');

    await page.goto('#/admin/tipos');
    await page.getByRole('button', { name: /Novo tipo/ }).click();
    const typeForm = page.getByRole('form', { name: 'Tipo de serviço' });
    await typeForm.getByLabel(/^Nome/).fill('Aéreo');
    const crewRole = typeForm.getByLabel('Função').first();
    if ((await crewRole.count()) === 0) await typeForm.getByRole('button', { name: /Adicionar função/ }).click();
    await typeForm.getByLabel('Função').first().selectOption({ label: 'Drone' });
    await typeForm.getByLabel('Quantidade').first().fill('1');
    await typeForm.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByRole('button', { name: 'Abrir Aéreo' })).toBeVisible();

    await page.goto(`#/admin/ausencias?pessoa=${person(10)}`);
    await page.getByRole('button', { name: 'Nova ausência' }).click();
    const absence = page.getByRole('form', { name: 'Ausência' });
    await absence.getByLabel('Tipo').selectOption({ label: 'Férias' });
    await absence.getByLabel(/^Início/).fill('2026-10-22');
    await absence.getByLabel(/^Último dia/).fill('2026-10-22');
    await absence.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByRole('list', { name: 'Ausências registradas' })).toContainText('férias: 22/10/2026');
    await expect.poll(async () => (await db("select count(*)::int as n from public.absences where person_id = $1 and kind = 'ferias'", [person(10)]))[0]?.n).toBe(1);
    const [types] = await db<{ n: number }>(
      "select count(*)::int as n from public.service_types t join public.service_type_crew c on c.service_type_id = t.id join public.job_roles r on r.id = c.job_role_id where t.name = 'Aéreo' and r.name = 'Drone' and c.quantity = 1",
    );
    expect(types?.n).toBe(1);

    const p10 = await page.context().browser()!.newContext({ baseURL: info.project.use.baseURL, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
    const team = await p10.newPage();
    await openAs(team, `/minha-semana/${WEEK_A}`, 10);
    const thursday = team.getByRole('listitem', { name: 'quinta, 22/10' });
    await expect(thursday.getByText('férias', { exact: true })).toBeVisible();
    await p10.close();
  });

  test('E2E-017 P1 publica a semana B; P10 vê o sino com 1 aviso, toca e abre a atividade com observações e colegas', async ({ page }, info) => {
    await db('update public.notifications set read_at = now()');
    await db('select public.build_week_internal($1::date)', [WEEK_B]);
    await assign(EVENT.B1, 1, 3);
    await assign(EVENT.B1, 5, 10);
    await db("update public.events set notes = 'Levar o tripé grande' where id = $1", [EVENT.B1]);

    await openAs(page, `/minha-semana/${WEEK_B}`, 10);
    await expect(page.getByText('A escala desta semana ainda não foi publicada.')).toBeVisible();
    await expect(bell(page)).toHaveAccessibleName('Avisos');

    const { admin, close } = await adminPage(page, info);
    await openAs(admin, `/semana/${WEEK_B}`, 1);
    await admin.getByRole('button', { name: 'Publicar', exact: true }).click();
    const dialog = admin.getByRole('dialog', { name: 'Publicar a semana' });
    await dialog.getByRole('button', { name: 'Publicar', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await close();

    // Realtime: o aviso chega sem recarregar.
    await expect(bell(page)).toHaveAccessibleName('Avisos, 1 não lido', LIVE);
    await bell(page).click();
    await page.getByRole('dialog', { name: 'Avisos' }).getByRole('button', { name: /Sua semana de 26\/10 foi publicada/ }).click();
    await expect(page).toHaveURL(/#\/minha-semana\/2026-10-26$/);
    const biologia = activity(page, 'Gravação aula Biologia');
    await expect(biologia).toContainText('Levar o tripé grande');
    await expect(biologia.getByRole('list', { name: 'Colegas' })).toContainText('Pessoa Exemplo 03 (Câmera)');
    await expect(bell(page)).toHaveAccessibleName('Avisos');
    await expect.poll(async () => (await db<{ n: number }>('select count(*)::int as n from public.notifications where person_id = $1 and read_at is null', [person(10)]))[0]?.n).toBe(0);
  });

  test('E2E-018 P1 troca P10 por P11; P10 ainda vê a versão antiga; "Publicar alterações" avisa P10 e P11 uma vez cada', async ({ page }, info) => {
    test.skip(isMobile(info), 'o administrador troca no desktop');
    const { admin, close } = await adminPage(page, info);
    await openAs(admin, `/semana/${WEEK_A}`, 1);
    const e2 = admin.getByRole('article', { name: 'Congresso de Agronegócio' });
    await e2.getByRole('listitem', { name: 'Áudio: Pessoa Exemplo 10' }).getByRole('button', { name: 'Trocar pessoa' }).click();
    await admin.getByRole('list', { name: 'Aptos' }).getByRole('button', { name: 'Pessoa Exemplo 11' }).click();
    const banner = admin.getByRole('region', { name: 'Alterações não publicadas' });
    await expect(banner).toContainText('1 alteração não publicada');

    // A equipe não vê o rascunho.
    await openAs(page, `/minha-semana/${WEEK_A}`, 10);
    await expect(activity(page, 'Congresso de Agronegócio')).toBeVisible();

    const before = await db<{ person_id: string; n: number }>('select person_id, count(*)::int as n from public.notifications where person_id = any($1) group by person_id', [[person(10), person(11)]]);
    await banner.getByRole('button', { name: 'Publicar alterações' }).click();
    await admin.getByRole('dialog', { name: 'Publicar alterações' }).getByRole('button', { name: 'Publicar alterações' }).click();
    await expect(banner).toHaveCount(0);
    await close();

    await expect
      .poll(async () => (await db<{ person_id: string; n: number }>("select person_id, count(*)::int as n from public.notifications where person_id = any($1) and dedupe_key like 'publish:%:3' group by person_id order by person_id", [[person(10), person(11)]])))
      .toEqual([
        { person_id: person(10), n: 1 },
        { person_id: person(11), n: 1 },
      ]);
    expect(before.map((b) => b.n)).toEqual([1, 1]);
    // P10 recebe o aviso na hora e a atividade sai da semana dele.
    await expect(bell(page)).toHaveAccessibleName('Avisos, 2 não lidos', LIVE);
    await expect(activity(page, 'Congresso de Agronegócio')).toHaveCount(0);
    await expect(page.getByText('Você não está escalado nesta semana.')).toBeVisible();
  });

  test('E2E-020 P10 abre "Equipe", filtra por setor Técnica e depois por P11 e vê só as atividades correspondentes', async ({ page }) => {
    await openAs(page, `/equipe/${WEEK_A}`, 10);
    const list = page.getByRole('list', { name: 'Atividades da equipe' });
    await expect(list.getByLabel('Gravação aula Matemática', { exact: true })).toBeVisible();
    await expect(list.getByLabel('Congresso de Agronegócio', { exact: true })).toBeVisible();
    await expect(list).not.toContainText('Reunião de pauta');

    const filters = page.getByRole('search', { name: 'Filtros' });
    await filters.getByLabel('Setor').selectOption({ label: 'Técnica' });
    await expect(list.getByLabel('Congresso de Agronegócio: Áudio: Pessoa Exemplo 10')).toBeVisible();
    await expect(list.getByLabel('Gravação aula Matemática', { exact: true })).toBeVisible();

    // P11 saiu do Congresso na revisão 2: nada para ele nesta semana.
    await filters.getByLabel('Pessoa').selectOption({ label: 'Pessoa Exemplo 11' });
    await expect(page.getByText('Nenhuma atividade com este filtro')).toBeVisible();
    await page.getByRole('button', { name: 'Limpar filtros' }).click();
    await filters.getByLabel('Pessoa').selectOption({ label: 'Pessoa Exemplo 05' });
    await expect(list.getByLabel('Gravação aula Matemática', { exact: true })).toBeVisible();
    await expect(list.getByLabel('Congresso de Agronegócio', { exact: true })).toHaveCount(0);
  });

  test('E2E-021 o manifesto tem display standalone, theme_color #070010 e os ícones 192 e 512 do produto; o service worker fica ativo', async ({ page }) => {
    await page.goto('#/entrar');
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', /manifest\.webmanifest$/);
    const manifest = (await (await page.request.get('manifest.webmanifest')).json()) as {
      display: string;
      theme_color: string;
      background_color: string;
      icons: { src: string; sizes: string; purpose?: string }[];
    };
    expect(manifest).toMatchObject({ display: 'standalone', theme_color: '#070010', background_color: '#070010' });
    const sizes = manifest.icons.map((i) => i.sizes);
    expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']));
    expect(manifest.icons.some((i) => i.purpose === 'maskable')).toBe(true);
    // Os ícones servidos são os do produto, gerados do icon.svg (nunca o ícone da Chiaro).
    for (const icon of manifest.icons) {
      const served = await (await page.request.get(icon.src)).body();
      expect(served.equals(readFileSync(new URL(`../../apps/web/public/${icon.src}`, import.meta.url)))).toBe(true);
    }
    await page.waitForFunction(async () => (await navigator.serviceWorker.ready).active?.state === 'activated');
    // O nome do cache leva a versão do produto.
    expect(await page.evaluate(async (v) => (await caches.keys()).some((k) => k.endsWith(`v${v}`)), VERSION)).toBe(true);
  });

  test('E2E-023 P10 ativa a agenda pessoal, copia o link, o feed traz as atividades de P10; o link novo derruba o antigo', async ({ page, context }, info) => {
    test.skip(isMobile(info), 'o worker roda uma vez por rodada');
    worker = await startWorker();
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: ORIGIN });
    await openAs(page, '/agenda-pessoal', 10);
    await expect(page.getByRole('note')).toContainText('até cerca de 12 horas');
    await page.getByRole('switch', { name: /Minha agenda no meu calendário/ }).click();
    const link = page.getByLabel('Link da sua agenda');
    await expect(link).toHaveValue(/\/storage\/v1\/object\/public\/ical\/[0-9a-f]+\.ics$/);
    const first = await link.inputValue();
    await page.getByRole('button', { name: 'Copiar link' }).click();
    await expect(page.getByText('Link copiado.')).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(first);

    // O Storage responde "não encontrado" com 400 e statusCode 404 no corpo.
    const feed = async (url: string) => {
      const res = await fetch(url);
      const body = await res.text();
      const missing = res.status === 404 || /"statusCode":"404"|not_found|Object not found/i.test(body);
      return { status: res.ok ? 200 : missing ? 404 : res.status, body };
    };
    await expect.poll(async () => (await feed(first)).status, { timeout: 20_000 }).toBe(200);
    const body = (await feed(first)).body;
    expect(body).toContain('BEGIN:VCALENDAR');
    expect(body).toContain('Congresso de Agronegócio');
    expect(body).not.toContain('Gravação aula Matemática');

    await page.getByRole('button', { name: 'Gerar link novo' }).click();
    await page.getByRole('dialog', { name: 'Gerar link novo' }).getByRole('button', { name: 'Gerar link novo' }).click();
    await expect(link).not.toHaveValue(first);
    const second = await link.inputValue();
    await expect.poll(async () => (await feed(second)).status, { timeout: 20_000 }).toBe(200);
    await expect.poll(async () => (await feed(first)).status, { timeout: 20_000 }).toBe(404);
  });

  test('E2E-024 P10 abre "Minha semana" com rede, fica sem internet e recarrega; a semana aparece com a faixa', async ({ page, context }) => {
    await openAs(page, `/minha-semana/${WEEK_A}`, 10);
    await expect(activity(page, 'Congresso de Agronegócio')).toBeVisible();
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
    // A primeira leitura completa termina antes de sair da rede (a cópia local fica com a hora dela).
    await expect
      .poll(() =>
        page.evaluate(
          (name) =>
            new Promise<boolean>((resolve) => {
              const req = indexedDB.open(name);
              req.onerror = () => resolve(false);
              req.onsuccess = () => {
                const get = req.result.transaction('meta', 'readonly').objectStore('meta').get('lastSyncAt');
                get.onsuccess = () => {
                  resolve(Boolean(get.result?.value));
                  req.result.close();
                };
                get.onerror = () => resolve(false);
              };
            }),
          `cronograma-${person(10)}`,
        ),
      )
      .toBe(true);

    await context.setOffline(true);
    await page.reload();
    await expect(activity(page, 'Congresso de Agronegócio')).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'Sem internet' })).toHaveText(/^Sem internet, atualizado em \d{2}\/\d{2} \d{2}:\d{2}$/);
    await expectNoite(page);
    await context.setOffline(false);
  });

  test('E2E-027 atividade interna "Plantão de edição" na semana B, com P10, aparece para P10 com o selo "interna"', async ({ page }) => {
    const plantao = '20000000-0000-4000-8000-000000000098';
    await db('select public.build_week_internal($1::date)', [WEEK_B]);
    await db(
      `insert into public.events (id, origin, title, location, starts_at, ends_at, service_type_id, type_certainty, type_source)
       values ($1, 'internal', 'Plantão de edição', 'Ilha 2', '2026-10-28T14:00:00-03:00', '2026-10-28T18:00:00-03:00', $2, 'alta', 'admin')`,
      [plantao, serviceType(2)],
    );
    await db('select public.create_event_slots($1)', [plantao]);
    await assign(plantao, 2, 10);
    await publishAsP1(WEEK_B);

    await openAs(page, `/minha-semana/${WEEK_B}`, 10);
    const card = activity(page, 'Plantão de edição');
    await expect(card).toBeVisible();
    await expect(card.getByText('interna', { exact: true })).toBeVisible();
    await expect(card).toContainText('Ilha 2');
  });

  test('E2E-029 o Google apaga um evento publicado de P10; após a releitura, P10 vê a atividade riscada e o aviso a abre', async ({ page }, info) => {
    test.skip(isMobile(info), 'o worker roda uma vez por rodada');
    await db('update public.notifications set read_at = now()');
    const list = fixture<{ items: { id: string }[] }>('google/week-b-s2.json');
    worker = await startWorker({ configure: ({ google }) => google.list(CALENDARS.audiovisual, { body: { ...list, items: list.items.filter((e) => e.id !== 'g-e2') } }) });

    await openAs(page, `/minha-semana/${WEEK_A}`, 10);
    await expect(bell(page)).toHaveAccessibleName('Avisos, 1 não lido', LIVE);
    const congresso = activity(page, 'Congresso de Agronegócio');
    await expect(congresso.getByText('cancelado', { exact: true })).toBeVisible();
    await expect(congresso.getByRole('heading')).toHaveClass(/is-cancelled/);

    await bell(page).click();
    await page.getByRole('dialog', { name: 'Avisos' }).getByRole('button', { name: /Cancelado: Congresso de Agronegócio/ }).click();
    await expect(page).toHaveURL(new RegExp(`#/evento/${EVENT.E2}$`));
    await expect(page.getByRole('region', { name: 'Dados da agenda' }).locator('.is-cancelled')).toHaveText('Congresso de Agronegócio');
    await expect(page.getByText('cancelado', { exact: true }).first()).toBeVisible();
  });

  test('E2E-030 login, painel, "Minha semana", "Equipe" e um diálogo aberto no tema Noite', async ({ page }, info) => {
    await page.goto('#/entrar');
    await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();
    await expectNoite(page);

    await login(page, email(1));
    await expect(page).toHaveURL(/#\/painel$/);
    await expectNoite(page);

    await page.goto(`#/minha-semana/${WEEK_A}`);
    await expect(page.getByRole('heading', { name: 'MINHA SEMANA 19/10' })).toBeVisible();
    await expectNoite(page);

    await page.goto(`#/equipe/${WEEK_A}`);
    await expect(page.getByRole('heading', { name: 'EQUIPE 19/10' })).toBeVisible();
    await expectNoite(page);

    await bell(page).click();
    const dialog = page.getByRole('dialog', { name: 'Avisos' });
    await expect(dialog).toBeVisible();
    await expectNoite(page);
    const surface = await dialog.evaluate((el) => getComputedStyle(el).backgroundColor);
    const [r, g, b] = (surface.match(/\d+/g) ?? []).map(Number);
    expect(Math.max(r ?? 255, g ?? 255, b ?? 255)).toBeLessThan(80);
    expect(info.project.name).toBeTruthy();
  });
});
