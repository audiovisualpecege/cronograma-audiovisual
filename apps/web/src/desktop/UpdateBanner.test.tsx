import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AboutPage } from '../about/AboutPage';
import type { DesktopBridge, DesktopUpdate } from './bridge';
import { UpdateBanner } from './UpdateBanner';

function fakeBridge(update: DesktopUpdate | null, overrides: Partial<DesktopBridge> = {}): DesktopBridge {
  return {
    platform: 'win32',
    getUpdate: vi.fn(async () => update),
    installUpdate: vi.fn(async () => true),
    getUpdateFolder: vi.fn(async () => '\\\\nas\\instaladores\\cronograma'),
    setUpdateFolder: vi.fn(async (folder: string) => ({ folder, update })),
    notify: vi.fn(),
    onNavigate: vi.fn(() => () => undefined),
    ...overrides,
  };
}

describe('UpdateBanner', () => {
  it('mostra "Instalar vX.Y.Z" com versão nova e abre o instalador pelo programa', async () => {
    const bridge = fakeBridge({ version: '1.1.0', installer: '\\\\nas\\instaladores\\x.exe' });
    render(<UpdateBanner bridge={bridge} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Instalar v1.1.0' }));
    expect(bridge.installUpdate).toHaveBeenCalledOnce();
  });

  it('avisa o que fazer quando o instalador não abre', async () => {
    const bridge = fakeBridge({ version: '1.1.0', installer: 'x' }, { installUpdate: vi.fn(async () => false) });
    render(<UpdateBanner bridge={bridge} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Instalar v1.1.0' }));
    expect(await screen.findByText(/Não deu para abrir o instalador/)).toBeInTheDocument();
  });

  it('não mostra nada sem versão nova nem fora do programa de desktop', async () => {
    const bridge = fakeBridge(null);
    const { container } = render(<UpdateBanner bridge={bridge} />);
    await waitFor(() => expect(bridge.getUpdate).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
    const { container: web } = render(<UpdateBanner bridge={undefined} />);
    expect(web).toBeEmptyDOMElement();
  });
});

describe('AboutPage', () => {
  it('mostra a versão e a assinatura da Chiaro; no navegador, sem a pasta dos instaladores', () => {
    render(<AboutPage bridge={undefined} />);
    expect(screen.getByText(`v${__APP_VERSION__}`)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Chiaro Filmes' })).toBeInTheDocument();
    expect(screen.queryByLabelText(/Pasta dos instaladores/)).not.toBeInTheDocument();
  });

  it('no programa, salva a pasta dos instaladores e o aviso aparece se houver versão nova nela', async () => {
    let update: DesktopUpdate | null = null;
    const bridge = fakeBridge(null, {
      getUpdate: vi.fn(async () => update),
      setUpdateFolder: vi.fn(async (folder: string) => {
        update = { version: '1.2.0', installer: `${folder}\\x.exe` };
        return { folder, update };
      }),
    });
    render(
      <>
        <AboutPage bridge={bridge} />
        <UpdateBanner bridge={bridge} />
      </>,
    );
    const input = await screen.findByDisplayValue('\\\\nas\\instaladores\\cronograma');
    await userEvent.clear(input);
    await userEvent.type(input, '\\\\nas\\novos');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar pasta' }));
    expect(bridge.setUpdateFolder).toHaveBeenCalledWith('\\\\nas\\novos');
    expect(await screen.findByText('Versão nova encontrada: v1.2.0.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Instalar v1.2.0' })).toBeInTheDocument();
  });
});
