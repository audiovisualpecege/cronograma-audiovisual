import React from 'react';
import { Icon } from './Icon.jsx';
export function IconButton({ icon, weight = 'linear', label, variant = 'ghost', size = 44, disabled, onClick, style }) {
  const [h, setH] = React.useState(false);
  const V = { ghost:{bg:h?'var(--accent-soft)':'transparent',fg:'var(--text-primary)',bd:'transparent'}, solid:{bg:h?'var(--accent-hover)':'var(--accent)',fg:'#fff',bd:'transparent'}, outline:{bg:h?'var(--accent-soft)':'transparent',fg:'var(--text-brand)',bd:'var(--border-brand)'}, glass:{bg:h?'rgba(255,255,255,.28)':'rgba(255,255,255,.16)',fg:'#fff',bd:'rgba(255,255,255,.3)'} }[variant];
  return <button aria-label={label} title={label} disabled={disabled} onClick={onClick} onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)}
    style={{ width:size, height:size, borderRadius:'var(--radius-pill)', display:'inline-flex', alignItems:'center', justifyContent:'center', background:V.bg, color:V.fg, border:'1.5px solid '+V.bd, backdropFilter: variant==='glass'?'blur(var(--blur-glass))':undefined, cursor:disabled?'not-allowed':'pointer', opacity:disabled?.4:1, transition:'background var(--dur-fast) var(--ease-cine)', ...style }}>
    <Icon name={icon} weight={weight} size={Math.round(size*0.45)} /></button>;
}