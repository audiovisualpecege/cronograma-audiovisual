import { AltArrowDownIcon } from '@solar-icons/react/linear';
import { useState, type CSSProperties, type SelectHTMLAttributes } from 'react';
import { AppIcon } from './AppIcon';

// Mesma forma do Select de @chiaro/components/forms (rótulo em caixa alta, campo de 48 px em pílula
// de controle), com a seta do pacote Solar: o original busca o ícone no CDN e some sem internet.
export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'style'> {
  label?: string;
  options: (string | SelectOption)[];
  placeholder?: string;
  error?: string;
  hint?: string;
  style?: CSSProperties;
}

const labelStyle: CSSProperties = {
  display: 'block',
  font: '700 12px var(--font-display)',
  letterSpacing: '.04em',
  textTransform: 'uppercase',
  color: 'var(--text-primary)',
  marginBottom: 8,
};

export function Select({ label, options, placeholder, error, hint, disabled, style, onFocus, onBlur, ...rest }: SelectProps) {
  const [focused, setFocused] = useState(false);
  return (
    <label style={{ display: 'block', ...style }}>
      {label && <span style={labelStyle}>{label}</span>}
      <span style={{ position: 'relative', display: 'block' }}>
        <select
          {...rest}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            height: 48,
            padding: '0 44px 0 16px',
            borderRadius: 'var(--radius-control)',
            border: `1.5px solid ${error ? 'var(--danger)' : focused ? 'var(--accent)' : 'var(--border-strong)'}`,
            background: disabled ? 'var(--surface-sunken)' : 'var(--surface-card)',
            color: 'var(--text-primary)',
            font: '400 15px var(--font-body)',
            outline: 'none',
            boxShadow: focused ? 'var(--focus-ring)' : 'none',
            appearance: 'none',
            cursor: disabled ? 'not-allowed' : 'pointer',
            transition: 'border-color var(--dur-fast) var(--ease-cine), box-shadow var(--dur-fast) var(--ease-cine)',
          }}
        >
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {options.map((o) =>
            typeof o === 'string' ? (
              <option key={o} value={o}>
                {o}
              </option>
            ) : (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ),
          )}
        </select>
        <span style={{ position: 'absolute', right: 16, top: 15, pointerEvents: 'none', color: 'var(--text-brand)', display: 'flex' }}>
          <AppIcon icon={AltArrowDownIcon} size={18} />
        </span>
      </span>
      {(error || hint) && (
        <span style={{ display: 'block', marginTop: 6, font: '400 12px var(--font-body)', color: error ? 'var(--danger)' : 'var(--text-secondary)' }}>
          {error || hint}
        </span>
      )}
    </label>
  );
}
