// Simulação do porte do evento no app local (npm run dev), enquanto a migração 0017 não está no banco: o app
// finge que ela já entrou. EVENTO, GRAVACAO e PODCAST ganham porte e as equipes por porte da 0017, a TRANSMISSAO
// perde o Suporte, o porte escolhido em cada evento fica só neste navegador e, nas semanas montadas, as vagas
// vazias que sobram no porte somem da tela. Nada disso vai para o banco. Some sozinha quando o banco tiver a 0017
// (os tipos chegam com "sized") e nunca roda no app publicado nem nos testes.
import { EVENT_SIZES, isEventSize, normalizeName, type EventSize } from '@cronograma/core';
import { useSyncExternalStore } from 'react';
import { crewForSize, type CrewRow, type EventRow, type JobRoleRow, type ServiceTypeRow } from '../data/catalog';
import type { WeekRows } from '../week/model';

const ENABLED = import.meta.env.DEV && import.meta.env.MODE !== 'test';
const STORAGE_KEY = 'cronograma:simulacao-porte';

/** A equipe da 0017: tipo, porte, função e quantidade, pelos nomes normalizados. */
const PLAN: Record<string, { defaultSize: EventSize; crew: [EventSize, string, number][] }> = {
  evento: {
    defaultSize: 1,
    crew: [
      [1, 'operador evento', 1],
      [2, 'operador evento', 1], [2, 'cinegrafista', 1], [2, 'fotografia', 1],
      [3, 'operador auditorio', 1], [3, 'operador evento', 1], [3, 'cinegrafista', 2], [3, 'fotografia', 2], [3, 'producao', 2],
    ],
  },
  gravacao: {
    defaultSize: 2,
    crew: [[1, 'cinegrafista', 1], [2, 'cinegrafista', 1], [2, 'producao', 1], [3, 'cinegrafista', 2], [3, 'producao', 2]],
  },
  podcast: {
    defaultSize: 2,
    crew: [
      [1, 'operador evento', 1],
      [2, 'cinegrafista', 1], [2, 'operador evento', 1], [2, 'producao', 1],
      [3, 'cinegrafista', 2], [3, 'operador evento', 1], [3, 'producao', 1],
    ],
  },
};

/** Ligada na última leitura dos tipos: o banco ainda não tem a 0017. */
let simulating = false;

/** A simulação vale no app local enquanto nenhum tipo vem do banco com o campo "sized". */
export function previewActive(types: readonly ServiceTypeRow[]): boolean {
  return ENABLED && types.length > 0 && types.every((t) => t.sized === undefined);
}

/** Tipos e equipe como ficariam com a 0017, quando a simulação vale; senão, como vieram. */
export function previewCatalog(types: ServiceTypeRow[], crew: CrewRow[], roles: readonly JobRoleRow[]): { types: ServiceTypeRow[]; crew: CrewRow[] } {
  if (types.length > 0) simulating = previewActive(types);
  return previewActive(types) ? simulateCatalog(types, crew, roles) : { types, crew };
}

/** Tipos e equipe como ficariam com a 0017. */
export function simulateCatalog(types: readonly ServiceTypeRow[], crew: readonly CrewRow[], roles: readonly JobRoleRow[]): { types: ServiceTypeRow[]; crew: CrewRow[] } {
  const roleId = new Map(roles.filter((r) => !r.archived_at).map((r) => [normalizeName(r.name), r.id]));
  const suporte = roleId.get('suporte');
  const outTypes: ServiceTypeRow[] = [];
  const outCrew: CrewRow[] = crew.map((c) => ({ ...c, size: 2 }));
  for (const t of types) {
    const name = normalizeName(t.name);
    const plan = PLAN[name];
    const rows = plan?.crew.filter(([, role]) => roleId.has(role)) ?? [];
    if (plan && !t.archived_at && !t.no_team && EVENT_SIZES.every((s) => rows.some(([size]) => size === s))) {
      outTypes.push({ ...t, sized: true, default_size: plan.defaultSize });
      for (let i = outCrew.length - 1; i >= 0; i--) if (outCrew[i]?.service_type_id === t.id) outCrew.splice(i, 1);
      for (const [size, role, quantity] of rows) {
        const id = roleId.get(role) as string;
        outCrew.push({ id: `sim:${t.id}:${size}:${id}`, version: 1, service_type_id: t.id, job_role_id: id, quantity, size, archived_at: null } as CrewRow);
      }
      continue;
    }
    if (name === 'transmissao' && suporte && outCrew.some((c) => c.service_type_id === t.id && !c.archived_at && c.job_role_id !== suporte)) {
      for (let i = outCrew.length - 1; i >= 0; i--) {
        const c = outCrew[i];
        if (c?.service_type_id === t.id && c.job_role_id === suporte) outCrew.splice(i, 1);
      }
    }
    outTypes.push({ ...t, sized: false, default_size: 1 });
  }
  return { types: outTypes, crew: outCrew };
}

// ---------------------------------------------------------------------------------------------
// Porte escolhido em cada evento, só neste navegador.

type Sizes = Readonly<Record<string, EventSize>>;
const listeners = new Set<() => void>();
let cache: Sizes | null = null;

function readSizes(): Sizes {
  if (cache) return cache;
  try {
    const raw = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, unknown>;
    cache = Object.fromEntries(Object.entries(raw).filter((e): e is [string, EventSize] => isEventSize(e[1])));
  } catch {
    cache = {};
  }
  return cache;
}

export function setPreviewSize(eventId: string, size: EventSize) {
  cache = { ...readSizes(), [eventId]: size };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // Sem armazenamento: vale até recarregar a página.
  }
  listeners.forEach((l) => l());
}

const EMPTY: Sizes = {};

export function usePreviewSizes(): Sizes {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => (ENABLED ? readSizes() : EMPTY),
  );
}

/**
 * A semana como ficaria com a 0017: tipos e equipes por porte, o porte escolhido neste navegador e, nas semanas
 * montadas, só as vagas do porte em cada evento com porte (as vazias que sobram somem; vaga com gente fica).
 */
export function previewWeekRows(rows: WeekRows, sizes: Sizes): WeekRows {
  previewCatalog(rows.types, rows.crew, rows.roles);
  return previewActive(rows.types) ? simulateWeek(rows, sizes) : rows;
}

/** A semana como ficaria com a 0017 (ver previewWeekRows). */
export function simulateWeek(rows: WeekRows, sizes: Sizes): WeekRows {
  const { types, crew } = simulateCatalog(rows.types, rows.crew, rows.roles);
  const events: EventRow[] = rows.events.map((e) => (sizes[e.id] ? { ...e, size: sizes[e.id] } : e));
  const filled = new Set(rows.assignments.filter((a) => a.person_id).map((a) => a.slot_id));
  const hidden = new Set<string>();
  for (const e of events) {
    const type = types.find((t) => t.id === e.service_type_id);
    if (!type?.sized || e.no_team) continue;
    const want = new Map(crewForSize(type, crew, e.size).map((c) => [c.job_role_id, c.quantity]));
    const slots = rows.slots.filter((s) => s.event_id === e.id && !s.archived_at).sort((a, b) => Number(filled.has(b.id)) - Number(filled.has(a.id)));
    const used = new Map<string, number>();
    for (const s of slots) {
      const n = used.get(s.job_role_id) ?? 0;
      if (n >= (want.get(s.job_role_id) ?? 0) && !filled.has(s.id) && !s.extra) hidden.add(s.id);
      else used.set(s.job_role_id, n + 1);
    }
  }
  const slots = hidden.size ? rows.slots.map((s) => (hidden.has(s.id) ? { ...s, archived_at: 'simulacao' } : s)) : rows.slots;
  return { ...rows, types, crew, events, slots };
}

/** Vagas que o porte pede e a semana montada não tem (a simulação não cria vagas), em linhas já simuladas. */
export function previewMissingSlots(rows: WeekRows, e: EventRow): number {
  const type = rows.types.find((t) => t.id === e.service_type_id);
  if (!simulating || !rows.week || !type?.sized || e.no_team || e.status === 'cancelled' || e.ignored) return 0;
  let missing = 0;
  for (const c of crewForSize(type, rows.crew, e.size)) {
    const have = rows.slots.filter((s) => s.event_id === e.id && !s.archived_at && s.job_role_id === c.job_role_id).length;
    missing += Math.max(0, c.quantity - have);
  }
  return missing;
}

/** A tela está mostrando a simulação (o porte vai para este navegador, não para o banco). */
export function isSimulating(): boolean {
  return simulating;
}
