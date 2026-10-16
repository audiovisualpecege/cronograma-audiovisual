import React from 'react';
export function SectionTitle({ light, bold, eyebrow, size = 64, color = 'var(--text-brand)', align = 'left', as = 'h2', style }) {
  const H = as;
  return <div style={{ textAlign:align, ...style }}>
    {eyebrow && <div style={{ font:'800 16px var(--font-display)', letterSpacing:'.06em', textTransform:'uppercase', color:'var(--text-primary)', marginBottom:12 }}>{eyebrow}</div>}
    <H style={{ margin:0, fontFamily:'var(--font-display)', fontSize:size, lineHeight:.95, textTransform:'uppercase', color, letterSpacing:'-.005em' }}>
      {light && <span style={{ fontWeight:300 }}>{light}{bold ? ' ' : ''}</span>}{bold && <span style={{ fontWeight:800 }}>{bold}</span>}</H></div>;
}