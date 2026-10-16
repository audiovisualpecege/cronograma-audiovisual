import React from 'react';
export function Switch({ checked, onChange, label, disabled }) {
  return <label style={{ display:'inline-flex', alignItems:'center', gap:10, cursor:disabled?'not-allowed':'pointer', opacity:disabled?.45:1, font:'400 15px var(--font-body)', color:'var(--text-primary)' }}>
    <span role="switch" aria-checked={!!checked} onClick={()=>!disabled&&onChange&&onChange(!checked)} style={{ width:44, height:26, borderRadius:999, background:checked?'var(--accent)':'var(--neutral-300)', position:'relative', transition:'background var(--dur-base) var(--ease-cine)', flex:'none' }}>
      <span style={{ position:'absolute', top:3, left:checked?21:3, width:20, height:20, borderRadius:'50%', background:'#fff', boxShadow:'var(--shadow-sm)', transition:'left var(--dur-base) var(--ease-cine)' }} /></span>{label}</label>;
}