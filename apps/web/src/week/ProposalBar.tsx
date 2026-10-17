import { useState } from 'react';
import type { AssignmentRow, JobRow, SettingsRow, WeekRow } from '../data/catalog';
import { RemoteError } from '../supabase';
import { OnlineButton } from '../sync/OnlineButton';
import { useLocalQuery, useSyncEngine } from '../sync/SyncProvider';
import { Button, Card } from '../ui/chiaro';
import { Dialog } from '../ui/Dialog';
import { acceptProposal, discardProposal } from './useWeek';

export const AI_OFF = 'A pré-escala pela IA está desligada; monte a escala à mão.';
export const NO_HISTORY = 'Sem histórico, proposta por equilíbrio de carga.';
const AI_SILENT = 'A IA não respondeu agora; monte à mão ou tente mais tarde.';

/** Último pedido de proposta da semana, visto pela tabela jobs. */
function useProposeJob(weekId: string): JobRow | undefined {
  return useLocalQuery(async (store) => {
    const jobs = (await store.mirror('jobs').toArray()) as unknown as JobRow[];
    return jobs
      .filter((j) => j.kind === 'propose' && j.payload?.week_id === weekId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  }, [weekId]);
}

const num = (v: unknown) => (typeof v === 'number' ? v : 0);

function jobMessage(job: JobRow): { tone: 'status' | 'alert'; text: string } {
  const r = job.result ?? {};
  if (job.status === 'queued') return { tone: 'status', text: 'Pedido enviado. Aguardando o serviço de fundo.' };
  if (job.status === 'running') {
    const total = num(r.batches_total);
    return { tone: 'status', text: total > 0 ? `Montando a proposta: lote ${num(r.batches_done) + 1} de ${total}.` : 'Montando a proposta.' };
  }
  if (job.status === 'failed') return { tone: 'alert', text: job.error || AI_SILENT };
  const parts = [num(r.proposed) === 1 ? '1 proposta para revisar.' : `${num(r.proposed)} propostas para revisar.`];
  if (num(r.discarded) > 0) parts.push(num(r.discarded) === 1 ? '1 vaga ficou aberta: a IA não achou alguém apto.' : `${num(r.discarded)} vagas ficaram abertas: a IA não achou alguém apto.`);
  if (num(r.without_proposal) > 0) parts.push(`${num(r.without_proposal)} vagas ficaram sem proposta. ${AI_SILENT}`);
  if (r.noHistory) parts.push(NO_HISTORY);
  return { tone: num(r.without_proposal) > 0 ? 'alert' : 'status', text: parts.join(' ') };
}

interface ProposalBarProps {
  week: WeekRow;
  settings: SettingsRow | undefined;
  proposed: readonly AssignmentRow[];
  readOnly: boolean;
}

/** "Propor escala" e a revisão da semana inteira (US-013, US-014). Nada da IA vale sem a ação do administrador. */
export function ProposalBar({ week, settings, proposed, readOnly }: ProposalBarProps) {
  const engine = useSyncEngine();
  const job = useProposeJob(week.id);
  const [asking, setAsking] = useState(false);
  const [sending, setSending] = useState(false);
  const [requestedHere, setRequestedHere] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!settings) return null;
  const running = job?.status === 'queued' || job?.status === 'running';

  async function request(replacePending: boolean) {
    setAsking(false);
    setSending(true);
    setError(null);
    try {
      const res = await engine.runOnline((remote) => remote.rpc<{ job_id: string }>('request_job', { kind: 'propose', payload: { week_id: week.id, replace_pending: replacePending } }));
      setRequestedHere(res.job_id);
      await engine.pull('jobs').catch(() => 0);
    } catch (e) {
      setError(e instanceof RemoteError && !e.network ? e.message : 'Não foi possível pedir a proposta agora. Tente de novo em instantes.');
    } finally {
      setSending(false);
    }
  }

  function start() {
    if (proposed.length > 0) setAsking(true);
    else void request(true);
  }

  const message = job && (running || job.id === requestedHere) ? jobMessage(job) : null;
  const aiOn = settings.ai_proposal_enabled;
  if (!aiOn && proposed.length === 0) {
    return (
      <Card variant="raised" padding={20}>
        <p className="form-text" role="note" style={{ margin: 0 }}>
          {AI_OFF}
        </p>
      </Card>
    );
  }

  return (
    <Card variant="raised" padding={20}>
      <section aria-label="Pré-escala" className="proposal-bar">
        {!aiOn && (
          <p className="form-text" role="note">
            {AI_OFF}
          </p>
        )}
        <div className="dialog-actions" style={{ justifyContent: 'flex-start', marginTop: 0 }}>
          {aiOn && !readOnly && (
            <OnlineButton onClick={start} disabled={running || sending}>
              {running || sending ? 'Propondo escala' : 'Propor escala'}
            </OnlineButton>
          )}
          {proposed.length > 0 && !readOnly && (
            <>
              <Button variant="secondary" onClick={() => proposed.forEach((a) => void acceptProposal(engine, a))}>
                Aceitar todas da semana
              </Button>
              <Button variant="ghost" onClick={() => proposed.forEach((a) => void discardProposal(engine, a))}>
                Descartar todas da semana
              </Button>
            </>
          )}
        </div>
        {proposed.length > 0 && <p className="form-text">{proposed.length === 1 ? '1 proposta pendente. A equipe não vê propostas.' : `${proposed.length} propostas pendentes. A equipe não vê propostas.`}</p>}
        {message && (
          <p className={`form-message${message.tone === 'alert' ? ' form-message--alert' : ''}`} role={message.tone}>
            {message.text}
          </p>
        )}
        {error && (
          <p className="form-message form-message--alert" role="alert">
            {error}
          </p>
        )}
      </section>
      <Dialog
        open={asking}
        onClose={() => setAsking(false)}
        title="Propor escala"
        footer={
          <>
            <Button variant="secondary" onClick={() => void request(false)}>
              Manter as pendentes
            </Button>
            <Button onClick={() => void request(true)}>Substituir</Button>
          </>
        }
      >
        <p style={{ margin: 0 }}>{proposed.length === 1 ? 'Substituir a proposta pendente?' : `Substituir as ${proposed.length} propostas pendentes?`} As alocações aceitas não mudam.</p>
      </Dialog>
    </Card>
  );
}
