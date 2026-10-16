import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AppVersion } from './AppVersion';

describe('AppVersion', () => {
  it("UT-106 o rodapé mostra v1.0.0 quando __APP_VERSION__='1.0.0'", () => {
    expect(__APP_VERSION__).toBe('1.0.0');
    render(<AppVersion />);
    expect(screen.getByText('v1.0.0')).toHaveClass('app-version');
  });
});
