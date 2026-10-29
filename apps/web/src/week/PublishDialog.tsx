import { useState } from 'react';
import type { WeekRow } from '../data/catalog';
import { RemoteError } from '../supabase';
import { useSyncEngine } from '../sync/SyncProvider';
import { Button } from '../ui/chiaro';
import { Dialog } from '../ui/Dialog';
import type { PublishSummary } from './model';
import { sendAndRefresh, WEEK_TABLES } from './useWeek';

const count = (n: number, one: string, many: string) => (n === 1 ? `1 ${one}` : `${n} ${many}`);

interface PublishDialogProps {
  week: WeekRow;
  summary: PublishSummary;
  /** Sugestões da grade ainda não confirmadas. */
  suggested?: number;
  /** Alterações não publicadas, quando a semana já está publicada. */
  changes: number;
  onClose: () => void;
  onDone: (message: string) => void;
}

/**
 * Publicar a semana ou as alterações (US-017, US-018): resumo com vagas abertas, propostas pendentes e
 * alertas; semana sem ninguém escalado pede uma segunda confirmação (US-017 EC-4).
 */
export function PublishDialog({ week, summary, suggested = 0, changes, onClose, onDone }: PublishDialogProps) {
  const engine = useSyncEngine();
  const first = week.state === 'building';
  const [step, setStep] = useState<'summary' | 'empty'>('summary');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function publish() {
    if (first && summary.filled === 0 && step === 'summary') {
      setStep('empty');
      return;
    }
    setSending(true);
    setError(null);
    try {
      // O que ainda está na fila vai antes, para a fotografia sair com tudo o que a tela mostra.
      await engine.flush();
      const res = await engine.runOnline((remote) =>
        remote.rpc<{ revision: number; notified: number }>('publish_week', { week_id: week.id, expected_revision: week.revision ?? 0 }),
      );
      await sendAndRefresh(engine, [...WEEK_TABLES, 'notifications']);
      onDone(`${first ? 'Semana publicada' : 'Alterações publicadas'}. ${count(res.notified, 'pessoa avisada', 'pessoas avisadas')}.`);
    } catch (e) {
      const remoteError = e instanceof RemoteError && !e.network;
      setError(remoteError ? e.message : 'Não foi possível publicar agora. Confira a internet e tente de novo.');
      if (remoteError && e.code === 'stale_revision') await sendAndRefresh(engine, WEEK_TABLES);
    } finally {
      setSending(false);
    }
  }

  const title = first ? 'Publicar a semana' : 'Publicar alterações';
  return (
    <Dialog
      open
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => void publish()} disabled={sending}>
            {step === 'empty' ? 'Publicar sem ninguém escalado' : first ? 'Publicar' : 'Publicar alterações'}
          </Button>
        </>
      }
    >
      {step === 'empty' ? (
        <p style={{ margin: 0 }} role="alert">
          A semana não tem nenhuma pessoa escalada. Todas as vagas vão aparecer para a equipe como a definir. Publicar mesmo assim?
        </p>
      ) : (
        <>
          {!first && <p style={{ marginTop: 0 }}>{count(changes, 'alteração vai para a equipe', 'alterações vão para a equipe')}. Cada pessoa afetada recebe um aviso só.</p>}
          <ul className="plain-list publish-summary" aria-label="Resumo da publicação">
            {suggested > 0 && (
              <li role="alert">
                {count(suggested, 'sugestão não confirmada', 'sugestões não confirmadas')}: não vão para a equipe. Use "Confirmar sugestões" antes, se quiser.
              </li>
            )}
            <li>{count(summary.open, 'vaga aberta', 'vagas abertas')}: aparecem para a equipe como a definir.</li>
            <li>{count(summary.proposed, 'proposta pendente', 'propostas pendentes')}: não vão para a equipe, que vê essas vagas como a definir.</li>
            <li>{count(summary.alerts, 'alerta de conflito', 'alertas de conflito')}.</li>
          </ul>
        </>
      )}
      {error && (
        <p className="form-message form-message--alert" role="alert">
          {error}
        </p>
      )}
    </Dialog>
  );
}
