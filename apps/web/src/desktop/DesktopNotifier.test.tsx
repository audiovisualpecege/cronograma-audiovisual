import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { NotificationRow } from '../notifications/useNotifications';
import type { DesktopBridge } from './bridge';
import { DesktopNotifier } from './DesktopNotifier';

let rows: NotificationRow[] | undefined;
vi.mock('../notifications/useNotifications', () => ({ useNotifications: () => rows }));

function row(id: string, createdAt: Date, readAt: string | null = null): NotificationRow {
  return {
    id,
    version: 1,
    updated_at: createdAt.toISOString(),
    person_id: 'p1',
    kind: 'event_changed',
    title: `Aviso ${id}`,
    body: 'Mudou o horário',
    link: '#/evento/e1',
    dedupe_key: id,
    read_at: readAt,
    created_at: createdAt.toISOString(),
  };
}

function bridge(): DesktopBridge {
  return {
    platform: 'win32',
    getUpdate: vi.fn(async () => null),
    installUpdate: vi.fn(async () => false),
    getUpdateFolder: vi.fn(async () => ''),
    setUpdateFolder: vi.fn(),
    notify: vi.fn(),
    onNavigate: vi.fn(() => () => undefined),
  };
}

describe('DesktopNotifier', () => {
  it('vira notificação do sistema só o aviso novo e não lido que chega com o programa aberto', () => {
    const b = bridge();
    rows = undefined;
    const { rerender } = render(<DesktopNotifier bridge={b} />);
    // Primeira leitura da cópia local: avisos antigos não notificam.
    rows = [row('antigo', new Date(Date.now() - 3 * 3_600_000))];
    rerender(<DesktopNotifier bridge={b} />);
    expect(b.notify).not.toHaveBeenCalled();

    rows = [...rows, row('novo', new Date()), row('lido', new Date(), new Date().toISOString())];
    rerender(<DesktopNotifier bridge={b} />);
    expect(b.notify).toHaveBeenCalledOnce();
    expect(b.notify).toHaveBeenCalledWith({ title: 'Aviso novo', body: 'Mudou o horário', link: '#/evento/e1' });

    rerender(<DesktopNotifier bridge={b} />);
    expect(b.notify).toHaveBeenCalledOnce();
  });
});
