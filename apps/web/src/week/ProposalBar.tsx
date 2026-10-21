import { useState } from 'react';
import type { AssignmentRow, JobRow, SettingsRow, WeekRow } from '../data/catalog';
import { RemoteError } from '../supabase';
import { useLocalQuery, useSyncEngine } from '../sync/SyncProvider';
import { Button, Card } from '../ui/chiaro';
import { acceptProposal, discardProposal } from './useWeek';

export const AI_OFF = 'A pré-escala pela IA está desligada; monte a escala à mão.';
export const NO_HISTORY = 'Sem histórico, proposta por equilíbrio de carga.';
const AI_SILENT = 'A IA não respondeu agora; monte à mão ou tente mais tarde.';

/** Último pedido de proposta da semana, visto pela tabela jobs. */
export function useProposeJob(weekId: string | undefined): JobRow | undefined {
  return useLocalQuery(async (store) => {
    if (!weekId) return undefined;
    const jobs = (await store.mirror('jobs').toArray()) as unknown as JobRow[];
    return jobs
      .filter((j) => j.kind === 'propose' && j.payload?.week_id === weekId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  }, [weekId]);
}

const num = (v: unknown) => (typeof v === 'number' ? v : 0);

export function isRunning(job: JobRow | undefined): boolean {
  return job?.status === 'queued' || job?.status === 'running';
}

export function jobMessage(job: JobRow): { tone: 'status' | 'alert'; text: string } {
  const r = job.result ?? {};
  if (job.status === 'queued') return { tone: 'status', text: 'Pedido enviado. Aguardando o serviço de fundo.' };
  if (job.status === 'running') {
    const total = num(r.batches_total);
    return { tone: 'status', text: total > 0 ? `Montando a proposta: lote ${num(r.batches_done) + 1} de ${total}.` : 'Montando a proposta.' };
  }
  // O serviço de fundo guarda o motivo exato (error_detail); sem ele, ninguém sabe se foi cota, queda ou formato.
  const why = typeof r.error_detail === 'string' && r.error_detail ? ` Motivo: ${r.error_detail}` : '';
  if (job.status === 'failed') return { tone: 'alert', text: `${job.error || AI_SILENT}${why}` };
  const parts = [num(r.proposed) === 1 ? '1 proposta para revisar.' : `${num(r.proposed)} propostas para revisar.`];
  if (num(r.discarded) > 0) parts.push(num(r.discarded) === 1 ? '1 vaga ficou aberta: a IA não achou alguém apto.' : `${num(r.discarded)} vagas ficaram abertas: a IA não achou alguém apto.`);
  if (num(r.without_proposal) > 0) parts.push(`${num(r.without_proposal)} vagas ficaram sem proposta. ${AI_SILENT}${why}`);
  if (r.noHistory) parts.push(NO_HISTORY);
  return { tone: num(r.without_proposal) > 0 ? 'alert' : 'status', text: parts.join(' ') };
}

/** Pedido de proposta à IA pela fila do serviço de fundo (US-013). */
export function useProposalRequest(week: WeekRow | null) {
  const engine = useSyncEngine();
  const job = useProposeJob(week?.id);
  const [sending, setSending] = useState(false);
  const [requestedHere, setRequestedHere] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function request(replacePending: boolean) {
    if (!week) return;
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

  return { job, request, sending, requestedHere, error };
}

/** Situação do último pedido de proposta, enquanto roda ou quando foi feito nesta tela. */
export function ProposalMessage({ job, requestedHere }: { job: JobRow | undefined; requestedHere?: string | null }) {
  const message = job && (isRunning(job) || job.id === requestedHere) ? jobMessage(job) : null;
  if (!message) return null;
  return (
    <p className={`form-message${message.tone === 'alert' ? ' form-message--alert' : ''}`} role={message.tone}>
      {message.text}
    </p>
  );
}

/** Aceitar ou descartar de uma vez as propostas pendentes da semana. */
export function ProposalActions({ proposed }: { proposed: readonly AssignmentRow[] }) {
  const engine = useSyncEngine();
  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => proposed.forEach((a) => void acceptProposal(engine, a))}>
        Aceitar todas da semana
      </Button>
      <Button variant="ghost" size="sm" onClick={() => proposed.forEach((a) => void discardProposal(engine, a))}>
        Descartar todas da semana
      </Button>
    </>
  );
}

interface ProposalBarProps {
  week: WeekRow;
  settings: SettingsRow | undefined;
  proposed: readonly AssignmentRow[];
  readOnly: boolean;
}

/**
 * Pré-escala na tela da semana (US-013, US-014): propostas pendentes, situação do pedido e o aviso de IA
 * desligada. O pedido em si sai da tela "Propor escala". Nada da IA vale sem a ação do administrador.
 */
export function ProposalBar({ week, settings, proposed, readOnly }: ProposalBarProps) {
  const job = useProposeJob(week.id);
  if (!settings) return null;
  const aiOn = settings.ai_proposal_enabled;
  if (aiOn && proposed.length === 0 && !isRunning(job)) return null;
  return (
    <Card variant="raised" padding={20}>
      <section aria-label="Pré-escala" className="proposal-bar">
        {!aiOn && (
          <p className="form-text" role="note" style={{ margin: 0 }}>
            {AI_OFF}
          </p>
        )}
        {proposed.length > 0 && (
          <div className="week-actions">
            <p className="form-text" style={{ margin: 0 }}>
              {proposed.length === 1 ? '1 proposta pendente. A equipe não vê propostas.' : `${proposed.length} propostas pendentes. A equipe não vê propostas.`}
            </p>
            {!readOnly && (
              <span className="week-actions-buttons">
                <ProposalActions proposed={proposed} />
              </span>
            )}
          </div>
        )}
        <ProposalMessage job={job} />
      </section>
    </Card>
  );
}
