import { CalendarIcon } from '@solar-icons/react/linear';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AppIcon } from './AppIcon';

describe('AppIcon', () => {
  it('desenha o ícone do pacote, sem buscar no CDN, e esconde o decorativo dos leitores de tela', () => {
    const { container } = render(<AppIcon icon={CalendarIcon} size={24} />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg?.querySelector('path')).not.toBeNull();
    expect(container.querySelector('img, use[href^="http"]')).toBeNull();
  });

  it('com label, o ícone tem nome acessível', () => {
    render(<AppIcon icon={CalendarIcon} label="Semana" />);
    expect(screen.getByRole('img', { name: 'Semana' })).toBeInTheDocument();
  });
});
