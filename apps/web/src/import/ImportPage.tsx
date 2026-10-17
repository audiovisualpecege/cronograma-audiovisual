import { importLabels, type WorkbookRead } from '@cronograma/core';
import { UploadIcon } from '@solar-icons/react/linear';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useTable, type JobRoleRow, type PersonRow, type ServiceTypeRow, type WeekRow } from '../data/catalog';
import { SHEET_LABELS_KEY, useHistory } from '../data/history';
import { PageTitle } from '../layout/PageTitle';
import { RemoteError } from '../supabase';
import { useSyncEngine } from '../sync/SyncProvider';
import { AppIcon } from '../ui/AppIcon';
import { Button, Card } from '../ui/chiaro';
import { createBrowserWorker, ReadFailure, startRead, type CreateReadWorker, type ReadHandle } from './reader';
import type { CommitArgs } from './review';
import { ReviewStep } from './ReviewStep';

export const INVALID_FILE = 'Arquivo não reconhecido como planilha .xlsx válida';

interface CommitResult {
  weeks: number;
  events: number;
  assignments: number;
  skipped: number;
}

type Step =
  | { kind: 'idle'; notice?: string }
  | { kind: 'reading'; fileName: string; sheet?: string; index?: number; total?: number }
  | { kind: 'failed'; title: string; detail: string }
  | { kind: 'review'; fileName: string; read: WorkbookRead }
  | { kind: 'done'; fileName: string; result: CommitResult; outside: number };

export function ImportPage({ createWorker = createBrowserWorker }: { createWorker?: CreateReadWorker }) {
  const engine = useSyncEngine();
  const people = useTable<PersonRow>('people');
  const roles = useTable<JobRoleRow>('job_roles');
  const types = useTable<ServiceTypeRow>('service_types');
  const weeks = useTable<WeekRow>('weeks');
  const history = useHistory();
  const [step, setStep] = useState<Step>({ kind: 'idle' });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const handle = useRef<ReadHandle | null>(null);
  const input = useRef<HTMLInputElement>(null);

  // Sair da tela no meio da leitura também encerra o worker.
  useEffect(() => () => handle.current?.cancel(), []);

  async function choose(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setStep({ kind: 'reading', fileName: file.name });
    setSaveError(null);
    let data: ArrayBuffer;
    try {
      data = await file.arrayBuffer();
    } catch {
      setStep({ kind: 'failed', title: INVALID_FILE, detail: 'O arquivo não pôde ser aberto. Confira se ele está no aparelho e tente de novo.' });
      return;
    }
    const h = startRead(data, {
      createWorker,
      onProgress: (p) => setStep({ kind: 'reading', fileName: file.name, sheet: p.sheet, index: p.index, total: p.total }),
    });
    handle.current = h;
    try {
      const read = await h.result;
      const labels = importLabels(read.weeks);
      await engine.store.setMeta(SHEET_LABELS_KEY, { roles: labels.roles, types: labels.types });
      setStep({ kind: 'review', fileName: file.name, read });
    } catch (err) {
      if (err instanceof ReadFailure && err.code === 'cancelado') setStep({ kind: 'idle', notice: 'Leitura cancelada. Nada foi gravado.' });
      else setStep({ kind: 'failed', title: INVALID_FILE, detail: err instanceof Error ? err.message : '' });
    } finally {
      if (handle.current === h) handle.current = null;
    }
  }

  async function commit(fileName: string, args: CommitArgs, outside: number) {
    setSaving(true);
    setSaveError(null);
    try {
      const result = await engine.runOnline((remote) => remote.rpc<CommitResult>('commit_history_import', { ...args }));
      setStep({ kind: 'done', fileName, result, outside: outside + Number(result.skipped ?? 0) });
      // Pessoas inativas criadas na importação e o histórico novo.
      void engine.pull('people').catch(() => undefined);
      void history.reload();
    } catch (err) {
      const offline = err instanceof RemoteError && err.network;
      setSaveError(
        offline
          ? 'A conexão caiu e nada foi gravado. Confira a internet e confirme de novo.'
          : `Nada foi gravado. ${err instanceof Error ? err.message : ''} Corrija e confirme de novo.`,
      );
    } finally {
      setSaving(false);
    }
  }

  const loaded = people && roles && types && weeks;

  return (
    <section className="page">
      <PageTitle light="IMPORTAR" black="HISTÓRICO" />

      {(step.kind === 'idle' || step.kind === 'failed' || step.kind === 'done') && (
        <Card variant="raised" padding={20}>
          <p className="form-text">
            Envie as planilhas de cronograma (.xlsx), atuais ou antigas. A plataforma lê no aparelho e mostra uma revisão: nada é gravado antes de você confirmar.
          </p>
          <input ref={input} type="file" accept=".xlsx" hidden onChange={(e) => void choose(e)} aria-label="Arquivo da planilha" data-testid="arquivo" />
          <div className="dialog-actions">
            <Button onClick={() => input.current?.click()}>
              <AppIcon icon={UploadIcon} size={18} /> Escolher planilha
            </Button>
          </div>
          {step.kind === 'idle' && step.notice && (
            <p className="form-message" role="status">
              {step.notice}
            </p>
          )}
          {step.kind === 'failed' && (
            <div className="form-message form-message--alert" role="alert">
              <strong>{step.title}.</strong> {step.detail}
            </div>
          )}
        </Card>
      )}

      {step.kind === 'reading' && (
        <Card variant="raised" padding={20}>
          <p className="form-text" role="status" aria-live="polite">
            {step.total
              ? `Lendo aba ${(step.index ?? 0) + 1} de ${step.total}: ${step.sheet}`
              : `Abrindo ${step.fileName}`}
          </p>
          <progress className="read-progress" max={step.total ?? 1} value={step.total ? (step.index ?? 0) + 1 : undefined} aria-label="Progresso da leitura" />
          <div className="dialog-actions">
            <Button variant="secondary" onClick={() => handle.current?.cancel()}>
              Cancelar
            </Button>
          </div>
        </Card>
      )}

      {step.kind === 'review' && step.read.message && (
        <Card variant="raised" padding={20}>
          <p className="form-message form-message--alert" role="alert">
            {step.read.message}. Nada foi gravado. Confira se é a planilha de cronograma semanal.
          </p>
          <div className="dialog-actions">
            <Button variant="secondary" onClick={() => setStep({ kind: 'idle' })}>
              Voltar
            </Button>
          </div>
        </Card>
      )}

      {step.kind === 'review' && !step.read.message && loaded && (
        <ReviewStep
          fileName={step.fileName}
          read={step.read}
          people={people}
          roles={roles}
          types={types}
          platformWeeks={weeks.map((w) => w.week_start)}
          history={history.status === 'ready' ? history.rows : null}
          saving={saving}
          error={saveError}
          onCancel={() => setStep({ kind: 'idle', notice: 'Importação cancelada. Nada foi gravado.' })}
          onConfirm={(args, outside) => void commit(step.fileName, args, outside)}
        />
      )}

      {step.kind === 'done' && (
        <Card variant="default" padding={20} style={{ marginTop: 'var(--space-4)' }}>
          <h2 className="section-title">Importação concluída</h2>
          <p className="form-text" role="status">
            {step.result.weeks} semanas, {step.result.events} eventos e {step.result.assignments} alocações entraram no histórico.{' '}
            {step.outside} {step.outside === 1 ? 'item ficou' : 'itens ficaram'} de fora.
          </p>
          <a className="text-link" href="#/padroes">
            Ver os padrões
          </a>
        </Card>
      )}
    </section>
  );
}
