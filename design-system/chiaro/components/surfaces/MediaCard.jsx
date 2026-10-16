import React from 'react';
import { Icon } from '../core/Icon.jsx';
export function MediaCard({ image, title, eyebrow, meta, playable, ratio = '16 / 10', onClick, style }) {
  const [h, setH] = React.useState(false);
  return <figure onClick={onClick} onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)} style={{ margin:0, position:'relative', borderRadius:'var(--radius-photo)', overflow:'hidden', aspectRatio:ratio, background:'var(--chiaro-noite)', cursor:onClick?'pointer':undefined, ...style }}>
    <div style={{ position:'absolute', inset:0, backgroundImage:'url('+image+')', backgroundSize:'cover', backgroundPosition:'center', transform:h?'scale(1.04)':'scale(1)', transition:'transform var(--dur-scene) var(--ease-out)' }} />
    {(title||eyebrow) && <div style={{ position:'absolute', inset:0, background:'var(--gradient-protecao)' }} />}
    {playable && <span style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)', width:64, height:64, borderRadius:999, background:h?'var(--chiaro-lavanda)':'rgba(255,255,255,.18)', backdropFilter:'blur(var(--blur-glass))', border:'1.5px solid rgba(255,255,255,.4)', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', transition:'background var(--dur-base) var(--ease-cine)' }}><Icon name="play" weight="bold" size={26} /></span>}
    {(title||eyebrow) && <figcaption style={{ position:'absolute', left:20, right:20, bottom:18, color:'#fff' }}>
      {eyebrow && <div style={{ font:'800 11px var(--font-display)', letterSpacing:'.08em', textTransform:'uppercase', color:'var(--chiaro-pessego)', marginBottom:6 }}>{eyebrow}</div>}
      {title && <div style={{ font:'700 22px/1.1 var(--font-display)', textTransform:'uppercase' }}>{title}</div>}
      {meta && <div style={{ font:'400 13px var(--font-body)', opacity:.8, marginTop:6 }}>{meta}</div>}</figcaption>}
  </figure>;
}