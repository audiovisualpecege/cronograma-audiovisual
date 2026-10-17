import { localDate, localTime, NOTES_MAX, weekStartOf, zonedTime } from '@cronograma/core';
import { useState, type FormEvent } from 'react';
import type { EventRow, ServiceTypeRow } from '../data/catalog';
import { VALIDATION_MESSAGES } from '../data/messages';
import { useSyncEngine } from '../sync/SyncProvider';
import { Button, Input, Radio } from '../ui/chiaro';
import { Dialog } from '../ui/Dialog';
import { Select } from '../ui/Select';
import { sendAndRefresh } from '../week/useWeek';

interface FormProps {
  /** Atividade a editar; sem ela, cria uma nova no dia indicado. */
  event?: EventRow;
  defaultDate: string;
  types: readonly ServiceTypeRow[];
  /** A atividade já tem gente escalada: trocar o tipo pede manter ou refazer as vagas. */
  hasPeople?: boolean;
  onClose: () => void;
  onSaved?: (id: string) => void;
}

/** Atividade interna criada na plataforma (ADR-010): título, horário e local editáveis aqui. */
export function InternalEventForm({ event, defaultDate, types, hasPeople = false, onClose, onSaved }: FormProps) {
  const engine = useSyncEngine();
  const [id] = useState(() => event?.id ?? crypto.randomUUID());
  const start0 = event ? new Date(event.starts_at) : null;
  const end0 = event ? new Date(event.ends_at) : null;
  const [title, setTitle] = useState(event?.title ?? '');
  const [date, setDate] = useState(start0 ? localDate(start0) : defaultDate);
  const [startTime, setStartTime] = useState(start0 ? localTime(start0) : '09:00');
  const [endTime, setEndTime] = useState(end0 ? localTime(end0) : '12:00');
  const [location, setLocation] = useState(event?.location ?? '');
  const [description, setDescription] = useState(event?.description ?? '');
  const [typeId, setTypeId] = useState(event?.service_type_id ?? '');
  const [notes, setNotes] = useState(event?.notes ?? '');
  const [mode, setMode] = useState<'keep' | 'rebuild'>('keep');
  const [tried, setTried] = useState(false);

  const startsAt = date ? zonedTime(date, startTime) : null;
  const endsAt = date ? zonedTime(date, endTime) : null;
  const errors = {
    title: !title.trim() ? 'Informe o título.' : undefined,
    date: !date ? 'Informe o dia.' : undefined,
    end: startsAt && endsAt && endsAt <= startsAt ? VALIDATION_MESSAGES.end_before_start : undefined,
    notes: notes.length > NOTES_MAX ? VALIDATION_MESSAGES.notes_too_long : undefined,
  };
  const typeChanged = Boolean(event) && (typeId || null) !== (event?.service_type_id ?? null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    if (Object.values(errors).some(Boolean) || !startsAt || !endsAt) return;
    const fields = {
      title: title.trim(),
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      all_day: false,
      location: location.trim() || null,
      description: description.trim() || null,
      service_type_id: typeId || null,
      notes: notes.trim() || null,
    };
    const payload = { id, ...fields, ...(typeChanged && hasPeople ? { mode } : {}) };
    await engine.enqueue('event.internal_upsert', payload, {
      baseVersion: event?.version ?? null,
      target: {
        table: 'events',
        id,
        changes: { ...fields, origin: 'internal', week_start: weekStartOf(startsAt), status: event?.status ?? 'active', type_certainty: typeId ? 'alta' : 'baixa', type_source: 'admin' },
      },
    });
    void sendAndRefresh(engine, ['events', 'slots', 'assignments']);
    onSaved?.(id);
    onClose();
  }

  const options = [{ value: '', label: 'a definir' }, ...types.filter((t) => !t.archived_at || t.id === event?.service_type_id).map((t) => ({ value: t.id, label: t.name }))];
  return (
    <Dialog open onClose={onClose} title={event ? 'Editar atividade interna' : 'Nova atividade interna'} width={600}>
      <form className="form-stack" onSubmit={(e) => void submit(e)} noValidate aria-label="Atividade interna">
        <Input label="Título" value={title} onChange={(e) => setTitle(e.target.value)} error={tried ? errors.title : undefined} />
        <div className="form-grid">
          <Input label="Dia" type="date" value={date} onChange={(e) => setDate(e.target.value)} error={tried ? errors.date : undefined} />
          <Input label="Início" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          <Input label="Fim" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} error={tried ? errors.end : undefined} />
        </div>
        <Input label="Local" value={location} onChange={(e) => setLocation(e.target.value)} />
        <Input label="Descrição" multiline rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        <Select label="Tipo de serviço" value={typeId} onChange={(e) => setTypeId(e.target.value)} options={options} hint="Sem tipo, a atividade fica sem vagas até você escolher." />
        {typeChanged && hasPeople && (
          <fieldset className="check-group">
            <legend className="field-label">A atividade já tem pessoas escaladas</legend>
            <Radio name="modo" label="Manter as vagas atuais" checked={mode === 'keep'} onChange={() => setMode('keep')} />
            <Radio name="modo" label="Refazer as vagas pelo tipo novo" checked={mode === 'rebuild'} onChange={() => setMode('rebuild')} />
          </fieldset>
        )}
        <Input
          label="Observações"
          multiline
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          hint={`${notes.length} de 2.000 caracteres`}
          error={tried ? errors.notes : undefined}
        />
        <div className="dialog-actions">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit">{event ? 'Salvar' : 'Criar atividade'}</Button>
        </div>
      </form>
    </Dialog>
  );
}
