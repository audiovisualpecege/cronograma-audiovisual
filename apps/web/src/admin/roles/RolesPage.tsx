import { addDays, localDate, validateName } from '@cronograma/core';
import { useState, type FormEvent } from 'react';
import { byName, useTable, type EventRow, type JobRoleRow, type SectorRow, type ServiceTypeRow, type SlotRow } from '../../data/catalog';
import { firstError } from '../../data/messages';
import { PageTitle } from '../../layout/PageTitle';
import { useSyncEngine, useSyncState } from '../../sync/SyncProvider';
import { Button, Card, Checkbox, Input, Tag } from '../../ui/chiaro';
import { Dialog } from '../../ui/Dialog';
import { formatStamp } from '../../ui/format';
import { Select } from '../../ui/Select';
import { useCatalogSuggestions } from '../suggestions';

function RoleEditor({
  role,
  others,
  sectors,
  onSave,
  onCancel,
}: {
  role?: JobRoleRow;
  others: string[];
  sectors: SectorRow[];
  onSave: (name: string, sectorId: string | null, noHours: boolean) => void;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(role?.name ?? '');
  const [sectorId, setSectorId] = useState(role?.sector_id ?? '');
  const [noHours, setNoHours] = useState(role?.no_hours ?? false);
  const [tried, setTried] = useState(false);
  const check = validateName(name, others);
  function submit(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    if (!check.ok) return;
    onSave(check.value, sectorId || null, noHours);
    if (!role) {
      setName('');
      setNoHours(false);
      setTried(false);
    }
  }
  return (
    <form className="inline-form" onSubmit={submit} noValidate>
      <Input
        label={role ? 'Nome da função' : 'Nova função'}
        value={name}
        onChange={(e) => setName(e.target.value)}
        error={tried ? firstError(check.errors, ['name_required', 'name_taken']) : undefined}
      />
      <Select
        label="Setor"
        value={sectorId}
        onChange={(e) => setSectorId(e.target.value)}
        placeholder="Sem setor"
        options={sectors.filter((s) => !s.archived_at || s.id === sectorId).map((s) => ({ value: s.id, label: s.name }))}
      />
      <Checkbox label="Não ocupa horário (não soma horas nem bate com outras atividades)" checked={noHours} onChange={setNoHours} />
      <Button type="submit">{role ? 'Salvar' : 'Adicionar'}</Button>
      {onCancel && (
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      )}
    </form>
  );
}

export function RolesPage() {
  const engine = useSyncEngine();
  const { pendingRows } = useSyncState();
  const roles = useTable<JobRoleRow>('job_roles');
  const types = useTable<ServiceTypeRow>('service_types');
  const sectors = [...(useTable<SectorRow>('sectors') ?? [])].sort(byName);
  const suggestions = useCatalogSuggestions(roles, types);
  const slots = useTable<SlotRow>('slots') ?? [];
  const events = useTable<EventRow>('events') ?? [];
  const [editing, setEditing] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<JobRoleRow | null>(null);
  const list = [...(roles ?? [])].sort(byName);
  const sectorName = new Map(sectors.map((s) => [s.id, s.name]));
  const names = (except?: string) => list.filter((r) => r.id !== except).map((r) => r.name);

  function save(id: string, name: string, sectorId: string | null, noHours: boolean) {
    void engine.enqueue(
      'job_role.upsert',
      { id, name, sector_id: sectorId, no_hours: noHours },
      { target: { table: 'job_roles', id, changes: { name, sector_id: sectorId, no_hours: noHours } } },
    );
    setEditing(null);
  }

  function archive(r: JobRoleRow, archived: boolean) {
    void engine.enqueue(
      'job_role.archive',
      { id: r.id, archived },
      { target: { table: 'job_roles', id: r.id, changes: { archived_at: archived ? new Date().toISOString() : null } } },
    );
  }

  // Vagas da função em semanas ainda não arquivadas (US-004 EC-3).
  function futureSlots(roleId: string) {
    const today = localDate(new Date());
    const byId = new Map(events.map((e) => [e.id, e]));
    return slots
      .filter((s) => s.job_role_id === roleId && !s.archived_at)
      .flatMap((s) => {
        const e = byId.get(s.event_id);
        return e && addDays(e.week_start, 7) > today && e.status !== 'cancelled' ? [{ id: s.id, title: e.title, startsAt: e.starts_at }] : [];
      })
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  }

  function askArchive(r: JobRoleRow) {
    if (!r.archived_at && futureSlots(r.id).length > 0) setConfirming(r);
    else archive(r, !r.archived_at);
  }

  return (
    <section className="page">
      <PageTitle black="FUNÇÕES" />
      {confirming && (
        <Dialog
          open
          title={`Arquivar ${confirming.name}`}
          onClose={() => setConfirming(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setConfirming(null)}>
                Cancelar
              </Button>
              <Button
                onClick={() => {
                  archive(confirming, true);
                  setConfirming(null);
                }}
              >
                Arquivar função
              </Button>
            </>
          }
        >
          <p>Estas vagas das próximas semanas ficam com o aviso "função arquivada" até serem revistas:</p>
          <ul className="plain-list">
            {futureSlots(confirming.id).map((v) => (
              <li key={v.id}>
                <strong>{v.title}</strong> {formatStamp(v.startsAt)}
              </li>
            ))}
          </ul>
        </Dialog>
      )}
      <Card variant="raised" padding={20}>
        <RoleEditor others={names()} sectors={sectors} onSave={(name, sectorId, noHours) => save(crypto.randomUUID(), name, sectorId, noHours)} />
      </Card>

      {suggestions.roles.length > 0 && (
        <Card variant="default" padding={20} style={{ marginTop: 'var(--space-4)' }}>
          <h2 className="section-title">Sugestões do histórico</h2>
          <p className="form-text">Funções que aparecem nas planilhas e ainda não estão no cadastro. Toque para adicionar.</p>
          <div className="tag-row" aria-label="Funções sugeridas">
            {suggestions.roles.map((name) => (
              <Tag key={name} onClick={() => save(crypto.randomUUID(), name, null, false)}>
                Adicionar {name}
              </Tag>
            ))}
          </div>
        </Card>
      )}

      <ul className="catalog-list" aria-label="Funções">
        {list.map((r) =>
          editing === r.id ? (
            <li key={r.id} className="catalog-item">
              <RoleEditor role={r} others={names(r.id)} sectors={sectors} onSave={(name, sectorId, noHours) => save(r.id, name, sectorId, noHours)} onCancel={() => setEditing(null)} />
            </li>
          ) : (
            <li key={r.id} className="catalog-item">
              <span className="catalog-item-name">
                {r.name}
                {r.code && <span className="list-row-code">{r.code}</span>}
              </span>
              {r.sector_id && <span className="list-row-sub">{sectorName.get(r.sector_id)}</span>}
              {r.no_hours && <span className="list-row-sub">não ocupa horário</span>}
              {r.archived_at && <Tag>arquivada</Tag>}
              {pendingRows.has(`job_roles:${r.id}`) && <Tag>a enviar</Tag>}
              <span className="catalog-item-actions">
                <Button size="sm" variant="ghost" onClick={() => setEditing(r.id)}>
                  Editar
                </Button>
                <Button size="sm" variant="ghost" onClick={() => askArchive(r)}>
                  {r.archived_at ? 'Reativar' : 'Arquivar'}
                </Button>
              </span>
            </li>
          ),
        )}
      </ul>
      {roles && list.length === 0 && suggestions.roles.length === 0 && (
        <p className="form-text">Nenhuma função cadastrada ainda. Importe as planilhas para receber sugestões.</p>
      )}
      <p className="form-text page-note">
        Arquivar uma função tira ela das escalas novas; as vagas futuras dessa função ficam com o aviso "função arquivada" até serem revistas.
      </p>
    </section>
  );
}
