import React from 'react';
const CDN='https://cdn.jsdelivr.net/npm/@solar-icons/static@2.3.2/dist/icons/';
export function Icon({ name, weight = 'linear', size = 20, color = 'currentColor', style, ...rest }) {
  const url = 'url(' + CDN + weight + '/' + name + '.svg)';
  return <span aria-hidden="true" {...rest} style={{ display:'inline-block', flex:'none', width:size, height:size, background:color, WebkitMask:url+' center/contain no-repeat', mask:url+' center/contain no-repeat', ...style }} />;
}