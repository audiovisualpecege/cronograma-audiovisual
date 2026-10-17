import { useState, type ReactNode } from 'react';

// Lista rolável que só desenha as linhas visíveis (US-002 EC-11): centenas de pessoas sem travar.
// As linhas têm altura fixa; nunca passam de MAX_RENDERED desenhadas ao mesmo tempo.
export const MAX_RENDERED = 50;
const OVERSCAN = 8;

interface VirtualListProps<T> {
  items: readonly T[];
  rowHeight: number;
  /** Altura da área rolável em pixels. */
  height: number;
  label: string;
  getKey: (item: T) => string;
  renderRow: (item: T) => ReactNode;
  empty?: ReactNode;
}

export function VirtualList<T>({ items, rowHeight, height, label, getKey, renderRow, empty }: VirtualListProps<T>) {
  const [scrollTop, setScrollTop] = useState(0);
  if (items.length === 0) return <>{empty}</>;
  const visible = Math.ceil(height / rowHeight);
  const first = Math.max(0, Math.floor(scrollTop / rowHeight) - OVERSCAN);
  const last = Math.min(items.length, first + Math.min(MAX_RENDERED, visible + OVERSCAN * 2));
  return (
    <div
      className="virtual-list"
      role="list"
      aria-label={label}
      aria-rowcount={items.length}
      style={{ height: Math.min(height, items.length * rowHeight), overflowY: 'auto', position: 'relative' }}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
    >
      <div style={{ height: items.length * rowHeight, position: 'relative' }}>
        {items.slice(first, last).map((item, i) => (
          <div
            key={getKey(item)}
            role="listitem"
            style={{ position: 'absolute', top: (first + i) * rowHeight, left: 0, right: 0, height: rowHeight }}
          >
            {renderRow(item)}
          </div>
        ))}
      </div>
    </div>
  );
}
