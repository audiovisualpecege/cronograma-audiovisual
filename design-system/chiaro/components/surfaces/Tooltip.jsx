import React from 'react';
export function Tooltip({ label, children, placement = 'top' }) {
  const [o, setO] = React.useState(false);
  const pos = placement === 'top' ? { bottom:'calc(100% + 8px)' } : { top:'calc(100% + 8px)' };
  return <span onMouseEnter={()=>setO(true)} onMouseLeave={()=>setO(false)} style={{ position:'relative', display:'inline-flex' }}>{children}
    <span role="tooltip" style={{ position:'absolute', left:'50%', ...pos, transform:'translateX(-50%) translateY('+(o?0:4)+'px)', opacity:o?1:0, pointerEvents:'none', whiteSpace:'nowrap', padding:'6px 10px', borderRadius:'var(--radius-sm)', background:'var(--chiaro-noite)', color:'#fff', font:'500 12px var(--font-body)', transition:'opacity var(--dur-fast) var(--ease-cine), transform var(--dur-fast) var(--ease-cine)', zIndex:50 }}>{label}</span></span>;
}