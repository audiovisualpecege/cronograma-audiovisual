/// <reference lib="dom" />
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { resetDatabase, withDb } from '../integration/helpers/db.ts';
import { e2eEnv } from './env.ts';
import { email, login } from './helpers';

const SHEET = fileURLToPath(new URL('../../fixtures/oficial-2026.xlsx', import.meta.url));

// A planilha de exemplo tem os nomes trocados: "João Pedro Exemplo" faz o papel do "Joao P." do _tests.md e é
// ligado à pessoa João Pedro Silva, criada aqui no cadastro.
test.beforeEach(async () => {
  const { dbUrl } = e2eEnv();
  await resetDatabase(dbUrl);
  await withDb(dbUrl, (c) =>
    c.query(
      `insert into public.people (id, name, email, sector_id, profile, invite_status)
       values ('d0000000-0000-4000-8000-000000000099', 'João Pedro Silva', 'joao.pedro@exemplo.test', 'a0000000-0000-4000-8000-000000000002', 'team', 'accepted');
       insert into public.person_roles (person_id, job_role_id) values ('d0000000-0000-4000-8000-000000000099', 'b0000000-0000-4000-8000-000000000001');`,
    ),
  );
});

async function openReview(page: Page) {
  await page.goto('#/importar');
  await login(page, email(1));
  await expect(page.getByRole('heading', { name: 'IMPORTAR HISTÓRICO' })).toBeVisible();
  // A cópia local termina de abrir antes do arquivo (a revisão liga os nomes ao cadastro).
  await page.goto('#/admin/pessoas');
  await expect(page.getByRole('button', { name: 'Abrir João Pedro Silva' })).toBeVisible();
  await page.goto('#/importar');
  await page.getByTestId('arquivo').setInputFiles(SHEET);
  await expect(page.getByText('Revisão de oficial-2026.xlsx')).toBeVisible();
}

const count = (sql: string) => withDb(e2eEnv().dbUrl, (c) => c.query<{ n: string }>(sql)).then((r) => Number(r.rows[0]?.n));

test('E2E-009 P1 importa a planilha, liga "João Pedro Exemplo" a João Pedro Silva, confirma, vê o resumo e "Padrões" mostra T1', async ({ page }) => {
  await openReview(page);
  await expect(page.getByText(/Semana de 05\/10\/2026 a 11\/10\/2026/)).toBeVisible();

  const joao = page.getByRole('group', { name: 'Ligação de João Pedro Exemplo' });
  await expect(joao.getByRole('radio', { name: 'João Pedro Silva (sugerido)' })).toBeChecked();
  // O Radio do design system esconde o <input> e desenha a bolinha no rótulo.
  for (const option of ['Escolher outra', 'Criar pessoa inativa', 'Ignorar']) {
    await expect(joao.getByRole('radio', { name: option })).not.toBeChecked();
    await expect(joao.getByText(option, { exact: true })).toBeVisible();
  }

  await page.getByLabel('Operador (12)').selectOption({ label: 'Câmera' });
  await expect(page.getByLabel('Mediador (4)')).toHaveValue('b0000000-0000-4000-8000-000000000004');
  await page.getByText('Ver eventos e tipos').click();
  await page.getByLabel('Tipo de GRAVAÇÃO: MBA em Gestão de Projetos').selectOption({ label: 'Gravação de aula' });
  await expect(page.getByRole('list', { name: 'Não importados' })).toContainText('data inválida');

  expect(await count('select count(*) as n from public.history_entries')).toBe(0);
  await page.getByRole('button', { name: 'Confirmar importação' }).click();
  await expect(page.getByText('Importação concluída')).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'entraram no histórico' })).toContainText('1 semanas, 9 eventos');

  expect(await count("select count(*) as n from public.history_entries where raw_name = 'João Pedro Exemplo' and person_id = 'd0000000-0000-4000-8000-000000000099'")).toBe(1);

  await page.getByRole('link', { name: 'Ver os padrões' }).click();
  const t1 = page.getByRole('article', { name: 'Gravação de aula' });
  await expect(t1).toContainText('1 evento');
  await expect(t1).toContainText('Equipe típica: 1 Câmera, 1 Mediação');
  await expect(t1).toContainText('pouco histórico');
});

test('E2E-010 P1 abre a revisão da importação e cancela; nenhuma semana nova no histórico', async ({ page }) => {
  await openReview(page);
  await page.getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.getByText('Importação cancelada. Nada foi gravado.')).toBeVisible();
  expect(await count('select count(*) as n from public.history_imports')).toBe(0);
  expect(await count('select count(*) as n from public.history_entries')).toBe(0);
});
