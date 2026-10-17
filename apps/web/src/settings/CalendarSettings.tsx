import { useState, type FormEvent } from 'react';
import { useTable, type CalendarSourceRow } from '../data/catalog';
import { useSyncEngine, useSyncState } from '../sync/SyncProvider';
import { OnlineButton } from '../sync/OnlineButton';
import { Button, Card, Input, Tag } from '../ui/chiaro';
import { formatStamp } from '../ui/format';
import { Switch } from '../ui/Switch';
import { isFinished, useJob, useRefreshWhenFinished } from './jobs';

const STATUS: Record<CalendarSourceRow['status'], string> = {
  connected: 'conectada',
  pending: 'aguardando a primeira leitura',
  error: 'não conectada',
};

export function CalendarSettings() {
  const engine = useSyncEngine();
  const { pendingRows, online } = useSyncState();
  const sources = [...(useTable<CalendarSourceRow>('calendar_sources') ?? [])].sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  const [calendarId, setCalendarId] = useState('');
  const [label, setLabel] = useState('');
  const [tried, setTried] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const job = useJob(jobId);
  useRefreshWhenFinished(job, ['calendar_sources']);

  const cleanId = calendarId.trim().toLowerCase();
  const idError = !cleanId || /\s/.test(cleanId) ? 'Informe o ID da agenda, como aparece nas configurações da Google Agenda.' : sources.some((s) => s.google_calendar_id === cleanId) ? 'Esta agenda já está na lista.' : undefined;

  async function readNow() {
    setRequestError(null);
    try {
      const res = await engine.runOnline((remote) => remote.rpc<{ job_id: string }>('request_job', { kind: 'calendar_sync', payload: {} }));
      setJobId(res.job_id);
    } catch {
      setRequestError('Não foi possível pedir a leitura agora. Tente de novo em instantes.');
    }
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    if (idError) return;
    const id = crypto.randomUUID();
    const fields = { google_calendar_id: cleanId, label: label.trim() || cleanId.split('@')[0], enabled: true };
    await engine.enqueue('calendar_source.upsert', { id, ...fields }, { target: { table: 'calendar_sources', id, changes: { ...fields, status: 'pending', last_synced_at: null, last_error: null } } });
    setCalendarId('');
    setLabel('');
    setTried(false);
    // Com internet, a agenda nova é lida na hora; sem internet, na próxima releitura.
    if (online) {
      await engine.flush().catch(() => undefined);
      await readNow();
    }
  }

  function toggle(s: CalendarSourceRow, enabled: boolean) {
    void engine.enqueue('calendar_source.upsert', { id: s.id, enabled }, { target: { table: 'calendar_sources', id: s.id, changes: { enabled } } });
  }

  const reading = jobId !== null && !isFinished(job);
  return (
    <Card variant="raised" padding={24}>
      <section aria-labelledby="cfg-agendas">
        <h2 id="cfg-agendas" className="section-title">
          Google Agendas
        </h2>
        <p className="form-text">
          A plataforma só lê as agendas, nunca cria, altera ou apaga nada nelas. Compartilhe cada agenda com o e-mail da conta de serviço (veja o Como usar) e informe o ID dela aqui.
        </p>
        <ul className="catalog-list" aria-label="Agendas">
          {sources.map((s) => (
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
              <Switch label={`Ler ${s.label}`} checked={s.enabled} onChange={(on) => toggle(s, on)} />
            </li>
          ))}
        </ul>
        {sources.length === 0 && <p className="form-text">Nenhuma agenda conectada ainda.</p>}

        <form className="inline-form" onSubmit={(e) => void add(e)} noValidate aria-label="Adicionar agenda">
          <Input label="ID da agenda" placeholder="nome@gmail.com" value={calendarId} onChange={(e) => setCalendarId(e.target.value)} error={tried ? idError : undefined} />
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
