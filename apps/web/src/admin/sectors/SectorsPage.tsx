import { validateName } from '@cronograma/core';
import { useState, type FormEvent } from 'react';
import { byName, useTable, type SectorRow } from '../../data/catalog';
import { firstError } from '../../data/messages';
import { PageTitle } from '../../layout/PageTitle';
import { useSyncEngine, useSyncState } from '../../sync/SyncProvider';
import { Button, Card, Input, Tag } from '../../ui/chiaro';

/** Linha de cadastro simples com renomear e arquivar (setores e funções). */
export function NameEditor({
  initial,
  others,
  label,
  onSave,
  onCancel,
}: {
  initial: string;
  others: string[];
  label: string;
  onSave: (name: string) => void;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(initial);
  const [tried, setTried] = useState(false);
  const check = validateName(name, others);
  function submit(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    if (!check.ok) return;
    onSave(check.value);
    if (!onCancel) {
      setName('');
      setTried(false);
    }
  }
  return (
    <form className="inline-form" onSubmit={submit} noValidate>
      <Input label={label} value={name} onChange={(e) => setName(e.target.value)} error={tried ? firstError(check.errors, ['name_required', 'name_taken']) : undefined} />
      <Button type="submit">{onCancel ? 'Salvar' : 'Adicionar'}</Button>
      {onCancel && (
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      )}
    </form>
  );
}

export function SectorsPage() {
  const engine = useSyncEngine();
  const { pendingRows } = useSyncState();
  const sectors = useTable<SectorRow>('sectors');
  const [editing, setEditing] = useState<string | null>(null);
  const list = [...(sectors ?? [])].sort(byName);
  const names = (except?: string) => list.filter((s) => s.id !== except).map((s) => s.name);

  function save(id: string, name: string) {
    void engine.enqueue('sector.upsert', { id, name }, { target: { table: 'sectors', id, changes: { name } } });
    setEditing(null);
  }

  function archive(s: SectorRow, archived: boolean) {
    void engine.enqueue(
      'sector.archive',
      { id: s.id, archived },
      { target: { table: 'sectors', id: s.id, changes: { archived_at: archived ? new Date().toISOString() : null } } },
    );
  }

  return (
    <section className="page">
      <PageTitle black="SETORES" />
      <Card variant="raised" padding={20}>
        <NameEditor initial="" others={names()} label="Novo setor" onSave={(name) => save(crypto.randomUUID(), name)} />
      </Card>
      <ul className="catalog-list" aria-label="Setores">
        {list.map((s) =>
          editing === s.id ? (
            <li key={s.id} className="catalog-item">
              <NameEditor initial={s.name} others={names(s.id)} label="Nome do setor" onSave={(name) => save(s.id, name)} onCancel={() => setEditing(null)} />
            </li>
          ) : (
            <li key={s.id} className="catalog-item">
              <span className="catalog-item-name">{s.name}</span>
              {s.archived_at && <Tag>arquivado</Tag>}
              {pendingRows.has(`sectors:${s.id}`) && <Tag>a enviar</Tag>}
              <span className="catalog-item-actions">
                <Button size="sm" variant="ghost" onClick={() => setEditing(s.id)}>
                  Renomear
                </Button>
                <Button size="sm" variant="ghost" onClick={() => archive(s, !s.archived_at)}>
                  {s.archived_at ? 'Reativar' : 'Arquivar'}
                </Button>
              </span>
            </li>
          ),
        )}
      </ul>
      {sectors && list.length === 0 && <p className="form-text">Nenhum setor cadastrado ainda.</p>}
    </section>
  );
}
