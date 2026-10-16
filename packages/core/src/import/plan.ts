// Plano da importação mostrado na revisão antes de gravar (US-007 AC-1, EC-4, EC-9).
import type { ParsedWeek } from './types.ts';

export type WeekChoice = 'replace' | 'ignore';

export interface PlannedWeek {
  weekStart: string;
  status: 'new' | 'already_imported';
  choice: WeekChoice | null; // só para already_imported
  events: number;
  assignments: number;
}

export interface ImportPlan {
  weeks: PlannedWeek[];
  /** Semanas a partir da primeira montada na plataforma: nunca sobrescritas. */
  excluded: { weekStart: string; reason: 'platform_week' }[];
  cutoff: string | null;
  /** Semanas já importadas que ainda esperam "substituir" ou "ignorar". */
  needsChoice: string[];
  ready: boolean;
  /** O que vai para commit_history_import: semanas novas e as já importadas com "substituir". */
  toImport: ParsedWeek[];
  replaceWeeks: string[];
}

export interface ImportPlanInput {
  weeks: ParsedWeek[];
  platformWeeks: string[]; // semanas com linha em `weeks` (montadas ou publicadas)
  importedWeeks: string[]; // semanas com linhas em history_entries
  choices?: Record<string, WeekChoice>;
}

export function planImport(input: ImportPlanInput): ImportPlan {
  const cutoff = input.platformWeeks.length ? [...input.platformWeeks].sort()[0] as string : null;
  const imported = new Set(input.importedWeeks);
  const choices = input.choices ?? {};
  const weeks: PlannedWeek[] = [];
  const excluded: ImportPlan['excluded'] = [];
  const toImport: ParsedWeek[] = [];
  const replaceWeeks: string[] = [];
  const needsChoice: string[] = [];

  for (const w of [...input.weeks].sort((a, b) => a.weekStart.localeCompare(b.weekStart))) {
    if (cutoff && w.weekStart >= cutoff) {
      excluded.push({ weekStart: w.weekStart, reason: 'platform_week' });
      continue;
    }
    const already = imported.has(w.weekStart);
    const choice = already ? (choices[w.weekStart] ?? null) : null;
    weeks.push({
      weekStart: w.weekStart,
      status: already ? 'already_imported' : 'new',
      choice,
      events: w.events.length,
      assignments: w.events.reduce((n, e) => n + e.assignments.length, 0),
    });
    if (already && !choice) needsChoice.push(w.weekStart);
    if (!already || choice === 'replace') toImport.push(w);
    if (already && choice === 'replace') replaceWeeks.push(w.weekStart);
  }
  return {
    weeks,
    excluded,
    cutoff,
    needsChoice,
    ready: needsChoice.length === 0 && toImport.length > 0,
    toImport,
    replaceWeeks,
  };
}

/** Nomes, funções e tipos lidos, com quantas vezes aparecem, para ligar ao cadastro na revisão. */
export function importLabels(weeks: ParsedWeek[]): { names: Map<string, number>; roles: string[]; types: string[] } {
  const names = new Map<string, number>();
  const roles: string[] = [];
  const types: string[] = [];
  for (const w of weeks) {
    for (const e of w.events) {
      if (e.typeLabel) types.push(e.typeLabel);
      for (const a of e.assignments) {
        names.set(a.rawName, (names.get(a.rawName) ?? 0) + 1);
        if (a.role) roles.push(a.role);
      }
    }
  }
  return { names, roles, types };
}
