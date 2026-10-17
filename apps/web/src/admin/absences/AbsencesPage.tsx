import { addDays, ABSENCE_CONFIRM_DAYS, localDate, localTime, mergeAbsences, validateAbsence, zonedTime } from '@cronograma/core';
import { useMemo, useState, type FormEvent } from 'react';
import { byName, useTable, type AbsenceKind, type AbsenceRow, type PersonRow } from '../../data/catalog';
import { ABSENCE_KIND_LABEL, firstError } from '../../data/messages';
import { PageTitle } from '../../layout/PageTitle';
import { navigate, useHash } from '../../router';
import { useSyncEngine, useSyncState } from '../../sync/SyncProvider';
import { Button, Card, Checkbox, Input, Tag } from '../../ui/chiaro';
import { Dialog } from '../../ui/Dialog';
import { formatDay, formatStamp } from '../../ui/format';
import { Select } from '../../ui/Select';

const KINDS: { value: AbsenceKind; label: string }[] = [
  { value: 'folga', label: 'Folga' },
  { value: 'ferias', label: 'Férias' },
  { value: 'ausencia', label: 'Ausência' },
];

/** Período em texto: datas quando cobre dias inteiros, data e hora quando é intervalo de horas. */
export function periodText(startsAt: Date, endsAt: Date): string {
  const wholeDays = localTime(startsAt) === '00:00' && localTime(endsAt) === '00:00';
  if (!wholeDays) return `${formatStamp(startsAt)} até ${formatStamp(endsAt)}`;
  const last = addDays(localDate(endsAt), -1);
  const first = localDate(startsAt);
  return first === last ? formatDay(startsAt) : `${formatDay(startsAt)} a ${formatDay(zonedTime(last))}`;
}

function AbsenceForm({ personId, absence, onClose }: { personId: string; absence?: AbsenceRow; onClose: () => void }) {
  const engine = useSyncEngine();
  const [id] = useState(() => absence?.id ?? crypto.randomUUID());
  const [kind, setKind] = useState<AbsenceKind>(absence?.kind ?? 'folga');
  const [allDay, setAllDay] = useState(absence?.all_day ?? true);
  const start0 = absence ? new Date(absence.starts_at) : null;
  const end0 = absence ? new Date(absence.ends_at) : null;
  const [startDay, setStartDay] = useState(start0 ? localDate(start0) : '');
  const [endDay, setEndDay] = useState(end0 ? (absence?.all_day ? addDays(localDate(end0), -1) : localDate(end0)) : '');
  const [startTime, setStartTime] = useState(start0 && !absence?.all_day ? localTime(start0) : '08:00');
  const [endTime, setEndTime] = useState(end0 && !absence?.all_day ? localTime(end0) : '18:00');
  const [note, setNote] = useState(absence?.note ?? '');
  const [tried, setTried] = useState(false);
  const [confirmLong, setConfirmLong] = useState(false);

  const filled = startDay !== '' && (endDay !== '' || !allDay);
  const startsAt = filled ? zonedTime(startDay, allDay ? '00:00' : startTime) : null;
  const endsAt = filled ? (allDay ? zonedTime(addDays(endDay, 1)) : zonedTime(endDay || startDay, endTime)) : null;
  const check = startsAt && endsAt ? validateAbsence({ startsAt, endsAt, note }) : null;
  const errors = tried && check ? check.errors : [];

  async function save() {
    if (!startsAt || !endsAt) return;
    const fields = {
      person_id: personId,
      kind,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      all_day: allDay,
      note: note.trim() || null,
    };
    await engine.enqueue('absence.upsert', { id, ...fields }, { target: { table: 'absences', id, changes: { ...fields, archived_at: null } } });
    onClose();
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    if (!check || !check.ok) return;
    if (check.needsConfirmation) setConfirmLong(true);
    else void save();
  }

  const days = startsAt && endsAt ? Math.round((endsAt.getTime() - startsAt.getTime()) / 86_400_000) : 0;
  return (
    <Dialog open onClose={onClose} title={absence ? 'Editar ausência' : 'Nova ausência'} width={560}>
      <form className="form-stack" onSubmit={submit} noValidate aria-label="Ausência">
        <Select label="Tipo" value={kind} onChange={(e) => setKind(e.target.value as AbsenceKind)} options={KINDS} />
        <Checkbox label="Dia inteiro" checked={allDay} onChange={setAllDay} />
        <div className="form-grid">
          <Input label="Início" type="date" value={startDay} onChange={(e) => setStartDay(e.target.value)} error={tried && !startDay ? 'Informe o início.' : undefined} />
          {!allDay && <Input label="Hora de início" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />}
        </div>
        <div className="form-grid">
          <Input
            label={allDay ? 'Último dia' : 'Fim'}
            type="date"
            value={endDay}
            onChange={(e) => setEndDay(e.target.value)}
            error={tried && allDay && !endDay ? 'Informe o último dia.' : firstError(errors, ['end_before_start'])}
          />
          {!allDay && <Input label="Hora do fim" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />}
        </div>
        <Input label="Observação" multiline rows={3} value={note} onChange={(e) => setNote(e.target.value)} error={firstError(errors, ['notes_too_long'])} />
        <div className="dialog-actions">
          <span className="dialog-actions-spacer" />
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit">Salvar</Button>
        </div>
      </form>
      {confirmLong && (
        <Dialog
          open
          title="Ausência longa"
          onClose={() => setConfirmLong(false)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setConfirmLong(false)}>
                Revisar as datas
              </Button>
              <Button onClick={() => void save()}>Salvar mesmo assim</Button>
            </>
          }
        >
          <p>
            Esta ausência tem {days} dias, mais de {ABSENCE_CONFIRM_DAYS}. Confira as datas antes de salvar.
          </p>
        </Dialog>
      )}
    </Dialog>
  );
}

export function AbsencesPage() {
  const engine = useSyncEngine();
  const { pendingRows } = useSyncState();
  const people = [...(useTable<PersonRow>('people') ?? [])].filter((p) => p.active).sort(byName);
  const absences = useTable<AbsenceRow>('absences');
  const { query } = useHash();
  const personId = query.get('pessoa') ?? '';
  const [editing, setEditing] = useState<AbsenceRow | 'new' | null>(null);

  const mine = useMemo(
    () => (absences ?? []).filter((a) => a.person_id === personId && !a.archived_at).sort((a, b) => a.starts_at.localeCompare(b.starts_at)),
    [absences, personId],
  );
  const periods = useMemo(
    () => mergeAbsences(mine.map((a) => ({ personId: a.person_id, startsAt: new Date(a.starts_at), endsAt: new Date(a.ends_at), archived: false }))),
    [mine],
  );

  function remove(a: AbsenceRow) {
    void engine.enqueue('absence.archive', { id: a.id }, { target: { table: 'absences', id: a.id, changes: { archived_at: new Date().toISOString() } } });
  }

  return (
    <section className="page">
      <PageTitle black="AUSÊNCIAS" />
      <div className="filter-bar">
        <Select
          label="Pessoa"
          value={personId}
          onChange={(e) => navigate(e.target.value ? `/admin/ausencias?pessoa=${e.target.value}` : '/admin/ausencias', { replace: true })}
          placeholder="Escolha a pessoa"
          options={people.map((p) => ({ value: p.id, label: p.name }))}
        />
        {personId && <Button onClick={() => setEditing('new')}>Nova ausência</Button>}
      </div>

      {!personId && <p className="form-text">Escolha a pessoa para ver e registrar folgas, férias e ausências.</p>}

      {personId && (
        <>
          <Card variant="raised" padding={20}>
            <h2 className="section-title">Períodos indisponíveis</h2>
            {periods.length === 0 ? (
              <p className="form-text">Nenhuma ausência registrada.</p>
            ) : (
              <ul className="plain-list" aria-label="Períodos indisponíveis">
                {periods.map((p) => (
                  <li key={p.startsAt.toISOString()}>{periodText(p.startsAt, p.endsAt)}</li>
                ))}
              </ul>
            )}
            {periods.length < mine.length && <p className="form-text">Ausências sobrepostas aparecem como um período contínuo.</p>}
          </Card>
          <ul className="catalog-list" aria-label="Ausências registradas">
            {mine.map((a) => (
              <li key={a.id} className="catalog-item">
                <span className="catalog-item-name">
                  {ABSENCE_KIND_LABEL[a.kind]}: {periodText(new Date(a.starts_at), new Date(a.ends_at))}
                </span>
                {a.note && <span className="list-row-sub">{a.note}</span>}
                {pendingRows.has(`absences:${a.id}`) && <Tag>a enviar</Tag>}
                <span className="catalog-item-actions">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(a)}>
                    Editar
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(a)}>
                    Apagar
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {editing && personId && (
        <AbsenceForm key={editing === 'new' ? 'nova' : editing.id} personId={personId} absence={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />
      )}
    </section>
  );
}
