// commit_history_import e history_facts: gravar, tudo ou nada, substituir, proteger semanas montadas.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { ParsedWeek } from '@cronograma/core';
import { describe, expect, it } from 'vitest';
import { EVENT, person, role } from '../helpers/ids.ts';
import { as, one, rpc, rpcError, sql, useSeed } from '../helpers/supabase.ts';

const expected = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../../fixtures/oficial-2026.expected.json', import.meta.url)), 'utf8'),
) as { weeks: ParsedWeek[] };

const WEEKS = expected.weeks;
const ALL_EVENTS = WEEKS.flatMap((w) => w.events);
// Evento cancelado na planilha não vira histórico e conta em skipped.
const CANCELLED = ALL_EVENTS.filter((e) => e.cancelled).length;
const EVENTS = ALL_EVENTS.filter((e) => !e.cancelled);
const ASSIGNMENTS = EVENTS.flatMap((e) => e.assignments);
const EMPTY_EVENTS = EVENTS.filter((e) => e.assignments.length === 0).length;

// As funções da planilha ligadas ao cadastro na revisão.
const ROLE_LINKS = { Operador: role(1), Mediador: role(4), Assistente: role(6) };

const commit = (weeks: ParsedWeek[], extra: Record<string, unknown> = {}) =>
  rpc<{ weeks: number; events: number; assignments: number; skipped: number }>(as('P1'), 'commit_history_import', {
    file_name: 'oficial-2026.xlsx', weeks, name_links: {}, replace_weeks: [], role_links: ROLE_LINKS, ...extra,
  });

const activeEntries = (weekStart?: string) =>
  sql<{ import_id: string; person_id: string | null; raw_name: string | null }>(
    `select import_id, person_id, raw_name from public.history_entries where archived_at is null ${weekStart ? 'and week_start = $1' : ''}`,
    weekStart ? [weekStart] : [],
  );

describe('commit_history_import', () => {
  useSeed();

  it('IT-050 gravar o plano da planilha oficial devolve as contagens e history_facts passa a ter as linhas', async () => {
    const counts = await commit(WEEKS);
    expect(counts).toEqual({ weeks: WEEKS.length, events: EVENTS.length, assignments: ASSIGNMENTS.length, skipped: CANCELLED });
    const { data } = await as('P1').from('history_facts').select('event_id, job_role_name, source, hours').eq('source', 'import');
    expect(data).toHaveLength(ASSIGNMENTS.length + EMPTY_EVENTS);
    expect(new Set(data?.map((f) => f.event_id)).size).toBe(EVENTS.length);
    expect(data?.some((f) => f.job_role_name === 'Câmera')).toBe(true);
    expect(await one('select counts from public.history_imports')).toEqual({ counts });
  });

  it('IT-051 plano com uma linha inválida no fim devolve erro e nada fica gravado', async () => {
    const broken = structuredClone(WEEKS);
    broken.at(-1)?.events.push({
      ...EVENTS[0]!, title: 'Linha com função inexistente', assignments: [{ role: 'Iluminador de drone', rawName: 'Ana Fictícia' }],
    });
    const err = await rpcError(as('P1'), 'commit_history_import', {
      file_name: 'oficial-2026.xlsx', weeks: broken, name_links: {}, replace_weeks: [], role_links: ROLE_LINKS,
    });
    expect(err.code).toBe('invalid_import');
    expect(err.detail).toContain('Iluminador de drone');
    expect(await sql('select * from public.history_imports')).toHaveLength(0);
    expect(await sql('select * from public.history_entries')).toHaveLength(0);
  });

  it('IT-052 semana já importada: com replace_weeks substitui, sem ela ignora', async () => {
    await commit(WEEKS);
    const first = await activeEntries();
    const ignored = await commit(WEEKS);
    expect(ignored).toMatchObject({ weeks: 0, events: 0, assignments: 0, skipped: ALL_EVENTS.length });
    expect(await activeEntries()).toEqual(first);

    const replaced = await commit(WEEKS, { replace_weeks: WEEKS.map((w) => w.weekStart) });
    expect(replaced).toMatchObject({ weeks: WEEKS.length, assignments: ASSIGNMENTS.length });
    const now = await activeEntries();
    expect(now).toHaveLength(first.length);
    expect(new Set(now.map((e) => e.import_id)).size).toBe(1);
    expect(now[0]?.import_id).not.toBe(first[0]?.import_id);
  });

  it('IT-053 linhas de semanas que têm weeks na plataforma são ignoradas e contadas em skipped', async () => {
    const platformWeek: ParsedWeek = {
      ...structuredClone(WEEKS[0]!),
      weekStart: '2026-10-19',
      events: WEEKS[0]!.events.slice(0, 2).map((e) => ({ ...e, date: '2026-10-20', endDate: '2026-10-20' })),
    };
    const counts = await commit([...WEEKS, platformWeek]);
    expect(counts.skipped).toBe(2 + CANCELLED);
    expect(counts.weeks).toBe(WEEKS.length);
    expect(await activeEntries('2026-10-19')).toHaveLength(0);
  });

  it('IT-054 ligação "criar pessoa inativa" cria a pessoa inativa e liga as linhas a ela', async () => {
    await commit(WEEKS, { name_links: { 'Bruno Exemplo': { create: true }, 'Ana Fictícia': { person_id: person(10) }, 'Hugo Rascunho': { ignore: true } } });
    const bruno = await one<{ id: string; active: boolean; email: string | null; code: string }>(
      "select id, active, email, code from public.people where name = 'Bruno Exemplo'",
    );
    expect(bruno).toMatchObject({ active: false, email: null, code: 'P21' });
    const lines = await sql<{ person_id: string }>("select person_id from public.history_entries where raw_name = 'Bruno Exemplo'");
    expect(lines.length).toBe(ASSIGNMENTS.filter((a) => a.rawName === 'Bruno Exemplo').length);
    expect(lines.every((l) => l.person_id === bruno.id)).toBe(true);
    const ana = await sql<{ person_id: string }>("select person_id from public.history_entries where raw_name = 'Ana Fictícia'");
    expect(ana.every((l) => l.person_id === person(10))).toBe(true);
    expect(await sql("select * from public.history_entries where raw_name = 'Hugo Rascunho'")).toHaveLength(0);
  });

  it('IT-095 Equipe chama commit_history_import e recebe forbidden', async () => {
    const err = await rpcError(as('P10'), 'commit_history_import', { file_name: 'x.xlsx', weeks: WEEKS, name_links: {}, replace_weeks: [] });
    expect(err.code).toBe('forbidden');
    expect(await sql('select * from public.history_imports')).toHaveLength(0);
  });

  it('IT-096 semana arquivada publicada na plataforma aparece em history_facts sem importação', async () => {
    await sql(`
      insert into public.weeks (id, week_start, state, revision, published_at) values
        ('10000000-0000-4000-8000-000000000009', '2026-09-28', 'published', 1, now());
      insert into public.events (id, origin, title, starts_at, ends_at, service_type_id) values
        ('20000000-0000-4000-8000-000000000099', 'internal', 'Gravação aula História', '2026-09-30T09:00:00-03:00',
         '2026-09-30T12:00:00-03:00', 'c0000000-0000-4000-8000-000000000001');
      insert into public.slots (id, event_id, job_role_id) values
        ('30000000-0000-4000-8000-000000000099', '20000000-0000-4000-8000-000000000099', 'b0000000-0000-4000-8000-000000000001');
      insert into public.published_assignments (week_id, revision, event_id, slot_id, job_role_id, person_id) values
        ('10000000-0000-4000-8000-000000000009', 1, '20000000-0000-4000-8000-000000000099',
         '30000000-0000-4000-8000-000000000099', 'b0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000005');
    `);
    const { data } = await as('P1').from('history_facts').select('*');
    expect(data).toEqual([expect.objectContaining({
      event_id: '20000000-0000-4000-8000-000000000099', week_start: '2026-09-28', event_date: '2026-09-30',
      person_id: person(5), job_role_name: 'Câmera', service_type_name: 'Gravação de aula', hours: 3, source: 'platform',
    })]);
    // A semana A, publicada e corrente, ainda não é histórico.
    expect(data?.some((f) => f.event_id === EVENT.E1)).toBe(false);
  });
});
