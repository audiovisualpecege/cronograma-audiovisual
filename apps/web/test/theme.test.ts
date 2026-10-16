// @vitest-environment node
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const webDir = fileURLToPath(new URL('../', import.meta.url));
let outDir: string;

beforeAll(async () => {
  outDir = await mkdtemp(join(tmpdir(), 'cronograma-web-'));
  await build({
    root: webDir,
    configFile: join(webDir, 'vite.config.ts'),
    logLevel: 'silent',
    build: { outDir, emptyOutDir: true },
  });
}, 120_000);

afterAll(async () => {
  await rm(outDir, { recursive: true, force: true });
});

async function filesIn(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  return entries.filter((e) => e.isFile()).map((e) => join(e.parentPath, e.name));
}

describe('tema Noite', () => {
  it('UT-176 index.html gerado tem data-theme="noite" e color-scheme escuro, e o CSS não tem tema claro', async () => {
    const html = await readFile(join(outDir, 'index.html'), 'utf8');
    expect(html).toMatch(/<html lang="pt-BR" data-theme="noite">/);
    expect(html).toContain('<meta name="color-scheme" content="dark"');
    expect(html).toContain('<meta name="theme-color" content="#070010"');

    const cssFiles = (await filesIn(outDir)).filter((f) => f.endsWith('.css'));
    expect(cssFiles.length).toBeGreaterThan(0);
    const css = (await Promise.all(cssFiles.map((f) => readFile(f, 'utf8')))).join('\n');
    expect(css).not.toContain('prefers-color-scheme');
    expect(css).not.toMatch(/data-theme=["']?claro/);
    expect(css).toMatch(/color-scheme:\s*dark/);
    expect(css).toMatch(/body\{[^}]*background:var\(--surface-page\)/);
    expect(css).toMatch(/\[data-theme=["']?noite["']?\]/);
  });

  it('as fontes Altivo e Archivo do design system entram no build', async () => {
    const names = (await filesIn(outDir)).map((f) => f.replaceAll('\\', '/').split('/').pop() ?? '');
    expect(names.some((f) => /^Altivo-Black-.*\.otf$/.test(f))).toBe(true);
    expect(names.some((f) => /^Archivo-Variable-.*\.ttf$/.test(f))).toBe(true);
  });
});
