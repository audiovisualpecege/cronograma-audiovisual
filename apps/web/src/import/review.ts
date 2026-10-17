// Regras da revisão da importação (US-007): o que a tela propõe para cada nome, função e evento lidos, e o
// pedido que vai para commit_history_import depois da confirmação.
import {
  classifyTitle,
  matchName,
  normalizeName,
  type ImportPlan,
  type ParsedWeek,
  type SkipReason,
  type TitleIndex,
} from '@cronograma/core';
import type { JobRoleRow, PersonRow, ServiceTypeRow } from '../data/catalog';

/** Ligação de um nome lido: a pessoa sugerida ou outra escolhida, uma pessoa nova inativa, ou ignorar. */
export type NameChoice =
  | { mode: 'suggested'; personId: string }
  | { mode: 'other'; personId: string | null }
  | { mode: 'create' }
  | { mode: 'ignore' };

export interface NameRow {
  raw: string;
  count: number;
  suggestion: { id: string; name: string; exact: boolean } | null;
}

/** Como o banco limpa o nome lido (clean_name): espaços simples, sem espaço nas pontas. */
export const cleanName = (s: string) => s.trim().replace(/\s+/g, ' ');

export function readNames(weeks: readonly ParsedWeek[], people: readonly PersonRow[]): NameRow[] {
  const counts = new Map<string, number>();
  for (const w of weeks) for (const e of w.events) for (const a of e.assignments) {
    const raw = cleanName(a.rawName);
    if (raw) counts.set(raw, (counts.get(raw) ?? 0) + 1);
  }
  const candidates = people.map((p) => ({ id: p.id, name: p.name }));
  return [...counts.entries()]
    .map(([raw, count]) => {
      const exact = people.find((p) => normalizeName(p.name) === normalizeName(raw));
      if (exact) return { raw, count, suggestion: { id: exact.id, name: exact.name, exact: true } };
      const best = matchName(raw, candidates)[0];
      return { raw, count, suggestion: best?.id ? { id: best.id, name: best.name, exact: false } : null };
    })
    .sort((a, b) => a.raw.localeCompare(b.raw, 'pt-BR'));
}

export function defaultNameChoice(row: NameRow): NameChoice {
  return row.suggestion ? { mode: 'suggested', personId: row.suggestion.id } : { mode: 'create' };
}

/** Rótulos de função lidos e a função do cadastro proposta para cada um (nula = sem função). */
export function readRoleLabels(weeks: readonly ParsedWeek[], roles: readonly JobRoleRow[]): { label: string; count: number; suggested: string | null }[] {
  const counts = new Map<string, number>();
  for (const w of weeks) for (const e of w.events) for (const a of e.assignments) {
    if (a.role) counts.set(a.role, (counts.get(a.role) ?? 0) + 1);
  }
  const active = roles.filter((r) => !r.archived_at);
  return [...counts.entries()]
    .map(([label, count]) => {
      const exact = active.find((r) => normalizeName(r.name) === normalizeName(label) || r.code === label.trim().toUpperCase());
      const near = exact ?? active.find((r) => r.id === matchName(label, active.map((x) => ({ id: x.id, name: x.name })))[0]?.id);
      return { label, count, suggested: near?.id ?? null };
    })
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'pt-BR'));
}

export const eventKey = (weekStart: string, index: number) => `${weekStart}|${index}`;

/** Tipo proposto para cada evento: o escrito na planilha, senão o das palavras-chave ou do histórico de títulos. */
export function defaultTypes(weeks: readonly ParsedWeek[], types: readonly ServiceTypeRow[], titles: TitleIndex): Record<string, string> {
  const active = types.filter((t) => !t.archived_at);
  const like = active.map((t) => ({ id: t.id, code: t.code, keywords: t.keywords ?? [] }));
  const out: Record<string, string> = {};
  for (const w of weeks) {
    w.events.forEach((e, i) => {
      const written = e.typeLabel
        ? active.find((t) => normalizeName(t.name) === normalizeName(e.typeLabel ?? '') || t.code === (e.typeLabel ?? '').trim().toUpperCase())
        : undefined;
      if (written) {
        out[eventKey(w.weekStart, i)] = written.id;
        return;
      }
      const c = classifyTitle(e.title, like, titles);
      if (c.typeId && c.certainty !== 'baixa') out[eventKey(w.weekStart, i)] = c.typeId;
    });
  }
  return out;
}

export interface CommitArgs {
  file_name: string;
  weeks: ParsedWeek[];
  name_links: Record<string, { person_id: string } | { create: true } | { ignore: true }>;
  replace_weeks: string[];
  role_links: Record<string, string | null>;
  type_links: Record<string, string>;
}

export function nameChoiceReady(c: NameChoice): boolean {
  return c.mode !== 'other' || Boolean(c.personId);
}

/** Pedido de gravação: só as semanas do plano, com o tipo escolhido em cada evento (pelo código do tipo). */
export function buildCommit(input: {
  fileName: string;
  plan: ImportPlan;
  names: Record<string, NameChoice>;
  roles: Record<string, string | null>;
  eventTypes: Record<string, string>;
  types: readonly ServiceTypeRow[];
}): CommitArgs {
  const code = new Map(input.types.map((t) => [t.id, t.code]));
  const weeks = input.plan.toImport.map((w) => ({
    ...w,
    events: w.events.map((e, i) => {
      const typeId = input.eventTypes[eventKey(w.weekStart, i)];
      return { ...e, typeLabel: typeId ? (code.get(typeId) ?? null) : null };
    }),
  }));
  const name_links: CommitArgs['name_links'] = {};
  for (const [raw, c] of Object.entries(input.names)) {
    if (c.mode === 'ignore') name_links[raw] = { ignore: true };
    else if (c.mode === 'create') name_links[raw] = { create: true };
    else if (c.personId) name_links[raw] = { person_id: c.personId };
  }
  return {
    file_name: input.fileName,
    weeks,
    name_links,
    replace_weeks: input.plan.replaceWeeks,
    role_links: { ...input.roles },
    type_links: {},
  };
}

export const SKIP_REASON: Record<SkipReason, string> = {
  celula_mesclada: 'células mescladas fora do padrão',
  data_invalida: 'data inválida',
  horario_invalido: 'horário inválido',
  sem_data: 'linha sem data',
  observacao: 'observação, não é evento',
  nome_nao_reconhecido: 'nome não reconhecido',
  layout_desconhecido: 'formato de aba não reconhecido',
  aba_vazia: 'aba vazia',
  aba_resumo: 'aba de resumo',
  aba_cadastro: 'aba de cadastro',
};
