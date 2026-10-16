import React from 'react';
import { Icon } from './Icon.jsx';
const SIZES = { sm:{h:36,px:16,fs:13,ic:16}, md:{h:44,px:22,fs:15,ic:18}, lg:{h:56,px:30,fs:17,ic:20} };
export function Button({ variant = 'primary', size = 'md', iconLeft, iconRight, disabled, fullWidth, children, style, onClick, type = 'button', ...rest }) {
  const [h, setH] = React.useState(false); const [p, setP] = React.useState(false);
  const s = SIZES[size] || SIZES.md;
  const V = {
    primary:  { bg: p ? 'var(--accent-press)' : h ? 'var(--accent-hover)' : 'var(--accent)', fg:'var(--text-on-brand)', bd:'transparent' },
    secondary:{ bg: h ? 'var(--accent-soft)' : 'transparent', fg:'var(--text-brand)', bd:'var(--border-brand)' },
    ghost:    { bg: h ? 'var(--accent-soft)' : 'transparent', fg:'var(--text-primary)', bd:'transparent' },
    light:    { bg: h ? 'var(--chiaro-areia)' : '#fff', fg:'var(--chiaro-noite)', bd:'transparent' },
    gradient: { bg: 'var(--gradient-chiaro)', fg:'#fff', bd:'transparent' },
  }[variant] || {};
  return (
    <button type={type} disabled={disabled} onClick={onClick}
      onMouseEnter={() => setH(true)} onMouseLeave={() => { setH(false); setP(false); }} onMouseDown={() => setP(true)} onMouseUp={() => setP(false)}
      style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', gap:8, height:s.h, padding:'0 '+s.px+'px', width: fullWidth ? '100%' : undefined,
        borderRadius:'var(--radius-pill)', border:'1.5px solid '+V.bd, background:V.bg, backgroundOrigin:'border-box', backgroundClip:'border-box', color:V.fg,
        fontFamily:'var(--font-display)', fontWeight:700, fontSize:s.fs, letterSpacing:'.02em', textTransform:'uppercase',
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? .4 : 1,
        transform: p && !disabled ? 'scale(.98)' : 'none', boxShadow: variant==='gradient' && h ? 'var(--shadow-glow)' : 'none', filter: variant==='gradient' && h ? 'brightness(1.08)' : 'none',
        transition:'background var(--dur-fast) var(--ease-cine), transform var(--dur-fast) var(--ease-cine), box-shadow var(--dur-base) var(--ease-cine)', ...style }} {...rest}>
      {iconLeft && <Icon name={iconLeft} size={s.ic} />}{children}{iconRight && <Icon name={iconRight} size={s.ic} />}
    </button>);
}