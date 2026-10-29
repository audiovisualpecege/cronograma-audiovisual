import { useState } from 'react';
import { isFinished, useJob, useRefreshWhenFinished } from '../settings/jobs';
import { OnlineButton } from '../sync/OnlineButton';
import { useSyncEngine } from '../sync/SyncProvider';
import { Button } from '../ui/chiaro';
import { Dialog } from '../ui/Dialog';

export const REREAD_CONFIRM = 'Existe um limite de sincronizações diárias. Tem certeza que quer continuar a releitura?';

/**
 * "Reler agora" (US-011 AC-1): pede a leitura das agendas ao serviço de fundo e lê de novo os eventos.
 * Pede confirmação antes, porque há um limite de sincronizações por dia.
 */
export function RereadButton() {
  const engine = useSyncEngine();
  const [confirming, setConfirming] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const job = useJob(jobId);
  useRefreshWhenFinished(job, ['events', 'slots', 'assignments', 'calendar_sources']);
  const reading = jobId !== null && !isFinished(job);

  async function read() {
    setConfirming(false);
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
      <OnlineButton variant="secondary" size="sm" onClick={() => setConfirming(true)} disabled={reading}>
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
      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Reler as agendas"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void read()}>Continuar a releitura</Button>
          </>
        }
      >
        <p style={{ margin: 0 }}>{REREAD_CONFIRM}</p>
      </Dialog>
    </span>
  );
}
