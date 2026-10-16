import React from 'react';
import { Icon } from '../core/Icon.jsx';
const labelStyle={display:'block',font:'700 12px var(--font-display)',letterSpacing:'.04em',textTransform:'uppercase',color:'var(--text-primary)',marginBottom:8};
const boxStyle=(f,err,dis)=>({width:'100%',boxSizing:'border-box',height:48,padding:'0 16px',borderRadius:'var(--radius-control)',border:'1.5px solid '+(err?'var(--danger)':f?'var(--accent)':'var(--border-strong)'),background:dis?'var(--surface-sunken)':'var(--surface-card)',color:'var(--text-primary)',font:'400 15px var(--font-body)',outline:'none',boxShadow:f?'var(--focus-ring)':'none',transition:'border-color var(--dur-fast) var(--ease-cine), box-shadow var(--dur-fast) var(--ease-cine)'});
export function Select({ label, options = [], value, onChange, placeholder, disabled, style }) {
  const [f, setF] = React.useState(false);
  return <label style={{ display:'block', ...style }}>{label && <span style={labelStyle}>{label}</span>}
    <span style={{ position:'relative', display:'block' }}>
      <select value={value} onChange={onChange} disabled={disabled} onFocus={()=>setF(true)} onBlur={()=>setF(false)} style={{ ...boxStyle(f,false,disabled), appearance:'none', paddingRight:44, cursor:'pointer' }}>
        {placeholder && <option value="">{placeholder}</option>}
        {options.map(o => typeof o === 'string' ? <option key={o} value={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <Icon name="alt-arrow-down"size={18} style={{ position:'absolute', right:16, top:15, pointerEvents:'none', color:'var(--text-brand)' }} /></span></label>;
}