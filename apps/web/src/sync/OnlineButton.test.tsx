import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { setNetwork } from '../../test/helpers';
import { OnlineButton } from './OnlineButton';

const ACTIONS = ['Publicar', 'Publicar alterações', 'Descartar alterações', 'Propor escala', 'Reler agora', 'Importar'];

function Actions() {
  return (
    <>
      {ACTIONS.map((label) => (
        <OnlineButton key={label}>{label}</OnlineButton>
      ))}
    </>
  );
}

describe('ações que exigem internet', () => {
  it('UT-082 sem rede, Publicar, Publicar alterações, Descartar alterações, Propor escala, Reler agora e Importar ficam desabilitados com "Precisa de internet"', () => {
    setNetwork(false);
    render(<Actions />);
    for (const label of ACTIONS) {
      const button = screen.getByRole('button', { name: label });
      expect(button).toBeDisabled();
      expect(button).toHaveAccessibleDescription('Precisa de internet');
    }
    expect(screen.getAllByText('Precisa de internet')).toHaveLength(ACTIONS.length);
  });

  it('com rede, as mesmas ações ficam habilitadas e sem o aviso', () => {
    setNetwork(true);
    render(<Actions />);
    for (const label of ACTIONS) expect(screen.getByRole('button', { name: label })).toBeEnabled();
    expect(screen.queryByText('Precisa de internet')).toBeNull();
  });

  it('a rede caindo com a tela aberta desabilita na hora', () => {
    setNetwork(true);
    render(<Actions />);
    setNetwork(false);
    expect(screen.getByRole('button', { name: 'Publicar' })).toBeDisabled();
  });
});
