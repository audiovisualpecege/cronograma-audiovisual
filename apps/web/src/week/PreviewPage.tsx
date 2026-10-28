import { EVENT_SIZES, SIZE_LABEL, type EventSize, type SizeSuggestion } from '@cronograma/core';
import { sizeFor, type CalendarSourceRow, type EventRow, type ServiceTypeRow } from '../data/catalog';
import { isSimulating, learnPreviewSeries, setPreviewSize } from '../dev/sizePreview';
import type { SyncEngine } from '../sync/syncEngine';
import { formatStamp } from '../ui/format';

export const NO_EVENTS = 'Nenhum evento nesta semana';

/** Avisos de agenda desconectada: a semana continua com os últimos dados lidos (US-010 EC-10). */
export function SourceAlerts({ sources }: { sources: readonly CalendarSourceRow[] }) {
  const broken = sources.filter((s) => s.enabled && s.status === 'error');
  if (broken.length === 0) return null;
  return (
    <div className="source-alerts">
      {broken.map((s) => (
        <p key={s.id} className="form-message form-message--alert" role="alert">
          Agenda {s.label} desconectada desde {formatStamp(s.last_synced_at ?? s.updated_at)}. Mostrando os últimos dados lidos.
        </p>
      ))}
    </div>
  );
}

/**
 * Troca o tipo de serviço do evento pela fila; o tipo escolhido à mão vale com certeza alta e ensina a série
 * (no servidor, migração 0020; na simulação do app local, só neste navegador).
 */
export function changeType(engine: SyncEngine, e: EventRow, typeId: string | null, types: readonly ServiceTypeRow[] = []) {
  if (typeId && isSimulating()) learnPreviewSeries(e.title, typeId);
  // O evento novo copia o "não exige equipe" do tipo da agenda (serviço de fundo). Se a marca veio do tipo antigo,
  // ela segue o tipo novo: um evento lido como NAO ESCALAR e corrigido para GRAVACAO volta a ter vagas.
  const before = types.find((t) => t.id === e.service_type_id);
  const after = types.find((t) => t.id === typeId);
  const team = e.no_team && before?.no_team && !after?.no_team ? { no_team: false } : {};
  const changes = { service_type_id: typeId, type_certainty: typeId ? 'alta' : 'baixa', type_source: 'admin', ...team };
  return engine.enqueue('event.update_extras', { id: e.id, service_type_id: typeId, ...team }, { baseVersion: e.version, target: { table: 'events', id: e.id, changes } });
}

/**
 * Troca o porte do evento pela fila; as vagas são refeitas como numa troca de tipo. Na simulação do app local
 * (banco ainda sem a 0017), o porte fica só neste navegador.
 */
export function changeSize(engine: SyncEngine, e: EventRow, size: EventSize) {
  if (isSimulating()) return Promise.resolve(setPreviewSize(e.id, size, e.title));
  return engine.enqueue('event.update_extras', { id: e.id, size }, { baseVersion: e.version, target: { table: 'events', id: e.id, changes: { size } } });
}

/** Porte do evento de tipo com porte: os três botões e, quando há, a sugestão da série no histórico. */
export function SizeLine({
  event,
  type,
  readOnly,
  suggestion,
  onSize,
}: {
  event: EventRow;
  type: ServiceTypeRow;
  readOnly: boolean;
  suggestion?: SizeSuggestion;
  onSize: (e: EventRow, size: EventSize) => void;
}) {
  const current = sizeFor(type, event.size);
  const title = event.title || 'Sem título';
  if (readOnly || event.status === 'cancelled') return <span className="list-row-sub">Porte: {SIZE_LABEL[current]}</span>;
  return (
    <span className="size-line">
      <span className="size-picker" role="group" aria-label={`Porte de ${title}`}>
        {EVENT_SIZES.map((s) => (
          <button key={s} type="button" className={`size-option${s === current ? ' is-selected' : ''}`} aria-pressed={s === current} onClick={() => s !== current && onSize(event, s)}>
            {SIZE_LABEL[s]}
          </button>
        ))}
      </span>
      {suggestion && (
        <button type="button" className="text-button" onClick={() => onSize(event, suggestion.size)} aria-label={`Usar porte ${SIZE_LABEL[suggestion.size]} em ${title}`}>
          Usar {SIZE_LABEL[suggestion.size]}: {suggestion.people === 1 ? '1 pessoa' : `${suggestion.people} pessoas`} nas últimas vezes
        </button>
      )}
    </span>
  );
}
