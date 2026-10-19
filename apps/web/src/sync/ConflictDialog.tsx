import { useMemo, useState } from 'react';
import { Badge, Button } from '../ui/chiaro';
import { Dialog } from '../ui/Dialog';
import { Toast } from '../ui/Toast';
import { useLocalQuery, useSyncEngine, useSyncState } from './SyncProvider';
import type { ConflictEntry, OpKind, Row } from './types';

export const OP_LABELS: Record<OpKind, string> = {
  'person.upsert': 'Cadastro de pessoa',
  'person.deactivate': 'Desativar pessoa',
  'person.reactivate': 'Reativar pessoa',
  'absence.upsert': 'Ausência',
  'absence.archive': 'Remover ausência',
  'sector.upsert': 'Setor',
  'sector.archive': 'Arquivar setor',
  'calendar_source.upsert': 'Agenda',
  'calendar_source.remove': 'Remover agenda',
  'job_role.upsert': 'Função',
  'job_role.archive': 'Arquivar função',
  'service_type.upsert': 'Tipo de serviço',
  'service_type.archive': 'Arquivar tipo de serviço',
  'event.update_extras': 'Dados extras do evento',
  'event.internal_upsert': 'Atividade interna',
  'event.internal_cancel': 'Cancelar atividade interna',
  'event.mark_reviewed': 'Revisão do evento',
  'event.resolve_duplicate': 'Evento duplicado',
  'week.build': 'Montar semana',
  'slot.add': 'Vaga a mais',
  'slot.remove': 'Remover vaga',
  'assignment.set': 'Escala',
  'assignment.clear': 'Tirar da escala',
  'assignment.lock': 'Travar alocação',
  'assignment.accept': 'Aceitar proposta',
  'assignment.discard': 'Descartar proposta',
  'settings.update': 'Configuração',
};

const FIELD_LABELS: Record<string, string> = {
  person_id: 'Pessoa',
  job_role_id: 'Função',
  event_id: 'Evento',
  slot_id: 'Vaga',
  service_type_id: 'Tipo de serviço',
  status: 'Situação',
  locked: 'Travada',
  override: 'Escalar mesmo assim',
  notes: 'Observações',
  no_team: 'Não exige equipe',
  title: 'Título',
  starts_at: 'Início',
  ends_at: 'Fim',
  name: 'Nome',
  reason: 'Motivo',
};

// Campos técnicos que não ajudam a escolher.
const HIDDEN = new Set(['id', 'slot_id', 'version', 'updated_at', 'created_at', 'decided_by', 'decided_at', 'fingerprint', 'week_start']);

type Names = Map<string, string>;

function display(value: unknown, names: Names): string {
  if (value === null || value === undefined || value === '') return 'vazio';
  if (typeof value === 'boolean') return value ? 'sim' : 'não';
  if (typeof value === 'string') return names.get(value) ?? value;
  if (Array.isArray(value)) return value.length ? value.map((v) => display(v, names)).join(', ') : 'vazio';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** Campos da mudança local comparados com a linha do servidor. */
export function conflictFields(conflict: ConflictEntry): { key: string; label: string; mine: unknown; server: unknown }[] {
  const local = (conflict.local && typeof conflict.local === 'object' ? conflict.local : conflict.op.payload) as Record<string, unknown>;
  const server = (conflict.server ?? {}) as Record<string, unknown>;
  return Object.keys(local ?? {})
    .filter((k) => !HIDDEN.has(k))
    .map((key) => ({ key, label: FIELD_LABELS[key] ?? key.replace(/_/g, ' '), mine: local[key], server: server[key] }));
}

function useNames(conflict: ConflictEntry | undefined): Names {
  const ids = useMemo(() => {
    if (!conflict) return [];
    const out = new Set<string>();
    for (const f of conflictFields(conflict)) {
      for (const v of [f.mine, f.server]) if (typeof v === 'string' && f.key.endsWith('_id')) out.add(v);
    }
    return [...out];
  }, [conflict]);
  return (
    useLocalQuery(async (store) => {
      const names: Names = new Map();
      const sources: [Parameters<typeof store.mirror>[0], string][] = [
        ['people_public', 'name'], ['job_roles', 'name'], ['events', 'title'], ['service_types', 'name'],
      ];
      for (const [table, column] of sources) {
        const rows = (await store.mirror(table).bulkGet(ids)) as (Row | undefined)[];
        for (const r of rows) if (r && typeof r[column] === 'string') names.set(r.id, r[column] as string);
      }
      return names;
    }, [ids.join(',')]) ?? new Map()
  );
}

/** Conflito explícito (US-026 AC-3): mostra as duas versões e a pessoa escolhe; nada se perde em silêncio. */
export function ConflictDialog() {
  const engine = useSyncEngine();
  const { conflicts } = useSyncState();
  // Fechar adia só o conflito da vez; um conflito novo abre de novo, e o selo da barra reabre.
  const [postponed, setPostponed] = useState<string | null>(null);
  const conflict = conflicts[0];
  const names = useNames(conflict);
  if (!conflict) return null;
  const open = conflict.opId !== postponed;
  const fields = conflictFields(conflict);
  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setPostponed(null)}>
        {conflicts.length === 1 ? '1 conflito' : `${conflicts.length} conflitos`}
      </Button>
      <Dialog
        open={open}
        onClose={() => setPostponed(conflict.opId)}
        title="Conflito de edição"
        width={640}
        footer={
          <>
            <Button variant="secondary" onClick={() => void engine.resolveConflict(conflict.opId, 'server')}>
              Ficar com a do servidor
            </Button>
            <Button onClick={() => void engine.resolveConflict(conflict.opId, 'mine')}>Ficar com a minha versão</Button>
          </>
        }
      >
        <p style={{ marginTop: 0 }}>
          {OP_LABELS[conflict.op.kind]}: outra pessoa mudou isto enquanto você estava sem internet. Escolha qual versão vale.
          {conflicts.length > 1 && ` Há mais ${conflicts.length - 1} para resolver depois deste.`}
        </p>
        <div className="conflict-grid">
          <div className="conflict-col" aria-label="Minha versão">
            <h3 className="conflict-col-title">Minha versão</h3>
            {fields.map((f) => (
              <p key={f.key} className="conflict-field">
                <span className="conflict-field-label">{f.label}</span>
                <span>{display(f.mine, names)}</span>
              </p>
            ))}
          </div>
          <div className="conflict-col" aria-label="Versão do servidor">
            <h3 className="conflict-col-title">Versão do servidor</h3>
            {fields.map((f) => (
              <p key={f.key} className="conflict-field">
                <span className="conflict-field-label">{f.label}</span>
                <span>{display(f.server, names)}</span>
              </p>
            ))}
          </div>
        </div>
      </Dialog>
    </>
  );
}

/** Mudanças recusadas pelo servidor, com o motivo (US-026 EC-3). */
export function RejectionToasts() {
  const engine = useSyncEngine();
  const { rejections } = useSyncState();
  if (rejections.length === 0) return null;
  return (
    <div className="toast-stack">
      {rejections.map((r) => (
        <Toast
          key={r.opId}
          tone="danger"
          title="Mudança recusada"
          message={`${OP_LABELS[r.kind]}: ${r.message}`}
          onClose={() => void engine.dismissRejection(r.opId)}
        />
      ))}
    </div>
  );
}

/** Contagem do que está guardado no aparelho esperando envio. */
export function PendingCount() {
  const { pending } = useSyncState();
  if (pending === 0) return null;
  return (
    <Badge tone="warm">
      <span data-testid="pending-count">{pending}</span>&nbsp;a enviar
    </Badge>
  );
}
