import React from 'react';
export function Radio({ checked, onChange, label, disabled, name: n, value }) {
  return <label style={{ display:'inline-flex', alignItems:'center', gap:10, cursor:disabled?'not-allowed':'pointer', opacity:disabled?.45:1, font:'400 15px var(--font-body)', color:'var(--text-primary)' }}>
    <input type="radio" name={n} value={value} checked={!!checked} disabled={disabled} onChange={e=>onChange&&onChange(e.target.checked)} style={{ position:'absolute', opacity:0, width:0, height:0 }} />
    <span style={{ width:20, height:20, borderRadius:'50%', border:'1.5px solid '+(checked?'var(--accent)':'var(--border-strong)'), background:'var(--surface-card)', display:'inline-flex', alignItems:'center', justifyContent:'center', transition:'all var(--dur-fast) var(--ease-cine)', flex:'none' }}>
      {checked && <span style={{ width:10, height:10, borderRadius:'50%', background:'var(--accent)' }} />}
    </span>{label}</label>;
}