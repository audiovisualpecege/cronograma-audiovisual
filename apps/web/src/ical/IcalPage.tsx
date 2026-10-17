import { CopyIcon } from '@solar-icons/react/linear';
import { useState } from 'react';
import { PageTitle } from '../layout/PageTitle';
import { useOwnPerson } from '../push/PushSettings';
import { RemoteError } from '../supabase';
import { useSyncEngine, useSyncState } from '../sync/SyncProvider';
import { AppIcon } from '../ui/AppIcon';
import { Button, Card } from '../ui/chiaro';
import { Dialog } from '../ui/Dialog';
import { Switch } from '../ui/Switch';

/** Aviso fixo da tela (US-024 AC-4). */
export const ICAL_DELAY_NOTE =
  'O calendário pessoal pode levar horas para atualizar (no Google, até cerca de 12 horas). Mudanças urgentes chegam pelos avisos da plataforma.';

/** Endereço do feed da pessoa no Storage público, a partir do token do próprio cadastro. */
export function feedPath(token: string): string {
  return `/storage/v1/object/public/ical/${token}.ics`;
}

/** "Minha agenda no meu calendário": link iCal secreto, opcional e revogável (US-024). */
export function IcalPage() {
  const engine = useSyncEngine();
  const { online } = useSyncState();
  const own = useOwnPerson();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmNew, setConfirmNew] = useState(false);
  const token = own?.ical_token ?? null;
  const url = token ? engine.remote.publicUrl(feedPath(token)) : null;

  async function setFeed(enabled: boolean, regenerate = false) {
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      await engine.runOnline((remote) => remote.rpc('set_ical_feed', { enabled, regenerate }));
      await engine.pull('people');
    } catch (e) {
      setError(e instanceof RemoteError && e.network ? 'Precisa de internet. Conecte o aparelho e tente de novo.' : e instanceof Error ? e.message : 'Não foi possível agora. Tente de novo.');
    } finally {
      setBusy(false);
      setConfirmNew(false);
    }
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setError('Não foi possível copiar. Selecione o link e copie manualmente.');
    }
  }

  return (
    <section className="page ical-page">
      <PageTitle light="MINHA AGENDA NO" black="MEU CALENDÁRIO" />
      <p className="page-note" role="note">
        {ICAL_DELAY_NOTE}
      </p>
      <Card variant="raised" padding={20}>
        <div className="form-stack">
          <Switch
            checked={Boolean(token)}
            disabled={busy || !online || own === undefined}
            onChange={(on) => void setFeed(on)}
            label="Minha agenda no meu calendário"
            hint="Gera um link secreto com as suas atividades publicadas: horário, título, local e função. Quem tiver o link vê só a sua agenda, sem acesso à plataforma."
          />
          {!online && <p className="form-text">Precisa de internet para ligar, desligar ou gerar um link novo.</p>}
          {url && (
            <>
              <label className="field-label" htmlFor="ical-link">
                Link da sua agenda
              </label>
              <input id="ical-link" className="ical-link" readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
              <div className="dialog-actions" style={{ justifyContent: 'flex-start' }}>
                <Button size="sm" onClick={() => void copy()}>
                  <AppIcon icon={CopyIcon} size={16} /> Copiar link
                </Button>
                <Button size="sm" variant="secondary" disabled={busy || !online} onClick={() => setConfirmNew(true)}>
                  Gerar link novo
                </Button>
                {copied && (
                  <span className="form-text" role="status">
                    Link copiado.
                  </span>
                )}
              </div>
              <h2 className="section-title">Como assinar</h2>
              <ul className="plain-list ical-steps">
                <li>
                  <strong>Google Agenda:</strong> no computador, abra calendar.google.com, clique em Outras agendas, depois em Do URL, cole o link e clique em Adicionar agenda.
                </li>
                <li>
                  <strong>iPhone e Mac:</strong> em Ajustes, Calendário, Contas, Adicionar conta, Outra, Adicionar calendário assinado, cole o link. No Mac, use Arquivo, Nova assinatura de calendário.
                </li>
                <li>
                  <strong>Outlook:</strong> em Calendário, Adicionar calendário, Assinar da Web, cole o link e importe.
                </li>
              </ul>
            </>
          )}
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
        </div>
      </Card>
      <Dialog
        open={confirmNew}
        onClose={() => setConfirmNew(false)}
        title="Gerar link novo"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmNew(false)}>
              Voltar
            </Button>
            <Button disabled={busy} onClick={() => void setFeed(true, true)}>
              Gerar link novo
            </Button>
          </>
        }
      >
        <p style={{ margin: 0 }}>O link atual para de funcionar. Quem assinou o antigo precisa assinar o novo.</p>
      </Dialog>
    </section>
  );
}
