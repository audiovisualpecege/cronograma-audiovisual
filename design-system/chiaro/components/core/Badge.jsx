import React from 'react';
export function Badge({ tone = 'brand', children, style }) {
  const T = { brand:['var(--chiaro-violeta)','#fff'], soft:['var(--accent-soft)','var(--text-brand)'], warm:['var(--chiaro-pessego)','var(--chiaro-noite)'], dark:['var(--chiaro-noite)','#fff'], live:['var(--danger)','#fff'], success:['var(--success)','#fff'] }[tone];
  return <span style={{ display:'inline-flex', alignItems:'center', gap:6, height:22, padding:'0 10px', borderRadius:'var(--radius-pill)', background:T[0], color:T[1], font:'800 11px/1 var(--font-display)', letterSpacing:'.06em', textTransform:'uppercase', ...style }}>
    {tone==='live' && <span style={{width:6,height:6,borderRadius:9,background:'#fff'}} />}{children}</span>;
}