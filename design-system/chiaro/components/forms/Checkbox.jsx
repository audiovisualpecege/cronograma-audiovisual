import React from 'react';
export function Checkbox({ checked, onChange, label, disabled, name: n, value }) {
  return <label style={{ display:'inline-flex', alignItems:'center', gap:10, cursor:disabled?'not-allowed':'pointer', opacity:disabled?.45:1, font:'400 15px var(--font-body)', color:'var(--text-primary)' }}>
    <input type="checkbox" name={n} value={value} checked={!!checked} disabled={disabled} onChange={e=>onChange&&onChange(e.target.checked)} style={{ position:'absolute', opacity:0, width:0, height:0 }} />
    <span style={{ width:20, height:20, borderRadius:6, border:'1.5px solid '+(checked?'var(--accent)':'var(--border-strong)'), background:checked?'var(--accent)':'var(--surface-card)', display:'inline-flex', alignItems:'center', justifyContent:'center', transition:'all var(--dur-fast) var(--ease-cine)', flex:'none' }}>
      {checked && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>}
    </span>{label}</label>;
}