import { CloseIcon } from '@solar-icons/react/linear';
import { useEffect, type ReactNode } from 'react';
import { IconButton } from './IconButton';

// Mesma forma do Dialog de @chiaro/components/surfaces (fundo Noite 62% com desfoque, canto 28 px), com o
// botão de fechar pelo IconButton local, que não depende do CDN de ícones.
interface DialogProps {
  open: boolean;
  onClose?: () => void;
  title?: string;
  children?: ReactNode;
  footer?: ReactNode;
  width?: number;
}

export function Dialog({ open, onClose, title, children, footer, width = 520 }: DialogProps) {
  useEffect(() => {
    if (!open || !onClose) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'rgba(7,0,16,.62)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-5)',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: width,
          maxHeight: '90dvh',
          overflowY: 'auto',
          background: 'var(--surface-card)',
          color: 'var(--text-primary)',
          borderRadius: 'var(--radius-xl)',
          boxShadow: 'var(--shadow-lg)',
          padding: 'var(--space-6)',
          position: 'relative',
          boxSizing: 'border-box',
        }}
      >
        {onClose && (
          <IconButton icon={CloseIcon} label="Fechar" onClick={onClose} size={40} style={{ position: 'absolute', top: 16, right: 16 }} />
        )}
        {title && (
          <h2 style={{ margin: '0 40px 12px 0', font: '800 26px/1.05 var(--font-display)', textTransform: 'uppercase', color: 'var(--text-brand)' }}>
            {title}
          </h2>
        )}
        <div style={{ font: '400 15px/1.6 var(--font-body)', color: 'var(--text-secondary)' }}>{children}</div>
        {footer && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'flex-end', marginTop: 28 }}>{footer}</div>}
      </div>
    </div>
  );
}
