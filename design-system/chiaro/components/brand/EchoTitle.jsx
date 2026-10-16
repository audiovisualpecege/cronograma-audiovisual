import React from 'react';
export function EchoTitle({ text, repeat = 5, size = 72, color = 'var(--chiaro-violeta)', align = 'center', style }) {
  return <div aria-label={text} style={{ textAlign:align, ...style }}>
    {Array.from({ length: repeat }).map((_, i) => <div key={i} aria-hidden={i>0} style={{ fontFamily:'var(--font-display)', fontWeight:800, fontSize:size, lineHeight:.9, textTransform:'uppercase', color, opacity: i === repeat - 1 ? 1 : 0.25 + 0.75 * (i / (repeat - 1)), clipPath: i === 0 ? 'inset(45% 0 0 0)' : undefined }}>{text}</div>)}</div>;
}