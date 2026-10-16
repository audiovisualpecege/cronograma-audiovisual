import React from 'react';
export function Card({ variant = 'default', padding = 24, interactive, onClick, children, style }) {
  const [h, setH] = React.useState(false);
  const V = { default:{bg:'var(--surface-card)',bd:'1px solid var(--border-subtle)',sh:'var(--shadow-sm)'}, raised:{bg:'var(--surface-raised)',bd:'1px solid transparent',sh:'var(--shadow-md)'}, noite:{bg:'var(--chiaro-noite)',bd:'1px solid rgba(255,255,255,.08)',sh:'none',fg:'#fff'}, warm:{bg:'var(--chiaro-areia)',bd:'1px solid transparent',sh:'none'}, brand:{bg:'var(--gradient-chiaro)',bd:'1px solid transparent',sh:'none',fg:'#fff'} }[variant];
  return <div onClick={onClick} onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)}
    style={{ background:V.bg, border:V.bd, color:V.fg, borderRadius:'var(--radius-card)', padding, boxShadow: interactive && h ? 'var(--shadow-lg)' : V.sh, transform: interactive && h ? 'translateY(-2px)' : 'none', cursor: interactive ? 'pointer' : undefined, transition:'box-shadow var(--dur-base) var(--ease-cine), transform var(--dur-base) var(--ease-cine)', ...style }}>{children}</div>;
}