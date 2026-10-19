import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AppVersion } from './AppVersion';

describe('AppVersion', () => {
  // A versão vem do package.json da raiz (UT-177); o teste não fixa o número, para não quebrar a cada versão.
  it('UT-106 o rodapé mostra "v" + __APP_VERSION__', () => {
    expect(__APP_VERSION__).toMatch(/^\d+\.\d+\.\d+$/);
    render(<AppVersion />);
    expect(screen.getByText(`v${__APP_VERSION__}`)).toHaveClass('app-version');
  });
});
