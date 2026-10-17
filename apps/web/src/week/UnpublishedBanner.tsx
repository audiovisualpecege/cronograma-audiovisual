import { useState } from 'react';
import type { WeekRow } from '../data/catalog';
import { RemoteError } from '../supabase';
import { OnlineButton } from '../sync/OnlineButton';
import { useSyncEngine } from '../sync/SyncProvider';
import { Button } from '../ui/chiaro';
import { Dialog } from '../ui/Dialog';
import { sendAndRefresh, WEEK_TABLES } from './useWeek';

export function changesText(n: number): string {
  return n === 1 ? '1 alteração não publicada' : `${n} alterações não publicadas`;
}

interface BannerProps {
  week: WeekRow;
  changes: number;
  onPublish: () => void;
  onDone: (message: string) => void;
}

/**
 * Destaque fixo da semana publicada com alterações (US-018 AC-1): só administradores veem; a equipe
 * continua com a fotografia publicada até "Publicar alterações". "Descartar" volta à fotografia (ADR-011).
 */
export function UnpublishedBanner({ week, changes, onPublish, onDone }: BannerProps) {
  const engine = useSyncEngine();
  const [confirm, setConfirm] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (changes === 0) return null;

  async function discard() {
    setSending(true);
    setError(null);
    try {
      await engine.flush();
      await engine.runOnline((remote) => remote.rpc<{ restored_slots: number }>('discard_week_changes', { week_id: week.id }));
      await sendAndRefresh(engine, WEEK_TABLES);
      setConfirm(false);
      onDone('Alterações descartadas. A semana voltou ao que está publicado.');
    } catch (e) {
      setError(e instanceof RemoteError && !e.network ? e.message : 'Não foi possível descartar agora. Confira a internet e tente de novo.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="unpublished-banner" role="region" aria-label="Alterações não publicadas">
      <strong className="unpublished-count">{changesText(changes)}</strong>
      <span className="unpublished-note">A equipe ainda vê a versão publicada.</span>
      <span className="unpublished-actions">
        <OnlineButton size="sm" variant="secondary" onClick={() => setConfirm(true)}>
          Descartar alterações
        </OnlineButton>
        <OnlineButton size="sm" onClick={onPublish}>
          Publicar alterações
        </OnlineButton>
      </span>
      <Dialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Descartar alterações"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirm(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void discard()} disabled={sending}>
              Descartar alterações
            </Button>
          </>
        }
      >
        <p style={{ margin: 0 }}>Descartar {changes === 1 ? 'a alteração' : `as ${changes} alterações`}? A semana volta ao que está publicado e ninguém é avisado.</p>
        {error && (
          <p className="form-message form-message--alert" role="alert">
            {error}
          </p>
        )}
      </Dialog>
    </div>
  );
}
