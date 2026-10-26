// Simulação do porte do evento e do Disponibilizador no app local (npm run dev), enquanto as migrações 0017 e
// 0018 não estão no banco: o app finge que elas já entraram. EVENTO, GRAVACAO e PODCAST ganham porte e as equipes
// por porte da 0017, a TRANSMISSAO perde o Suporte, o DISPONIBILIZAR pede 1 Disponibilizador (função que não ocupa
// horário) e reconhece "*DISPONIBILIZAR" no começo do título. O porte escolhido em cada evento fica só neste
// navegador e, nas semanas montadas, as vagas vazias que sobram somem da tela. Nada disso vai para o banco. Some
// sozinha quando o banco tiver a 0017 (os tipos chegam com "sized") e nunca roda no app publicado nem nos testes.
import { EVENT_SIZES, isEventSize, normalizeName, type EventSize } from '@cronograma/core';
import { useSyncExternalStore } from 'react';
import { crewForSize, type CrewRow, type EventRow, type JobRoleRow, type PersonRoleRow, type ServiceTypeRow } from '../data/catalog';
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

interface Catalog {
  types: ServiceTypeRow[];
  crew: CrewRow[];
  roles: JobRoleRow[];
}

/** Tipos, equipe e funções como ficariam com a 0017 e a 0018, quando a simulação vale; senão, como vieram. */
export function previewCatalog(types: ServiceTypeRow[], crew: CrewRow[], roles: JobRoleRow[]): Catalog {
  if (types.length > 0) simulating = previewActive(types);
  return previewActive(types) ? simulateCatalog(types, crew, roles) : { types, crew, roles };
}

const DISPONIBILIZADOR_ID = 'sim:disponibilizador';

/** A 0018: a função Disponibilizador, que não ocupa horário (criada aqui quando o banco ainda não tem). */
function simulateRoles(roles: readonly JobRoleRow[]): JobRoleRow[] {
  const found = roles.some((r) => normalizeName(r.name) === 'disponibilizador');
  const out = roles.map((r) => (normalizeName(r.name) === 'disponibilizador' ? { ...r, no_hours: true, archived_at: null } : r));
  if (!found) {
    const sector = roles.find((r) => normalizeName(r.name) === 'operador aula')?.sector_id ?? null;
    out.push({ id: DISPONIBILIZADOR_ID, version: 1, code: 'R?', name: 'Disponibilizador', sector_id: sector, archived_at: null, no_hours: true } as JobRoleRow);
  }
  return out;
}

/** Tipos, equipe e funções como ficariam com a 0017 e a 0018. */
export function simulateCatalog(types: readonly ServiceTypeRow[], crew: readonly CrewRow[], baseRoles: readonly JobRoleRow[]): Catalog {
  const roles = simulateRoles(baseRoles);
  const roleId = new Map(roles.filter((r) => !r.archived_at).map((r) => [normalizeName(r.name), r.id]));
  const suporte = roleId.get('suporte');
  const outTypes: ServiceTypeRow[] = [];
  const outCrew: CrewRow[] = crew.map((c) => ({ ...c, size: 2 }));
  for (const t of types) {
    const name = normalizeName(t.name);
    if (name === 'disponibilizar' && !t.archived_at) {
      const disp = roleId.get('disponibilizador') as string;
      outTypes.push({ ...t, no_team: false, sized: false, default_size: 1, keywords: [...new Set([...t.keywords, '*disponibilizar'])] });
      for (let i = outCrew.length - 1; i >= 0; i--) if (outCrew[i]?.service_type_id === t.id) outCrew.splice(i, 1);
      outCrew.push({ id: `sim:${t.id}:${disp}`, version: 1, service_type_id: t.id, job_role_id: disp, quantity: 1, size: 2, archived_at: null } as CrewRow);
      continue;
    }
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
  return { types: outTypes, crew: outCrew, roles };
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
  const { types, crew, roles } = simulateCatalog(rows.types, rows.crew, rows.roles);
  const events: EventRow[] = rows.events.map((e) => (sizes[e.id] ? { ...e, size: sizes[e.id] } : e));
  const filled = new Set(rows.assignments.filter((a) => a.person_id).map((a) => a.slot_id));
  const hidden = new Set<string>();
  for (const e of events) {
    const type = types.find((t) => t.id === e.service_type_id);
    if (!type || type.no_team || e.no_team) continue;
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
  return { ...rows, types, crew, roles, events, slots, personRoles: simulatePersonRoles(rows.personRoles, roles) };
}

/** A 0018 dá Disponibilizador, por último na lista, a quem tem Operador Aula. */
function simulatePersonRoles(personRoles: readonly PersonRoleRow[], roles: readonly JobRoleRow[]): PersonRoleRow[] {
  const disp = roles.find((r) => normalizeName(r.name) === 'disponibilizador');
  const aula = roles.find((r) => normalizeName(r.name) === 'operador aula');
  if (!disp || !aula) return [...personRoles];
  const has = new Set(personRoles.filter((r) => r.job_role_id === disp.id).map((r) => r.person_id));
  const given = personRoles
    .filter((r) => r.job_role_id === aula.id && !r.archived_at && !has.has(r.person_id))
    .map((r) => ({ id: `sim:${r.person_id}:${disp.id}`, version: 1, person_id: r.person_id, job_role_id: disp.id, archived_at: null, priority: 1000, level: 2 }) as PersonRoleRow);
  return [...personRoles, ...given];
}

/** Vagas que o porte pede e a semana montada não tem (a simulação não cria vagas), em linhas já simuladas. */
export function previewMissingSlots(rows: WeekRows, e: EventRow): number {
  const type = rows.types.find((t) => t.id === e.service_type_id);
  if (!simulating || !rows.week || !type || type.no_team || e.no_team || e.status === 'cancelled' || e.ignored) return 0;
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
