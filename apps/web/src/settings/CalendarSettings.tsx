import { useMemo, useState, type FormEvent } from 'react';
import { useTable, type CalendarSourceRow, type EventRow } from '../data/catalog';
import { useSyncEngine, useSyncState } from '../sync/SyncProvider';
import { OnlineButton } from '../sync/OnlineButton';
import { Button, Card, Input, Tag } from '../ui/chiaro';
import { Dialog } from '../ui/Dialog';
import { formatStamp } from '../ui/format';
import { Switch } from '../ui/Switch';
import { isFinished, useJob, useRefreshWhenFinished } from './jobs';

const STATUS: Record<CalendarSourceRow['status'], string> = {
  connected: 'conectada',
  pending: 'aguardando a primeira leitura',
  error: 'não conectada',
};

const ID_INVALID = 'Informe o ID da agenda, como aparece nas configurações da Google Agenda.';
const ID_TAKEN = 'Esta agenda já está na lista.';

function checkId(raw: string, others: readonly CalendarSourceRow[]): { value: string; error?: string } {
  const value = raw.trim().toLowerCase();
  if (!value || /\s/.test(value)) return { value, error: ID_INVALID };
  if (others.some((s) => s.google_calendar_id === value)) return { value, error: ID_TAKEN };
  return { value };
}

/** ID e rótulo de uma agenda já cadastrada. Com eventos lidos, o ID fica travado (o serviço de fundo daria os antigos como cancelados). */
function SourceEditor({ source, others, hasEvents, onSave, onCancel }: {
  source: CalendarSourceRow;
  others: readonly CalendarSourceRow[];
  hasEvents: boolean;
  onSave: (calendarId: string, label: string) => void;
  onCancel: () => void;
}) {
  const [calendarId, setCalendarId] = useState(source.google_calendar_id);
  const [label, setLabel] = useState(source.label);
  const [tried, setTried] = useState(false);
  const id = checkId(calendarId, others);
  function submit(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    if (id.error) return;
    onSave(id.value, label.trim() || id.value.split('@')[0] || '');
  }
  return (
    <form className="inline-form" onSubmit={submit} noValidate aria-label={`Editar ${source.label}`}>
      <Input
        label="ID da agenda"
        value={calendarId}
        onChange={(e) => setCalendarId(e.target.value)}
        disabled={hasEvents}
        error={tried ? id.error : undefined}
        hint={hasEvents ? 'A agenda já tem eventos lidos: o ID não muda. Para trocar de agenda, desligue a leitura e adicione a certa.' : undefined}
      />
      <Input label="Rótulo" value={label} onChange={(e) => setLabel(e.target.value)} />
      <Button type="submit">Salvar</Button>
      <Button type="button" variant="ghost" onClick={onCancel}>
        Cancelar
      </Button>
    </form>
  );
}

export function CalendarSettings() {
  const engine = useSyncEngine();
  const { pendingRows, online } = useSyncState();
  const all = useTable<CalendarSourceRow>('calendar_sources') ?? [];
  const sources = [...all].filter((s) => !s.archived_at).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  const events = useTable<EventRow>('events');
  const withEvents = useMemo(() => new Set((events ?? []).map((e) => e.calendar_source_id).filter((id): id is string => !!id)), [events]);
  const [calendarId, setCalendarId] = useState('');
  const [label, setLabel] = useState('');
  const [tried, setTried] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [removing, setRemoving] = useState<CalendarSourceRow | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const job = useJob(jobId);
  useRefreshWhenFinished(job, ['calendar_sources']);

  const newId = checkId(calendarId, sources);

  async function readNow() {
    setRequestError(null);
    try {
      const res = await engine.runOnline((remote) => remote.rpc<{ job_id: string }>('request_job', { kind: 'calendar_sync', payload: {} }));
      setJobId(res.job_id);
    } catch {
      setRequestError('Não foi possível pedir a leitura agora. Tente de novo em instantes.');
    }
  }

  /** Com internet, a agenda nova (ou com ID novo) é lida na hora; sem internet, na próxima releitura. */
  async function readSoon() {
    if (!online) return;
    await engine.flush().catch(() => undefined);
    await readNow();
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    if (newId.error) return;
    const id = crypto.randomUUID();
    const fields = { google_calendar_id: newId.value, label: label.trim() || newId.value.split('@')[0], enabled: true };
    await engine.enqueue('calendar_source.upsert', { id, ...fields }, { target: { table: 'calendar_sources', id, changes: { ...fields, status: 'pending', last_synced_at: null, last_error: null } } });
    setCalendarId('');
    setLabel('');
    setTried(false);
    await readSoon();
  }

  async function save(s: CalendarSourceRow, google_calendar_id: string, newLabel: string) {
    setEditing(null);
    const idChanged = google_calendar_id !== s.google_calendar_id;
    const changes = idChanged
      ? { google_calendar_id, label: newLabel, status: 'pending', last_synced_at: null, last_error: null }
      : { label: newLabel };
    await engine.enqueue('calendar_source.upsert', { id: s.id, google_calendar_id, label: newLabel }, { target: { table: 'calendar_sources', id: s.id, changes } });
    if (idChanged && s.enabled) await readSoon();
  }

  function toggle(s: CalendarSourceRow, enabled: boolean) {
    void engine.enqueue('calendar_source.upsert', { id: s.id, enabled }, { target: { table: 'calendar_sources', id: s.id, changes: { enabled } } });
  }

  function remove(s: CalendarSourceRow) {
    setRemoving(null);
    void engine.enqueue('calendar_source.remove', { id: s.id }, { target: { table: 'calendar_sources', id: s.id, changes: { archived_at: new Date().toISOString(), enabled: false } } });
  }

  const reading = jobId !== null && !isFinished(job);
  const removingHasEvents = removing ? withEvents.has(removing.id) : false;
  return (
    <Card variant="raised" padding={24}>
      <section aria-labelledby="cfg-agendas">
        <h2 id="cfg-agendas" className="section-title">
          Google Agendas
        </h2>
        <p className="form-text">
          A plataforma só lê as agendas, nunca cria, altera ou apaga nada nelas. Compartilhe cada agenda com o e-mail da conta de serviço (veja o Como usar) e informe o ID dela aqui.
        </p>
        {removing && (
          <Dialog
            open
            title={`Remover ${removing.label}`}
            onClose={() => setRemoving(null)}
            footer={
              removingHasEvents ? (
                <>
                  <Button variant="secondary" onClick={() => setRemoving(null)}>
                    Fechar
                  </Button>
                  {removing.enabled && (
                    <Button
                      onClick={() => {
                        toggle(removing, false);
                        setRemoving(null);
                      }}
                    >
                      Desligar a leitura
                    </Button>
                  )}
                </>
              ) : (
                <>
                  <Button variant="secondary" onClick={() => setRemoving(null)}>
                    Cancelar
                  </Button>
                  <Button onClick={() => remove(removing)}>Remover agenda</Button>
                </>
              )
            }
          >
            {removingHasEvents ? (
              <p>
                Esta agenda já tem eventos lidos e não pode ser removida, para o histórico e as escalas não se perderem.
                {removing.enabled ? ' Desligue a leitura: ela para de ser lida e os eventos continuam na plataforma.' : ' A leitura dela já está desligada.'}
              </p>
            ) : (
              <p>
                A agenda <strong>{removing.google_calendar_id}</strong> sai da lista e deixa de ser lida. Nada muda na Google Agenda. Ela ainda não tem eventos na plataforma, então nada se perde.
              </p>
            )}
          </Dialog>
        )}
        <ul className="catalog-list" aria-label="Agendas">
          {sources.map((s) =>
            editing === s.id ? (
              <li key={s.id} className="catalog-item source-item" aria-label={s.label}>
                <SourceEditor
                  source={s}
                  others={sources.filter((o) => o.id !== s.id)}
                  hasEvents={withEvents.has(s.id)}
                  onSave={(id, newLabel) => void save(s, id, newLabel)}
                  onCancel={() => setEditing(null)}
                />
              </li>
            ) : (
              <li key={s.id} className="catalog-item source-item" aria-label={s.label}>
                <span className="list-row-main">
                  <span className="list-row-title">{s.label}</span>
                  <span className="list-row-sub">{s.google_calendar_id}</span>
                  <span className="list-row-sub">
                    {s.last_synced_at ? `Última leitura ${formatStamp(s.last_synced_at)}` : 'Ainda não lida'}
                    {s.status === 'error' && s.last_error ? `. ${s.last_error}` : ''}
                  </span>
                </span>
                <span className="list-row-tags">
                  <Tag>{s.enabled ? STATUS[s.status] : 'leitura desligada'}</Tag>
                  {pendingRows.has(`calendar_sources:${s.id}`) && <Tag>a enviar</Tag>}
                </span>
                <span className="catalog-item-actions">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(s.id)}>
                    Editar
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setRemoving(s)}>
                    Remover
                  </Button>
                </span>
                <Switch label={`Ler ${s.label}`} checked={s.enabled} onChange={(on) => toggle(s, on)} />
              </li>
            ),
          )}
        </ul>
        {sources.length === 0 && <p className="form-text">Nenhuma agenda conectada ainda.</p>}

        <form className="inline-form" onSubmit={(e) => void add(e)} noValidate aria-label="Adicionar agenda">
          <Input label="ID da agenda" placeholder="nome@gmail.com" value={calendarId} onChange={(e) => setCalendarId(e.target.value)} error={tried ? newId.error : undefined} />
          <Input label="Rótulo" placeholder="Como a agenda aparece na plataforma" value={label} onChange={(e) => setLabel(e.target.value)} />
          <Button type="submit">Adicionar agenda</Button>
        </form>

        <div className="dialog-actions">
          <OnlineButton variant="secondary" onClick={() => void readNow()} disabled={reading || sources.length === 0}>
            {reading ? 'Lendo as agendas' : 'Reler agora'}
          </OnlineButton>
        </div>
        {job?.status === 'done' && (
          <p className="form-message" role="status">
            Leitura concluída.
          </p>
        )}
        {job?.status === 'failed' && (
          <p className="form-message form-message--alert" role="alert">
            {job.error ?? 'A leitura falhou.'} Confira o compartilhamento das agendas e tente de novo.
          </p>
        )}
        {requestError && (
          <p className="form-message form-message--alert" role="alert">
            {requestError}
          </p>
        )}
      </section>
    </Card>
  );
}
