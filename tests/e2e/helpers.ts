// Atalhos dos testes de ponta a ponta: entrar, sair (menu lateral no desktop, "Mais" no celular) e e-mail.
import { expect, type Page, type TestInfo } from '@playwright/test';
import { email, PASSWORD } from '../integration/helpers/ids.ts';
import { e2eEnv } from './env.ts';

export { email, PASSWORD };

export const isMobile = (info: TestInfo) => info.project.name === 'celular';

export async function login(page: Page, address: string, password = PASSWORD) {
  await page.getByLabel(/^E-mail/).fill(address);
  await page.getByLabel(/^Senha/).fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
}

export async function logout(page: Page, info: TestInfo) {
  if (isMobile(info)) {
    await page.getByRole('navigation', { name: 'Menu do celular' }).getByRole('button', { name: 'Mais' }).click();
    await page.getByRole('dialog', { name: 'Mais' }).getByRole('button', { name: 'Sair' }).click();
  } else {
    await page.getByRole('navigation', { name: 'Menu principal' }).getByRole('button', { name: 'Sair' }).click();
  }
  await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();
}

interface MailSummary {
  ID: string;
  Created: string;
}

/** Último e-mail para o endereço, chegado depois de `since`, com o link do corpo. */
export async function latestLink(to: string, since: Date): Promise<string> {
  const { mailUrl } = e2eEnv();
  let found: MailSummary | undefined;
  await expect
    .poll(
      async () => {
        const res = await fetch(`${mailUrl}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
        const body = (await res.json()) as { messages: MailSummary[] };
        found = body.messages.find((m) => Date.parse(m.Created) >= since.getTime() - 1000);
        return Boolean(found);
      },
      { timeout: 15_000 },
    )
    .toBe(true);
  const res = await fetch(`${mailUrl}/api/v1/message/${found?.ID}`);
  const message = (await res.json()) as { HTML: string; Text: string };
  const href = /href="([^"]+)"/.exec(message.HTML)?.[1] ?? /(https?:\/\/\S+)/.exec(message.Text)?.[1];
  if (!href) throw new Error('E-mail sem link');
  return href.replace(/&amp;/g, '&');
}
