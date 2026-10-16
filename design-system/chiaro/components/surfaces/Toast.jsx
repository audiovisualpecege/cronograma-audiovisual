import React from 'react';
import { Icon } from '../core/Icon.jsx';
export function Toast({ tone = 'default', title, message, onClose, style }) {
  const ic = { default:'stars-minimalistic', success:'check', danger:'danger-triangle' }[tone];
  const c = { default:'var(--chiaro-lavanda)', success:'var(--success)', danger:'var(--danger)' }[tone];
  return <div role="status" style={{ display:'flex', gap:12, alignItems:'flex-start', width:360, maxWidth:'100%', padding:'14px 16px', borderRadius:'var(--radius-lg)', background:'var(--chiaro-noite)', color:'#fff', boxShadow:'var(--shadow-lg)', ...style }}>
    <span style={{ width:32, height:32, borderRadius:999, background:c, display:'flex', alignItems:'center', justifyContent:'center', flex:'none' }}><Icon name={ic} weight="bold" size={16} /></span>
    <div style={{ flex:1 }}>{title && <div style={{ font:'700 14px var(--font-display)' }}>{title}</div>}{message && <div style={{ font:'400 13px/1.45 var(--font-body)', color:'#B9B1CC', marginTop:2 }}>{message}</div>}</div>
    {onClose && <span onClick={onClose} style={{ cursor:'pointer', opacity:.6, display:'flex' }}><Icon name="close" size={16} /></span>}</div>;
}