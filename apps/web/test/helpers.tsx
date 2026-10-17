import { act, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { vi } from 'vitest';
import { LocalStore } from '../src/sync/localStore';
import { SyncEngine } from '../src/sync/syncEngine';
import { SyncProvider } from '../src/sync/SyncProvider';
import { FakeRemote } from './fakeRemote';

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
