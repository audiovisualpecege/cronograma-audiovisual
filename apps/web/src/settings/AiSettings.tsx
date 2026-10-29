import { useState, type FormEvent } from 'react';
import { useTable, type JobRow, type SettingsRow } from '../data/catalog';
import { useSyncEngine } from '../sync/SyncProvider';
import { OnlineButton } from '../sync/OnlineButton';
import { Card, Input } from '../ui/chiaro';
import { Select } from '../ui/Select';
import { isFinished, useJob, useRefreshWhenFinished } from './jobs';

export const FREE_PLAN_NOTICE =
  'No plano gratuito, o fornecedor da IA pode usar os dados enviados para melhorar os produtos dele. Por isso a plataforma troca os nomes das pessoas, funções e tipos por códigos (P1, R1, T1) e só envia esses códigos, os horários, as cargas e os títulos dos eventos a classificar.';

export const PROVIDERS = [
  { value: 'gemini', label: 'Google Gemini (plano gratuito)' },
  { value: 'local', label: 'Modelo local (MiniCPM5 ou outro, na rede da empresa)' },
];

export const LOCAL_NOTICE =
  'O modelo local roda num servidor da rede da empresa (Ollama, llama.cpp, LM Studio ou vLLM): os dados não saem da empresa e não há cota do Google. Num computador sem placa de vídeo ele pode levar alguns minutos por proposta.';

const URL_OK = /^https?:\/\/\S+$/;

const sentence = (s: string) => (/[.]$/.test(s) ? s : `${s}.`);

/** O pedido de teste mais novo que não existia antes do clique (set_ai_key não devolve o id). */
function newestTest(jobs: readonly JobRow[], before: ReadonlySet<string>): JobRow | undefined {
  return jobs
    .filter((j) => j.kind === 'test_ai_key' && (!before.has(j.id) || j.status === 'queued' || j.status === 'running'))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
}

/** Fornecedor da IA: o Gemini (chave do Google) ou um modelo local (endereço do servidor na rede). */
export function AiSettings({ settings }: { settings: SettingsRow }) {
  const engine = useSyncEngine();

  function saveProvider(provider: string) {
    void engine.enqueue('settings.update', { ai_provider: provider }, { target: { table: 'settings', id: settings.id, changes: { ai_provider: provider } } });
  }

  return (
    <Card variant="raised" padding={24}>
      <section aria-labelledby="cfg-ia">
        <h2 id="cfg-ia" className="section-title">
          Inteligência artificial
        </h2>
        <div className="form-grid">
          <Select label="Fornecedor" value={settings.ai_provider} onChange={(e) => saveProvider(e.target.value)} options={PROVIDERS} />
        </div>
        {settings.ai_provider === 'local' ? <LocalAi settings={settings} /> : <GeminiAi settings={settings} />}
      </section>
    </Card>
  );
}

/** Modelo local: endereço do servidor, nome do modelo e o teste de conexão (feito pelo serviço de fundo). */
function LocalAi({ settings }: { settings: SettingsRow }) {
  const engine = useSyncEngine();
  const [url, setUrl] = useState(settings.ai_local_url ?? '');
  const [model, setModel] = useState(settings.ai_local_model ?? 'minicpm5');
  const [urlError, setUrlError] = useState<string | null>(null);
  const [testId, setTestId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const job = useJob(testId);
  const waiting = testId !== null && !isFinished(job);

  function save(changes: { ai_local_url?: string | null; ai_local_model?: string }) {
    void engine.enqueue('settings.update', changes, { target: { table: 'settings', id: settings.id, changes } });
  }

  function saveUrl() {
    const value = url.trim();
    if (value && !URL_OK.test(value)) {
      setUrlError('Comece com http:// ou https://, por exemplo http://172.16.52.30:11434.');
      return;
    }
    setUrlError(null);
    if (value !== (settings.ai_local_url ?? '')) save({ ai_local_url: value || null });
  }

  function saveModel() {
    const value = model.trim();
    if (!value || value === settings.ai_local_model) return;
    save({ ai_local_model: value });
  }

  async function test() {
    setError(null);
    try {
      // O endereço e o modelo recém-digitados vão antes, para o teste usar o que está na tela.
      await engine.flush().catch(() => undefined);
      const res = await engine.runOnline((remote) => remote.rpc<{ job_id: string }>('request_job', { kind: 'test_ai_key', payload: {} }));
      setTestId(res.job_id);
      await engine.pull('jobs').catch(() => 0);
    } catch {
      setError('Não foi possível pedir o teste agora. Tente de novo em instantes.');
    }
  }

  return (
    <>
      <p className="form-message" role="note">
        {LOCAL_NOTICE}
      </p>
      <div className="form-grid">
        <Input
          label="Endereço do servidor"
          value={url}
          placeholder="http://172.16.52.30:11434"
          onChange={(e) => setUrl(e.target.value)}
          onBlur={saveUrl}
          error={urlError ?? undefined}
          hint="Onde o Ollama (ou similar) está rodando, visto pelo serviço de fundo no NAS."
        />
        <Input
          label="Modelo"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          onBlur={saveModel}
          hint="O nome do modelo no servidor, como aparece em ollama list. O padrão é minicpm5."
        />
      </div>
      {!settings.ai_local_url && <p className="form-text key-hint">Sem endereço, a IA fica parada; a escala manual continua funcionando.</p>}
      <div className="dialog-actions">
        <OnlineButton variant="secondary" onClick={() => void test()} disabled={waiting || !settings.ai_local_url}>
          Testar conexão
        </OnlineButton>
      </div>
      {waiting && (
        <p className="form-text" role="status">
          Testando a conexão com o servidor da IA local.
        </p>
      )}
      {job?.status === 'done' && (
        <p className="form-message" role="status">
          Conexão aceita: a IA local respondeu.
        </p>
      )}
      {job?.status === 'failed' && (
        <p className="form-message form-message--alert" role="alert">
          {sentence(job.error ?? 'O servidor da IA local não respondeu')}
        </p>
      )}
      {error && (
        <p className="form-message form-message--alert" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

/** Gemini: modelo, chave (só o final aparece) e o teste da chave. */
function GeminiAi({ settings }: { settings: SettingsRow }) {
  const engine = useSyncEngine();
  const jobs = useTable<JobRow>('jobs') ?? [];
  const [key, setKey] = useState('');
  const [model, setModel] = useState(settings.ai_model);
  const [before, setBefore] = useState<ReadonlySet<string> | null>(null);
  const [testId, setTestId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const keyJob = before ? newestTest(jobs, before) : undefined;
  const testJob = useJob(testId);
  const job = testId ? testJob : keyJob;
  useRefreshWhenFinished(job, ['settings']);
  const waiting = (before !== null || testId !== null) && !isFinished(job);

  async function saveKey(e: FormEvent) {
    e.preventDefault();
    const value = key.trim();
    if (value.length < 8) {
      setError('Informe a chave completa, como aparece no Google AI Studio.');
      return;
    }
    setError(null);
    setTestId(null);
    setBefore(new Set(jobs.filter((j) => j.kind === 'test_ai_key').map((j) => j.id)));
    try {
      await engine.runOnline((remote) => remote.rpc<{ hint: string }>('set_ai_key', { provider: 'gemini', key: value }));
      // A chave sai da tela assim que vai para o servidor: depois só aparece o final dela.
      setKey('');
      await engine.pull('jobs').catch(() => 0);
    } catch {
      setBefore(null);
      setError('Não foi possível enviar a chave agora. Confira a internet e tente de novo.');
    }
  }

  async function testKey() {
    setError(null);
    setBefore(null);
    try {
      const res = await engine.runOnline((remote) => remote.rpc<{ job_id: string }>('request_job', { kind: 'test_ai_key', payload: {} }));
      setTestId(res.job_id);
      await engine.pull('jobs').catch(() => 0);
    } catch {
      setError('Não foi possível pedir o teste agora. Tente de novo em instantes.');
    }
  }

  function saveModel() {
    const value = model.trim();
    if (!value || value === settings.ai_model) return;
    void engine.enqueue('settings.update', { ai_model: value }, { target: { table: 'settings', id: settings.id, changes: { ai_model: value } } });
  }

  return (
    <>
      <p className="form-message" role="note">
        {FREE_PLAN_NOTICE}
      </p>
      <div className="form-grid">
        <Input
          label="Modelo"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          onBlur={saveModel}
          hint="O padrão é gemini-2.5-flash. Troque se o Google mudar os modelos gratuitos."
        />
      </div>
      <p className="form-text key-hint">
        {settings.ai_key_hint ? (
          <>
            Chave em uso: <strong>{settings.ai_key_hint}</strong>
          </>
        ) : (
          'Nenhuma chave aprovada ainda. Sem chave, a escala manual continua funcionando.'
        )}
      </p>
      <form className="inline-form" onSubmit={(e) => void saveKey(e)} noValidate aria-label="Chave da IA">
        <Input
          label={settings.ai_key_hint ? 'Trocar a chave' : 'Chave da API'}
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={key}
          onChange={(e) => setKey(e.target.value)}
          error={error ?? undefined}
        />
        <OnlineButton type="submit" disabled={waiting || key.trim() === ''}>
          Salvar e testar
        </OnlineButton>
      </form>
      <div className="dialog-actions">
        <OnlineButton variant="secondary" onClick={() => void testKey()} disabled={waiting || !settings.ai_key_hint}>
          Testar chave
        </OnlineButton>
      </div>
      {waiting && (
        <p className="form-text" role="status">
          Testando a chave com o fornecedor.
        </p>
      )}
      {job?.status === 'done' && (
        <p className="form-message" role="status">
          Chave aceita: a IA respondeu.
        </p>
      )}
      {job?.status === 'failed' && (
        <p className="form-message form-message--alert" role="alert">
          {sentence(job.error ?? 'Chave recusada pelo fornecedor')} {before ? 'A configuração anterior continua valendo.' : ''}
        </p>
      )}
      <a className="text-link" href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">
        Criar uma chave no Google AI Studio
      </a>
    </>
  );
}
