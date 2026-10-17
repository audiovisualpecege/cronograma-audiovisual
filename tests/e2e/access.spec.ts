/// <reference lib="dom" />
import { expect, test } from '@playwright/test';
import { email, isMobile, latestLink, login, logout } from './helpers';

test.describe('acesso', () => {
  test('E2E-003 "Esqueci a senha", e-mail no Inbucket, link, senha nova, login com a senha nova', async ({ page }, info) => {
    // Uma pessoa por projeto, para as duas rodadas não trocarem a senha uma da outra.
    const address = email(isMobile(info) ? 18 : 19);
    const newPassword = `Senha-nova-${info.project.name}-456`;
    const since = new Date();

    await page.goto('#/entrar');
    await page.getByRole('link', { name: 'Esqueci a senha' }).click();
    await page.getByLabel(/^E-mail/).fill(address);
    await page.getByRole('button', { name: 'Enviar link' }).click();
    await expect(page.getByText(/você vai receber um link para criar uma senha nova/)).toBeVisible();

    const link = await latestLink(address, since);
    await page.goto(link);
    await expect(page).toHaveURL(/#\/criar-senha$/);
    await page.getByLabel(/^Senha nova/).fill(newPassword);
    await page.getByLabel(/^Repita a senha/).fill(newPassword);
    await page.getByRole('button', { name: 'Salvar senha' }).click();
    await expect(page).toHaveURL(/#\/minha-semana$/);

    await logout(page, info);
    await login(page, address, newPassword);
    await expect(page).toHaveURL(/#\/minha-semana$/);
    await expect(page.getByRole('heading', { name: 'MINHA SEMANA' })).toBeVisible();
  });

  test('E2E-004 P10 entra, recarrega a página e continua logado', async ({ page }, info) => {
    await page.goto('#/entrar');
    await expect(page.locator('.auth-footer')).toContainText('v1.0.0');
    await expect(page.getByRole('img', { name: 'Chiaro Filmes' })).toBeVisible();
    await login(page, email(10));
    await expect(page).toHaveURL(/#\/minha-semana$/);
    await expect(page.getByRole('heading', { name: 'MINHA SEMANA' })).toBeVisible();

    await page.reload();
    await expect(page).toHaveURL(/#\/minha-semana$/);
    await expect(page.getByRole('heading', { name: 'MINHA SEMANA' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Entrar' })).toHaveCount(0);

    // Tema Noite e versão na moldura: rodapé do menu lateral no desktop, fim do "Mais" no celular.
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(7, 0, 16)');
    if (isMobile(info)) {
      await page.getByRole('navigation', { name: 'Menu do celular' }).getByRole('button', { name: 'Mais' }).click();
      await expect(page.getByRole('dialog', { name: 'Mais' })).toContainText('v1.0.0');
    } else {
      await expect(page.getByRole('navigation', { name: 'Menu principal' })).toContainText('v1.0.0');
    }
  });

  test('E2E-028 P10 abre #/admin/configuracao e vê "Sem permissão" com o botão para a sua semana', async ({ page }) => {
    await page.goto('#/admin/configuracao');
    await expect(page).toHaveURL(/#\/entrar\?volta=%2Fadmin%2Fconfiguracao$/);
    await login(page, email(10));
    await expect(page).toHaveURL(/#\/admin\/configuracao$/);
    await expect(page.getByRole('heading', { name: 'SEM PERMISSÃO' })).toBeVisible();
    await page.getByRole('button', { name: 'Ir para minha semana' }).click();
    await expect(page).toHaveURL(/#\/minha-semana$/);
    await expect(page.getByRole('heading', { name: 'MINHA SEMANA' })).toBeVisible();
  });
});
