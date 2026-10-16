import React from 'react';
import { Icon } from './Icon.jsx';
export function Tag({ selected, onClick, onRemove, children, style }) {
  const [h, setH] = React.useState(false);
  return <span onClick={onClick} onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)}
    style={{ display:'inline-flex', alignItems:'center', gap:6, height:32, padding:'0 14px', borderRadius:'var(--radius-pill)', cursor:onClick?'pointer':'default',
      background: selected ? 'var(--accent)' : h && onClick ? 'var(--accent-soft)' : 'transparent', color: selected ? '#fff' : 'var(--text-primary)',
      border:'1.5px solid '+(selected?'var(--accent)':'var(--border-strong)'), font:'500 13px var(--font-body)', transition:'all var(--dur-fast) var(--ease-cine)', ...style }}>
    {children}{onRemove && <span onClick={e=>{e.stopPropagation();onRemove();}} style={{display:'inline-flex',cursor:'pointer'}}><Icon name="close" size={14} /></span>}</span>;
}