import type { ReactNode } from 'react';

// Mesma forma do Switch de @chiaro/components/forms (trilho de 44 por 26 px, bolinha branca), feito com
// um <button role="switch">: o original é um <span> sem nome acessível nem teclado.
interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  disabled?: boolean;
  hint?: ReactNode;
}

export function Switch({ checked, onChange, label, disabled, hint }: SwitchProps) {
  return (
    <span className="switch-row">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className="switch-button"
      >
        <span
          aria-hidden="true"
          style={{
            width: 44,
            height: 26,
            borderRadius: 999,
            background: checked ? 'var(--accent)' : 'var(--border-strong)',
            position: 'relative',
            transition: 'background var(--dur-base) var(--ease-cine)',
            flex: 'none',
          }}
        >
          <span
            style={{
              position: 'absolute',
              top: 3,
              left: checked ? 21 : 3,
              width: 20,
              height: 20,
              borderRadius: '50%',
              background: '#fff',
              boxShadow: 'var(--shadow-sm)',
              transition: 'left var(--dur-base) var(--ease-cine)',
            }}
          />
        </span>
        <span className="switch-label">{label}</span>
      </button>
      {hint && <small className="switch-hint">{hint}</small>}
    </span>
  );
}
