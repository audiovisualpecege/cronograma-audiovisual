// Simulação do porte do evento e do Disponibilizador no app local (npm run dev), enquanto as migrações 0017 e
// 0018 não estão no banco: o app finge que elas já entraram. EVENTO, GRAVACAO e PODCAST ganham porte e as equipes
// por porte da 0017, a TRANSMISSAO perde o Suporte, o DISPONIBILIZAR pede 1 Disponibilizador (função que não ocupa
// horário) e reconhece "*DISPONIBILIZAR" no começo do título. O porte escolhido em cada evento fica só neste
// navegador e, nas semanas montadas, as vagas vazias que sobram somem da tela. A 0020: os tipos ganham as
// palavras-chave de começo ("^reuniao") e os eventos de agora em diante com tipo automático trocam de tipo pelo
// começo do título e pela série; a troca de tipo à mão ensina a série só neste navegador. Nada disso vai para o
// banco. Some sozinha quando o banco tiver a 0017 (os tipos chegam com "sized") e nunca roda no app publicado nem
// nos testes.
import { classifyTitle, EVENT_SIZES, eventSeries, isEventSize, isPrefixKeyword, normalizeName, weekStartOf, type EventSize } from '@cronograma/core';
import { useSyncExternalStore } from 'react';
import {
  crewForSize,
  seriesRuleMap,
  seriesTypesOf,
  type CrewRow,
  type EventRow,
  type JobRoleRow,
  type PersonRoleRow,
  type PersonRow,
  type SectorRow,
  type SeriesRuleRow,
  type ServiceTypeRow,
} from '../data/catalog';
import type { WeekRows } from '../week/model';

const ENABLED = import.meta.env.DEV && import.meta.env.MODE !== 'test';
const STORAGE_KEY = 'cronograma:simulacao-porte';
const SERIES_KEY = 'cronograma:simulacao-serie';
const PEOPLE_KEY = 'cronograma:simulacao-pessoas';
const EXTERNAL_KEY = 'cronograma:simulacao-externo';

/** A 0020: palavras-chave de começo, pelo nome normalizado do tipo. */
const OPENINGS: Record<string, string[]> = {
  'reuniao interna': ['^reuniao'],
  'reuniao mediadores': ['^reuniao mediadores', '^reuniao mediacao'],
  'reuniao tecnica aulas': ['^reuniao tecnica'],
  'reuniao edicao': ['^reuniao edicao'],
  'reuniao producao': ['^reuniao producao'],
  'reuniao planejamento': ['^reuniao planejamento'],
  'aula mba': ['^mba', '^faculdade', '^poli', '^especializacao', '^minicurso', '^gravacao mba'],
  'curso online': ['^curso', '^english', '^gravacao english'],
  webinar: ['^webinar'],
  evento: ['^evento'],
  'edicao fotos': ['^tratamento'],
  gravacao: ['^gravacao'],
  'gravacao externa': ['^gravacao externa'],
  'aula solution': ['^gravacao solution'],
  podcast: ['^gravacao podcast', '^gravacao videocast'],
};

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

/** Tipos, equipe e funções como ficariam com a 0017 a 0019, quando a simulação vale; senão, como vieram. */
export function previewCatalog(types: ServiceTypeRow[], crew: CrewRow[], roles: JobRoleRow[], sectors: readonly SectorRow[] = []): Catalog {
  if (types.length > 0) simulating = previewActive(types);
  return previewActive(types) ? simulateCatalog(types, crew, roles, sectors) : { types, crew, roles };
}

/** A 0019: reuniões de setor sem equipe, ligadas ao setor (tipo e setor pelo nome normalizado). */
const MEETINGS: Record<string, string> = {
  'reuniao edicao': 'edicao',
  'reuniao producao': 'producao',
  'reuniao planejamento': 'planejamento',
  'reuniao tecnica aulas': 'tecnica',
  'reuniao mediadores': 'mediacao',
};

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
export function simulateCatalog(
  types: readonly ServiceTypeRow[],
  crew: readonly CrewRow[],
  baseRoles: readonly JobRoleRow[],
  sectors: readonly SectorRow[] = [],
): Catalog {
  const roles = simulateRoles(baseRoles);
  const roleId = new Map(roles.filter((r) => !r.archived_at).map((r) => [normalizeName(r.name), r.id]));
  const sectorId = new Map(sectors.filter((s) => !s.archived_at).map((s) => [normalizeName(s.name), s.id]));
  const suporte = roleId.get('suporte');
  const outTypes: ServiceTypeRow[] = [];
  const outCrew: CrewRow[] = crew.map((c) => ({ ...c, size: 2 }));
  for (const t of types) {
    const name = normalizeName(t.name);
    const meeting = name === 'reuniao interna' ? '*' : MEETINGS[name];
    if (meeting && !t.archived_at) {
      // A interna vai para todos os setores; as outras, para o setor delas.
      const sector = sectorId.get(meeting);
      const ids = meeting === '*' ? [...sectorId.values()] : sector ? [sector] : [];
      outTypes.push({ ...t, no_team: true, sized: false, default_size: 1, sector_ids: ids });
      for (let i = outCrew.length - 1; i >= 0; i--) if (outCrew[i]?.service_type_id === t.id) outCrew.splice(i, 1);
      continue;
    }
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
  const marked = ENABLED ? externalStore.read() : {};
  const withOpenings = outTypes.map((t) => {
    const add = t.archived_at ? undefined : OPENINGS[normalizeName(t.name)];
    const external = marked[t.id] ?? (t.external ?? EXTERNAL.has(normalizeName(t.name)));
    return { ...t, external, ...(add ? { keywords: [...new Set([...(t.keywords ?? []), ...add])] } : {}) };
  });
  return { types: withOpenings, crew: outCrew, roles };
}

// ---------------------------------------------------------------------------------------------
// Porte escolhido em cada evento e tipo aprendido por série, só neste navegador.

/** Um mapa guardado no navegador, com aviso para as telas quando muda. */
function localMap<T>(key: string, valid: (v: unknown) => v is T) {
  const listeners = new Set<() => void>();
  let cache: Readonly<Record<string, T>> | null = null;
  const read = (): Readonly<Record<string, T>> => {
    if (cache) return cache;
    try {
      const raw = JSON.parse(window.localStorage.getItem(key) ?? '{}') as Record<string, unknown>;
      cache = Object.fromEntries(Object.entries(raw).filter((e): e is [string, T] => valid(e[1])));
    } catch {
      cache = {};
    }
    return cache;
  };
  const set = (id: string, value: T) => {
    cache = { ...read(), [id]: value };
    try {
      window.localStorage.setItem(key, JSON.stringify(cache));
    } catch {
      // Sem armazenamento: vale até recarregar a página.
    }
    listeners.forEach((l) => l());
  };
  const subscribe = (l: () => void) => {
    listeners.add(l);
    return () => listeners.delete(l);
  };
  return { read, set, subscribe };
}

/** O que a série aprendeu neste navegador (0020 e 0021). */
export interface LearnedSeries {
  type?: string;
  crew?: { job_role_id: string; quantity: number }[] | null;
  crewType?: string | null;
  size?: number;
  titulars?: Record<string, string[]>;
}

type Sizes = Readonly<Record<string, EventSize>>;
type Learned = Readonly<Record<string, LearnedSeries>>;
const sizeStore = localMap(STORAGE_KEY, isEventSize);
const seriesStore = localMap(SERIES_KEY, (v): v is LearnedSeries => typeof v === 'object' && v !== null);

function learn(title: string, patch: LearnedSeries) {
  const series = eventSeries(title);
  if (series) seriesStore.set(series, { ...seriesStore.read()[series], ...patch });
}

/** A 0021: o porte escolhido vira o da série e esquece as vagas aprendidas (aqui, só neste navegador). */
export function setPreviewSize(eventId: string, size: EventSize, title?: string) {
  sizeStore.set(eventId, size);
  if (title) learn(title, { size, crew: null, crewType: null });
}

/** A 0020: a troca de tipo à mão ensina a série (aqui, só neste navegador). */
export function learnPreviewSeries(title: string, typeId: string) {
  learn(title, { type: typeId });
}

/** A 0023: a resposta "virou o titular?" grava a turma fixa da série (aqui, só neste navegador). */
export function learnPreviewTitular(series: string, roleId: string, people: string[]) {
  const l = seriesStore.read()[series];
  seriesStore.set(series, { ...l, titulars: { ...l?.titulars, [roleId]: people } });
}

/** A 0021: pôr ou tirar vaga ensina as vagas da série (aqui, só neste navegador). */
export function learnPreviewCrew(title: string, typeId: string, roleIds: readonly string[]) {
  const counts = new Map<string, number>();
  for (const r of roleIds) counts.set(r, (counts.get(r) ?? 0) + 1);
  learn(title, { crew: [...counts].map(([job_role_id, quantity]) => ({ job_role_id, quantity })), crewType: typeId });
}

/** O aprendido neste navegador por cima do que veio do banco, como linhas de series_rules. */
function mergeRules(rules: readonly SeriesRuleRow[] | undefined, learned: Learned): SeriesRuleRow[] {
  const out = seriesRuleMap(rules);
  for (const [series, l] of Object.entries(learned)) {
    const r = out.get(series) ?? ({ id: `sim:${series}`, version: 0, updated_at: '', series, service_type_id: null } as SeriesRuleRow);
    out.set(series, {
      ...r,
      ...(l.type ? { service_type_id: l.type } : {}),
      ...(l.crew !== undefined ? { crew: l.crew, crew_type_id: l.crewType ?? null } : {}),
      ...(l.size !== undefined ? { size: l.size } : {}),
      ...(l.titulars ? { titulars: { ...r.titulars, ...l.titulars } } : {}),
    });
  }
  return [...out.values()];
}

// ---------------------------------------------------------------------------------------------
// A 0022 no app local: sede e horário das pessoas e "externo" nos tipos, guardados neste navegador enquanto o
// banco não tem as colunas.

export interface PersonExtras {
  base: PersonRow['base'];
  work_hours: PersonRow['work_hours'];
}

const personStore = localMap(PEOPLE_KEY, (v): v is PersonExtras => typeof v === 'object' && v !== null);
const externalStore = localMap(EXTERNAL_KEY, (v): v is boolean => typeof v === 'boolean');

/** Tipos externos da 0022, pelo nome normalizado. */
const EXTERNAL = new Set(['evento', 'fotos', 'gravacao externa']);

/** O banco ainda não tem a sede das pessoas (as linhas chegam sem a coluna). */
export function peopleColumnsMissing(people: readonly PersonRow[]): boolean {
  return ENABLED && people.length > 0 && people.every((p) => p.base === undefined);
}

export function setPreviewPerson(id: string, extras: PersonExtras) {
  personStore.set(id, extras);
}

export function setPreviewExternal(typeId: string, external: boolean) {
  externalStore.set(typeId, external);
}

/** As pessoas com a sede e o horário guardados neste navegador, enquanto o banco não tem as colunas. */
export function previewPeople(people: readonly PersonRow[], extras: Readonly<Record<string, PersonExtras>> = personStore.read()): PersonRow[] {
  if (!peopleColumnsMissing(people)) return [...people];
  return people.map((p) => (extras[p.id] ? { ...p, ...extras[p.id] } : p));
}

export function usePreviewPeople(): Readonly<Record<string, PersonExtras>> {
  return useSyncExternalStore(personStore.subscribe, () => (ENABLED ? personStore.read() : EMPTY));
}

export function usePreviewExternal(): Readonly<Record<string, boolean>> {
  return useSyncExternalStore(externalStore.subscribe, () => (ENABLED ? externalStore.read() : EMPTY));
}

const EMPTY = {};

export function usePreviewSizes(): Sizes {
  return useSyncExternalStore(sizeStore.subscribe, () => (ENABLED ? sizeStore.read() : EMPTY));
}

export function usePreviewSeries(): Learned {
  return useSyncExternalStore(seriesStore.subscribe, () => (ENABLED ? seriesStore.read() : EMPTY));
}

/**
 * A semana como ficaria com a 0017 a 0020: tipos e equipes por porte, o porte escolhido neste navegador, o tipo
 * pelo começo do título e pela série nos eventos de agora em diante e, nas semanas montadas, só as vagas que o
 * tipo e o porte pedem (as vazias que sobram somem; vaga com gente fica).
 */
export function previewWeekRows(rows: WeekRows, sizes: Sizes, learned: Learned = {}): WeekRows {
  previewCatalog(rows.types, rows.crew, rows.roles);
  return previewActive(rows.types) ? simulateWeek(rows, sizes, learned) : rows;
}

/**
 * A 0020 nos eventos de agora em diante com tipo automático: o tipo da série ou do começo do título, quando é
 * outro. Título com asterisco fica como está.
 */
function retype(events: readonly EventRow[], types: readonly ServiceTypeRow[], series: ReadonlyMap<string, string>, weekStart: string): EventRow[] {
  if (weekStart < weekStartOf(new Date())) return [...events];
  // Só a série e as palavras-chave de começo, como a 0020 faz no banco.
  const openings = types.filter((t) => !t.archived_at).map((t) => ({ id: t.id, code: t.code, keywords: (t.keywords ?? []).filter(isPrefixKeyword) }));
  return events.map((e) => {
    if (e.status === 'cancelled' || e.type_source === 'admin' || e.title.trimStart().startsWith('*')) return e;
    const c = classifyTitle(e.title, openings, [], series);
    if (!c.typeId || c.typeId === e.service_type_id) return e;
    // Como a retype_event da 0020: o "não exige equipe" copiado do tipo antigo segue o tipo novo.
    const noTeam = (id: string | null | undefined) => Boolean(types.find((t) => t.id === id)?.no_team);
    const team = e.no_team && noTeam(e.service_type_id) ? { no_team: noTeam(c.typeId) } : {};
    return { ...e, service_type_id: c.typeId, type_source: c.source, type_certainty: 'alta', ...team };
  });
}

/** A semana como ficaria com a 0017 a 0020 (ver previewWeekRows). */
export function simulateWeek(rows: WeekRows, sizes: Sizes, learned: Learned = {}): WeekRows {
  const { types, crew, roles } = simulateCatalog(rows.types, rows.crew, rows.roles);
  const seriesRules = mergeRules(rows.seriesRules, learned);
  const events: EventRow[] = retype(rows.events, types, seriesTypesOf(seriesRules), rows.weekStart).map((e) => (sizes[e.id] ? { ...e, size: sizes[e.id] } : e));
  const filled = new Set(rows.assignments.filter((a) => a.person_id).map((a) => a.slot_id));
  const hidden = new Set<string>();
  for (const e of events) {
    const type = types.find((t) => t.id === e.service_type_id);
    if (!type) continue;
    // Tipo que deixou de pedir equipe (reunião de setor): as vagas vazias somem.
    if (type.no_team || e.no_team) {
      for (const s of rows.slots) if (s.event_id === e.id && !s.archived_at && !filled.has(s.id)) hidden.add(s.id);
      continue;
    }
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
  return { ...rows, types, crew, roles, events, slots, seriesRules, people: previewPeople(rows.people), personRoles: simulatePersonRoles(rows.personRoles, roles) };
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
