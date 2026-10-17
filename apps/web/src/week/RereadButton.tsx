import { useState } from 'react';
import { isFinished, useJob, useRefreshWhenFinished } from '../settings/jobs';
import { OnlineButton } from '../sync/OnlineButton';
import { useSyncEngine } from '../sync/SyncProvider';

/** "Reler agora" (US-011 AC-1): pede a leitura das agendas ao serviço de fundo e lê de novo os eventos. */
export function RereadButton() {
  const engine = useSyncEngine();
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const job = useJob(jobId);
  useRefreshWhenFinished(job, ['events', 'slots', 'assignments', 'calendar_sources']);
  const reading = jobId !== null && !isFinished(job);

  async function read() {
    setError(null);
    try {
      const res = await engine.runOnline((remote) => remote.rpc<{ job_id: string }>('request_job', { kind: 'calendar_sync', payload: {} }));
      setJobId(res.job_id);
      await engine.pull('jobs').catch(() => 0);
    } catch {
      setError('Não foi possível pedir a leitura agora. Tente de novo em instantes.');
    }
  }

  return (
    <span className="reread">
      <OnlineButton variant="secondary" size="sm" onClick={() => void read()} disabled={reading}>
        {reading ? 'Lendo as agendas' : 'Reler agora'}
      </OnlineButton>
      {job?.status === 'done' && <span role="status" className="form-text">Leitura concluída.</span>}
      {job?.status === 'failed' && (
        <span role="alert" className="form-message form-message--alert">
          {job.error ?? 'A leitura falhou.'}
        </span>
      )}
      {error && (
        <span role="alert" className="form-message form-message--alert">
          {error}
        </span>
      )}
    </span>
  );
}
