import type { Icon } from '@solar-icons/react/lib/types';
import { useState, type CSSProperties } from 'react';
import { AppIcon } from './AppIcon';

// Mesma forma do IconButton de @chiaro/components/core, com o ícone vindo do pacote Solar (o original
// busca o SVG no CDN e some sem internet; TechSpec, Design system).
interface IconButtonProps {
  icon: Icon;
  label: string;
  variant?: 'ghost' | 'solid' | 'outline';
  size?: number;
  disabled?: boolean;
  onClick?: () => void;
  style?: CSSProperties;
  'aria-expanded'?: boolean;
}

export function IconButton({ icon, label, variant = 'ghost', size = 44, disabled, onClick, style, ...aria }: IconButtonProps) {
  const [hover, setHover] = useState(false);
  const v = {
    ghost: { bg: hover ? 'var(--accent-soft)' : 'transparent', fg: 'var(--text-primary)', bd: 'transparent' },
    solid: { bg: hover ? 'var(--accent-hover)' : 'var(--accent)', fg: 'var(--text-on-brand)', bd: 'transparent' },
    outline: { bg: hover ? 'var(--accent-soft)' : 'transparent', fg: 'var(--text-brand)', bd: 'var(--border-brand)' },
  }[variant];
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      {...aria}
      style={{
        width: size,
        height: size,
        borderRadius: 'var(--radius-pill)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: v.bg,
        color: v.fg,
        border: `1.5px solid ${v.bd}`,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        transition: 'background var(--dur-fast) var(--ease-cine)',
        ...style,
      }}
    >
      <AppIcon icon={icon} size={Math.round(size * 0.45)} />
    </button>
  );
}
