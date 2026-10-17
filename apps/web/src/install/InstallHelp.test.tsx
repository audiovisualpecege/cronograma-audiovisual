import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InstallHelp, IOS_PUSH_NOTE } from './InstallHelp';
import { LAST_VERSION_KEY, UpdateNotice } from './UpdateNotice';

const SAFARI_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const FIREFOX_ANDROID = 'Mozilla/5.0 (Android 14; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0';

function browser(ua: string, standalone = false) {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ua);
  window.matchMedia = vi.fn((query: string) => ({ matches: standalone && query.includes('standalone'), media: query, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
}

afterEach(() => {
  delete (window as { matchMedia?: unknown }).matchMedia;
});

describe('InstallHelp', () => {
  it('UT-102 Safari no iPhone fora do modo standalone mostra a instrução de instalar com a nota de notificação (iOS 16.4)', () => {
    browser(SAFARI_IPHONE);
    render(<InstallHelp />);
    expect(screen.getByRole('heading', { name: 'Instalar no celular' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Passo a passo' })).toHaveTextContent('Adicionar à Tela de Início');
    expect(screen.getByRole('note')).toHaveTextContent(IOS_PUSH_NOTE);
    expect(IOS_PUSH_NOTE).toContain('iOS 16.4');
  });

  it('UT-102 em display-mode standalone não mostra nada', () => {
    browser(SAFARI_IPHONE, true);
    const { container } = render(<InstallHelp />);
    expect(container).toBeEmptyDOMElement();
  });

  it('UT-103 navegador sem beforeinstallprompt (Firefox Android) mostra o passo a passo desse navegador', () => {
    browser(FIREFOX_ANDROID);
    render(<InstallHelp />);
    const steps = screen.getByRole('list', { name: 'Passo a passo' });
    expect(steps).toHaveTextContent('No Firefox, toque no menu de três pontos');
    expect(screen.queryByRole('button', { name: 'Instalar o app' })).toBeNull();
    expect(screen.queryByRole('note')).toBeNull();
  });
});

describe('UpdateNotice', () => {
  it('UT-107 lastSeenVersion 1.0.0 e versão atual 1.0.1 mostram "Atualizado para v1.0.1" uma vez e gravam 1.0.1', () => {
    localStorage.setItem(LAST_VERSION_KEY, '1.0.0');
    const first = render(<UpdateNotice version="1.0.1" />);
    expect(screen.getByRole('status')).toHaveTextContent('Atualizado para v1.0.1');
    expect(localStorage.getItem(LAST_VERSION_KEY)).toBe('1.0.1');
    first.unmount();

    render(<UpdateNotice version="1.0.1" />);
    expect(screen.queryByText('Atualizado para v1.0.1')).toBeNull();
  });

  it('primeira abertura no aparelho só grava a versão, sem aviso', () => {
    render(<UpdateNotice version="1.0.0" />);
    expect(screen.queryByRole('status')).toBeNull();
    expect(localStorage.getItem(LAST_VERSION_KEY)).toBe('1.0.0');
  });
});
