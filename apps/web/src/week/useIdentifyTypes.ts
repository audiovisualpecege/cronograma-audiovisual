// Identificação dos tipos de serviço no passo 1 de "Propor escala". O serviço de fundo só classifica o
// evento novo na hora em que ele chega da agenda; o que foi lido antes de o tipo existir fica "a definir".
// Aqui: palavra-chave na hora, pelo próprio aparelho; o resto vai para o job `classify` do serviço de fundo
// (títulos parecidos do histórico e, se ligada, a IA). No fim, "Montar semana" de novo cria as vagas dos
// eventos tipados pelo serviço de fundo numa semana já montada.
import { classifyTitle } from '@cronograma/core';
import { useEffect, useRef, useState } from 'react';
import type { EventRow } from '../data/catalog';
import { isFinished, useJob, useRefreshWhenFinished } from '../settings/jobs';
import { RemoteError } from '../supabase';
import { useSyncEngine } from '../sync/SyncProvider';
import type { WeekRows } from './model';
import { changeType } from './PreviewPage';
import { buildWeek, sendAndRefresh } from './useWeek';

/** Eventos que ainda pedem um tipo: ativos, sem tipo e que o administrador não deixou "a definir" de propósito. */
export function untyped(rows: WeekRows): EventRow[] {
  return rows.events.filter((e) => !e.ignored && e.status !== 'cancelled' && !e.service_type_id && e.type_source !== 'admin');
}

/** Tipo pela palavra-chave do cadastro (certeza alta), para cada evento sem tipo. */
export function keywordTypes(rows: WeekRows): Map<string, string> {
  const types = rows.types.filter((t) => !t.archived_at).map((t) => ({ id: t.id, code: t.code, keywords: t.keywords ?? [] }));
  const out = new Map<string, string>();
  for (const e of untyped(rows)) {
    const c = classifyTitle(e.title, types, []);
    if (c.typeId && c.source === 'keyword') out.set(e.id, c.typeId);
  }
  return out;
}

const NOT_ENABLED = 'A identificação pelo serviço de fundo ainda não foi liberada no servidor. Escolha os tipos à mão ou use as sugestões do histórico.';

export function useIdentifyTypes(rows: WeekRows, enabled: boolean) {
  const engine = useSyncEngine();
  const [byKeyword, setByKeyword] = useState<number | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const job = useJob(jobId);
  useRefreshWhenFinished(job, ['events', 'slots', 'assignments']);
  const started = useRef(false);
  const rebuilt = useRef<string | null>(null);

  async function identify() {
    setWorking(true);
    setError(null);
    try {
      const found = keywordTypes(rows);
      const events = new Map(rows.events.map((e) => [e.id, e]));
      for (const [id, typeId] of found) {
        const e = events.get(id);
        if (e) await changeType(engine, e, typeId);
      }
      setByKeyword(found.size);
      if (found.size > 0) await sendAndRefresh(engine, ['events', 'slots', 'assignments']);
      if (untyped(rows).length - found.size <= 0) return;
      const res = await engine.runOnline((remote) => remote.rpc<{ job_id?: string }>('request_job', { kind: 'classify', payload: {} }));
      setJobId(res.job_id ?? null);
      await engine.pull('jobs').catch(() => 0);
    } catch (e) {
      setError(e instanceof RemoteError && !e.network ? (e.code === 'forbidden' ? NOT_ENABLED : e.message) : 'Não foi possível pedir a identificação agora. Tente de novo em instantes.');
    } finally {
      setWorking(false);
    }
  }

  // Na chegada ao passo 1, uma vez, se há evento sem tipo (e os tipos já chegaram à cópia local).
  const pending = untyped(rows).length;
  const ready = rows.types.length > 0;
  useEffect(() => {
    if (!enabled || !ready || started.current || pending === 0) return;
    started.current = true;
    void identify();
  });

  // O serviço de fundo grava o tipo sem criar vagas; numa semana já montada, monta de novo para completá-las.
  const done = job?.status === 'done' ? job.id : null;
  useEffect(() => {
    if (!done || !rows.week || rebuilt.current === done) return;
    rebuilt.current = done;
    void buildWeek(engine, rows.weekStart);
  }, [done, rows.week, rows.weekStart, engine]);

  const running = working || (jobId !== null && !isFinished(job));
  const classified = typeof job?.result?.classified === 'number' ? job.result.classified : null;
  return { identify, running, byKeyword, job, classified, error };
}
