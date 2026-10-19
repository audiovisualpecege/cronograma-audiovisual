import { act, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { vi } from 'vitest';
import { MeProvider } from '../src/auth/me';
import type { Me } from '../src/supabase';
import { LocalStore } from '../src/sync/localStore';
import { SyncEngine } from '../src/sync/syncEngine';
import { SyncProvider } from '../src/sync/SyncProvider';
import { FakeRemote } from './fakeRemote';

/**
 * Folga dos limites de tempo dos testes de desempenho no CI: o jsdom num runner compartilhado do GitHub
 * roda bem mais devagar que um PC (UT-157 levou 542 ms para 500 ms). Fora do CI vale o limite do requisito.
 */
export const PERF_BUDGET = process.env.CI ? 3 : 1;

/** Liga ou desliga a rede do navegador e avisa a página, como o aparelho faria. */
export function setNetwork(online: boolean): void {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(online);
  act(() => {
    window.dispatchEvent(new Event(online ? 'online' : 'offline'));
  });
}

export function renderWithSync(ui: ReactNode, options: { remote?: FakeRemote; profile?: 'admin' | 'team'; now?: () => Date } = {}) {
  const remote = options.remote ?? new FakeRemote();
  const store = new LocalStore('tela');
  const engine = new SyncEngine({ store, remote, profile: options.profile ?? 'admin', online: navigator.onLine, now: options.now });
  const view = render(<SyncProvider engine={engine}>{ui}</SyncProvider>);
  return { ...view, engine, store, remote };
}

/** Tela da pessoa logada (Minha semana, avisos, preferências): cópia local e a pessoa no contexto. */
export function renderAsMe(ui: ReactNode, options: { remote?: FakeRemote; me?: Me; profile?: 'admin' | 'team'; now?: () => Date } = {}) {
  const me = options.me ?? { personId: 'p10', name: 'Pessoa Exemplo 10', profile: 'team' as const };
  return renderWithSync(<MeProvider me={me}>{ui}</MeProvider>, { ...options, profile: options.profile ?? me.profile });
}
