import React from 'react';
export function Tabs({ items = [], value, onChange, variant = 'underline', style }) {
  return <div role="tablist" style={{ display:'flex', gap: variant==='pill'?6:28, padding: variant==='pill'?4:0, borderRadius: variant==='pill'?999:0, background: variant==='pill'?'var(--surface-sunken)':'transparent', borderBottom: variant==='underline'?'1px solid var(--border-subtle)':'none', width: variant==='pill'?'fit-content':undefined, ...style }}>
    {items.map(it => { const k = it.value ?? it; const l = it.label ?? it; const on = k === value;
      return <button key={k} role="tab" aria-selected={on} onClick={()=>onChange&&onChange(k)} style={ variant==='pill'
        ? { height:36, padding:'0 18px', borderRadius:999, border:0, cursor:'pointer', background:on?'var(--accent)':'transparent', color:on?'#fff':'var(--text-secondary)', font:'700 13px var(--font-display)', letterSpacing:'.03em', textTransform:'uppercase', transition:'all var(--dur-fast) var(--ease-cine)' }
        : { padding:'0 0 12px', marginBottom:-1, border:0, borderBottom:'2px solid '+(on?'var(--accent)':'transparent'), background:'none', cursor:'pointer', color:on?'var(--text-brand)':'var(--text-secondary)', font:(on?800:300)+' 15px var(--font-display)', letterSpacing:'.03em', textTransform:'uppercase', transition:'all var(--dur-fast) var(--ease-cine)' }}>{l}</button>; })}</div>;
}