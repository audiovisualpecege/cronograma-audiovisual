import React from 'react';
import { IconButton } from '../core/IconButton.jsx';
export function Dialog({ open, onClose, title, children, footer, width = 520 }) {
  if (!open) return null;
  return <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:100, background:'rgba(7,0,16,.62)', backdropFilter:'blur(6px)', display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
    <div role="dialog" aria-modal="true" onClick={e=>e.stopPropagation()} style={{ width:'100%', maxWidth:width, background:'var(--surface-card)', color:'var(--text-primary)', borderRadius:'var(--radius-xl)', boxShadow:'var(--shadow-lg)', padding:32, position:'relative' }}>
      <IconButton icon="close"label="Fechar" onClick={onClose} size={40} style={{ position:'absolute', top:16, right:16 }} />
      {title && <h2 style={{ margin:'0 40px 12px 0', font:'800 26px/1.05 var(--font-display)', textTransform:'uppercase', color:'var(--text-brand)' }}>{title}</h2>}
      <div style={{ font:'400 15px/1.6 var(--font-body)', color:'var(--text-secondary)' }}>{children}</div>
      {footer && <div style={{ display:'flex', gap:12, justifyContent:'flex-end', marginTop:28 }}>{footer}</div>}</div></div>;
}