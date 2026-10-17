import type { CSSProperties } from 'react';
import { Tag } from '../ui/chiaro';

// Selos da escala (TechSpec, casos que o design system não cobre): sempre Tag em pílula com texto.
// "hoje" em Lavanda, "mudou" em Pêssego, "cancelado" em --danger, "a definir" e "interna" em
// --accent-soft, "proposta" com borda tracejada Lavanda; os demais na forma padrão da Tag.
export type SealKind = 'hoje' | 'mudou' | 'cancelado' | 'soft' | 'proposta' | 'plain';

const STYLE: Record<SealKind, CSSProperties> = {
  hoje: { background: 'var(--accent)', borderColor: 'var(--accent)', color: 'var(--text-on-brand)' },
  mudou: { background: 'var(--chiaro-pessego)', borderColor: 'var(--chiaro-pessego)', color: 'var(--chiaro-noite)' },
  cancelado: { background: 'var(--danger)', borderColor: 'var(--danger)', color: 'var(--chiaro-branco)' },
  soft: { background: 'var(--accent-soft)', borderColor: 'transparent' },
  proposta: { borderStyle: 'dashed', borderColor: 'var(--accent)', color: 'var(--text-brand)' },
  plain: {},
};

export function Seal({ kind = 'plain', children }: { kind?: SealKind; children: string }) {
  return (
    <Tag style={{ height: 26, padding: '0 10px', fontSize: 12, ...STYLE[kind] }}>
      <span data-seal={kind}>{children}</span>
    </Tag>
  );
}
