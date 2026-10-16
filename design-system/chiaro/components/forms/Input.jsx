import React from 'react';
const labelStyle={display:'block',font:'700 12px var(--font-display)',letterSpacing:'.04em',textTransform:'uppercase',color:'var(--text-primary)',marginBottom:8};
const boxStyle=(f,err,dis)=>({width:'100%',boxSizing:'border-box',height:48,padding:'0 16px',borderRadius:'var(--radius-control)',border:'1.5px solid '+(err?'var(--danger)':f?'var(--accent)':'var(--border-strong)'),background:dis?'var(--surface-sunken)':'var(--surface-card)',color:'var(--text-primary)',font:'400 15px var(--font-body)',outline:'none',boxShadow:f?'var(--focus-ring)':'none',transition:'border-color var(--dur-fast) var(--ease-cine), box-shadow var(--dur-fast) var(--ease-cine)'});
export function Input({ label, hint, error, multiline, rows = 4, style, disabled, ...rest }) {
  const [f, setF] = React.useState(false);
  const El = multiline ? 'textarea' : 'input';
  const b = boxStyle(f, error, disabled);
  return <label style={{ display:'block', ...style }}>{label && <span style={labelStyle}>{label}</span>}
    <El {...rest} rows={multiline?rows:undefined} disabled={disabled} onFocus={e=>{setF(true);rest.onFocus&&rest.onFocus(e);}} onBlur={e=>{setF(false);rest.onBlur&&rest.onBlur(e);}}
      style={{ ...b, ...(multiline?{height:'auto',padding:'12px 16px',resize:'vertical',lineHeight:1.5}:{}) }} />
    {(error||hint) && <span style={{display:'block',marginTop:6,font:'400 12px var(--font-body)',color:error?'var(--danger)':'var(--text-secondary)'}}>{error||hint}</span>}</label>;
}