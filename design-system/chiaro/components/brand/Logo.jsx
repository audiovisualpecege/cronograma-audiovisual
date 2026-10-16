import React from 'react';
const FILES = { box:'chiaro-box', boxHorizontal:'chiaro-box-horizontal', chiaro:'chiaro', filmes:'chiaro-filmes', filmesHorizontal:'chiaro-filmes-horizontal', icon:'icone-chiaro' };
export function Logo({ variant = 'filmesHorizontal', inverse, height = 32, base = '', style }) {
  const f = FILES[variant] + (inverse ? '-white' : '');
  return <img src={base + 'assets/logos/' + f + '.png'} alt="Chiaro Filmes" style={{ height, width:'auto', display:'block', ...style }} />;
}