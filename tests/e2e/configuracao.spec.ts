/// <reference lib="dom" />
import { expect, test } from '@playwright/test';
import { resetDatabase, withDb } from '../integration/helpers/db.ts';
import { e2eEnv } from './env.ts';
import { email, login } from './helpers';
import { CALENDARS, startWorker, type RunningWorker } from './worker.ts';

const REFUSED = 'AIzaSy-chave-recusada-0000';
const ACCEPTED = 'AIzaSy-chave-aceita-a1b2';

test.describe('configuração', () => {
  let worker: RunningWorker | null = null;
  test.beforeEach(async () => {
    await resetDatabase(e2eEnv().dbUrl);
  });
  test.afterEach(async () => {
    await worker?.stop();
    worker = null;
  });

  test('E2E-011 P1 informa os IDs das duas agendas; ambas aparecem "conectadas" com a data da última leitura', async ({ page }) => {
    // Primeira configuração: nenhuma agenda ainda (os eventos da semente ficam sem origem).
    await withDb(e2eEnv().dbUrl, (c) =>
      c.query('update public.events set calendar_source_id = null; delete from public.calendar_sources'),
    );
    worker = await startWorker();

    await page.goto('#/admin/configuracao');
    await login(page, email(1));
    await expect(page.getByText('Nenhuma agenda conectada ainda.')).toBeVisible();

    const form = page.getByRole('form', { name: 'Adicionar agenda' });
    for (const [label, id] of [['pecegeworks', CALENDARS.pecegeworks], ['audiovisualpecege', CALENDARS.audiovisual]]) {
      await form.getByLabel(/^ID da agenda/).fill(id as string);
      await form.getByLabel(/^Rótulo/).fill(label as string);
      await form.getByRole('button', { name: 'Adicionar agenda' }).click();
      await expect(page.getByRole('listitem', { name: label })).toBeVisible();
    }
    // A segunda agenda pode ter entrado depois da leitura que a primeira pediu: "Reler agora" lê as duas.
    const reread = page.getByRole('button', { name: 'Reler agora' });
    await expect(reread).toBeEnabled({ timeout: 20_000 });
    await reread.click();

    for (const label of ['pecegeworks', 'audiovisualpecege']) {
      const item = page.getByRole('listitem', { name: label });
      await expect(item).toContainText('conectada', { timeout: 20_000 });
      await expect(item).toContainText(/Última leitura 21\/10 \d\d:\d\d/);
    }
    expect(worker.google.nonGet).toHaveLength(0);
  });

  test('E2E-016 chave recusada e aceita, e desligar a releitura esconde o intervalo', async ({ page }) => {
    worker = await startWorker({ refusedKeys: [REFUSED] });
    await page.goto('#/admin/configuracao');
    await login(page, email(1));
    await expect(page.getByRole('note')).toContainText('plano gratuito');

    const keyForm = page.getByRole('form', { name: 'Chave da IA' });
    await keyForm.getByLabel(/^Chave da API/).fill(REFUSED);
    await keyForm.getByRole('button', { name: 'Salvar e testar' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Chave recusada pelo fornecedor' })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Nenhuma chave aprovada ainda.', { exact: false })).toBeVisible();

    await keyForm.getByLabel(/^Chave da API/).fill(ACCEPTED);
    await keyForm.getByRole('button', { name: 'Salvar e testar' }).click();
    await expect(page.getByText('...a1b2')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Chave aceita: a IA respondeu.')).toBeVisible();
    expect(await page.content()).not.toContain(ACCEPTED);

    await expect(page.getByLabel(/^Intervalo da releitura/)).toBeVisible();
    await page.getByRole('switch', { name: 'Releitura automática das agendas' }).click();
    await expect(page.getByLabel(/^Intervalo da releitura/)).toHaveCount(0);
    await expect
      .poll(() => withDb(e2eEnv().dbUrl, (c) => c.query<{ on: boolean }>('select calendar_poll_enabled as on from public.settings')).then((r) => r.rows[0]?.on))
      .toBe(false);
  });
});
