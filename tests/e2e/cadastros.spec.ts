/// <reference lib="dom" />
import { expect, test } from '@playwright/test';
import { resetDatabase, withDb } from '../integration/helpers/db.ts';
import { e2eEnv } from './env.ts';
import { email, latestLink, login, logout } from './helpers';
import { startWorker, type RunningWorker } from './worker.ts';

// Cada teste começa da semente: os dois projetos (celular e desktop) desativam e cadastram as mesmas pessoas.
test.beforeEach(async () => {
  await resetDatabase(e2eEnv().dbUrl);
});

test.describe('cadastros', () => {
  let worker: RunningWorker | null = null;
  test.afterEach(async () => {
    await worker?.stop();
    worker = null;
  });

  test('E2E-006 P1 cadastra "Ana Teste" com R1; o e-mail chega; Ana cria a senha e entra em "Minha semana"', async ({ page }, info) => {
    worker = await startWorker();
    const address = `ana.teste.${info.project.name}@exemplo.test`;
    const since = new Date();

    await page.goto('#/admin/pessoas');
    await login(page, email(1));
    await expect(page.getByRole('heading', { name: 'PESSOAS' })).toBeVisible();
    await page.getByRole('button', { name: /Nova pessoa/ }).click();
    const form = page.getByRole('form', { name: 'Cadastro de pessoa' });
    await form.getByLabel(/^Nome/).fill('Ana Teste');
    await form.getByLabel(/^E-mail/).fill(address);
    await form.getByText('Câmera', { exact: true }).click();
    await form.getByRole('button', { name: 'Salvar' }).click();
    await expect(form).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Abrir Ana Teste' })).toBeVisible();

    const link = await latestLink(address, since);
    await logout(page, info);
    await page.goto(link);
    await expect(page).toHaveURL(/#\/criar-senha$/);
    await page.getByLabel(/^Senha nova/).fill('Senha-da-Ana-123');
    await page.getByLabel(/^Repita a senha/).fill('Senha-da-Ana-123');
    await page.getByRole('button', { name: 'Salvar senha' }).click();
    await expect(page).toHaveURL(/#\/minha-semana$/);
    await expect(page.getByRole('heading', { name: 'MINHA SEMANA' })).toBeVisible();

    const row = await withDb(e2eEnv().dbUrl, (c) =>
      c.query<{ code: string; weekly_limit_hours: string; roles: string }>(
        `select p.code, p.weekly_limit_hours::text, string_agg(r.code, ',') as roles from public.people p
         join public.person_roles pr on pr.person_id = p.id and pr.archived_at is null
         join public.job_roles r on r.id = pr.job_role_id where p.email = $1 group by p.code, p.weekly_limit_hours`,
        [address],
      ),
    );
    expect(row.rows[0]).toMatchObject({ weekly_limit_hours: '44', roles: 'R1' });
  });

  test('E2E-007 P1 desativa P5, que tem alocações futuras; a lista aparece, P1 confirma; P5 vê "Acesso desativado"', async ({ page }, info) => {
    await page.goto('#/admin/pessoas');
    await login(page, email(1));
    await page.getByLabel(/^Buscar/).fill('Exemplo 05');
    await page.getByRole('button', { name: 'Abrir Pessoa Exemplo 05' }).click();
    await page.getByRole('form', { name: 'Cadastro de Pessoa Exemplo 05' }).getByRole('button', { name: 'Desativar' }).click();

    const dialog = page.getByRole('dialog', { name: 'Desativar Pessoa Exemplo 05' });
    const list = dialog.getByRole('list', { name: 'Alocações futuras' });
    await expect(list.getByRole('listitem')).toHaveCount(1);
    await expect(list).toContainText('Gravação aula Matemática');
    await expect(list).toContainText('Câmera');
    await dialog.getByRole('button', { name: 'Desativar pessoa' }).click();

    const item = page.getByRole('button', { name: 'Abrir Pessoa Exemplo 05' });
    await expect(item).toContainText('inativa');
    await expect(item).not.toContainText('a enviar');
    const slot = await withDb(e2eEnv().dbUrl, (c) =>
      c.query<{ person_id: string | null }>("select person_id from public.assignments where slot_id = '30000000-0000-4000-8000-000000000011'"),
    );
    expect(slot.rows[0]?.person_id).toBeNull();

    await logout(page, info);
    await login(page, email(5));
    await expect(page.getByRole('alert')).toHaveText('Acesso desativado; fale com o Planejamento');
  });
});
