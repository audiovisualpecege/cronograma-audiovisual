import { CheckCircleIcon, CloseIcon, DangerTriangleIcon, StarsMinimalisticIcon } from '@solar-icons/react/bold';
import type { CSSProperties } from 'react';
import { AppIcon } from './AppIcon';

// Mesma forma do Toast de @chiaro/components/surfaces, com os ícones do pacote Solar (sem CDN).
interface ToastProps {
  tone?: 'default' | 'success' | 'danger';
  title?: string;
  message?: string;
  onClose?: () => void;
  style?: CSSProperties;
}

const ICONS = { default: StarsMinimalisticIcon, success: CheckCircleIcon, danger: DangerTriangleIcon };
const COLORS = { default: 'var(--chiaro-lavanda)', success: 'var(--success)', danger: 'var(--danger)' };

export function Toast({ tone = 'default', title, message, onClose, style }: ToastProps) {
  return (
    <div
      role="status"
      style={{
        display: 'flex',
        gap: 12,
        alignItems: 'flex-start',
        width: 360,
        maxWidth: '100%',
        padding: '14px 16px',
        borderRadius: 'var(--radius-lg)',
        background: 'var(--chiaro-noite)',
        border: '1px solid var(--border-subtle)',
        color: 'var(--text-primary)',
        boxShadow: 'var(--shadow-lg)',
        boxSizing: 'border-box',
        ...style,
      }}
    >
      <span
        style={{ width: 32, height: 32, borderRadius: 999, background: COLORS[tone], color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}
      >
        <AppIcon icon={ICONS[tone]} size={16} />
      </span>
      <div style={{ flex: 1 }}>
        {title && <div style={{ font: '700 14px var(--font-display)' }}>{title}</div>}
        {message && <div style={{ font: '400 13px/1.45 var(--font-body)', color: 'var(--text-secondary)', marginTop: 2 }}>{message}</div>}
      </div>
      {onClose && (
        <button
          type="button"
          aria-label="Fechar aviso"
          onClick={onClose}
          style={{ background: 'none', border: 0, color: 'inherit', cursor: 'pointer', opacity: 0.6, display: 'flex', padding: 4 }}
        >
          <AppIcon icon={CloseIcon} size={16} />
        </button>
      )}
    </div>
  );
}
