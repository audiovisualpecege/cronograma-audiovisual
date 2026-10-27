// Domínio compartilhado entre o app, o worker e as funções SQL (TechSpec, Core Interfaces).
// Datas de calendário são 'YYYY-MM-DD' no fuso America/Sao_Paulo; instantes são Date.

export type Certainty = 'alta' | 'media' | 'baixa';
export type AssignmentStatus = 'proposed' | 'confirmed';
/**
 * off_hours: fora do horário de trabalho da pessoa (pode ser sugerida, por último, com o aviso); other_base: outra
 * sede (externo é só de Piracicaba; aula e gravação seguem a sede da série), nunca sugerida.
 */
export type Warning = 'overlap' | 'absent' | 'over_limit' | 'role_not_enabled' | 'off_hours' | 'other_base';

/** Sede da pessoa e da série. */
export type Base = 'piracicaba' | 'sao_paulo';

/**
 * Horário de trabalho por dia da semana ISO ('1' segunda a '7' domingo): entrada e saída 'HH:MM'. Dia sem chave
 * é dia de não trabalhar.
 */
export type WorkHours = Readonly<Record<string, readonly [string, string]>>;
export type Blocker = 'person_inactive' | 'event_cancelled' | 'same_event_twice' | 'week_past';
export type EventStatus = 'active' | 'changed' | 'cancelled';
export type EventOrigin = 'calendar' | 'internal';

export interface Interval {
  start: Date;
  end: Date;
}

export interface Eligibility {
  ok: boolean; // true quando não há bloqueio nem alerta
  blockers: Blocker[]; // impedem a gravação
  warnings: Warning[]; // permitem "escalar mesmo assim"
}

export interface Candidate {
  personId: string;
  code: string;
  hist: number;
  loadHours: number;
  loadCount: number;
  inTieGroup: boolean;
  /** Vezes que fez a função neste mesmo evento (turma fixa) nas 8 semanas anteriores; 0 sem datas no histórico. */
  series?: number;
  /** Posição da função na lista da pessoa (0 = principal); ausente quando a pessoa não tem ordem definida. */
  priority?: number;
  /** Nível da pessoa na função: 1 Apoio, 2 Titular, 3 Referência; ausente vale Titular. */
  level?: number;
  /** Fora do horário de trabalho: vem depois de quem está no horário, com o aviso. */
  offHours?: boolean;
  /** Turma fixa gravada da série: 0 titular, 1 reserva. Vem antes de todos. */
  pinned?: number;
}

/** Nível da pessoa numa função (person_roles.level). */
export const ROLE_LEVELS = { apoio: 1, titular: 2, referencia: 3 } as const;

export interface PersonLike {
  id: string;
  code: string; // P1, P2...
  name?: string;
  email?: string;
  active: boolean;
  weeklyLimitHours: number;
  roleIds: string[];
  /** Funções da mais para a menos prioritária, quando a pessoa tem ordem definida no cadastro. */
  rolePriority?: string[];
  /** Nível em cada função (1 Apoio, 2 Titular, 3 Referência); função fora do mapa vale Titular. */
  roleLevels?: Record<string, number>;
  /** Sede; sem sede, a sede não pesa. */
  base?: Base | null;
  /** Horário de trabalho; sem horário cadastrado, o horário não pesa. */
  workHours?: WorkHours | null;
}

export interface EventLike {
  id: string;
  weekStart: string;
  startsAt: Date;
  endsAt: Date;
  allDay: boolean;
  periodStart?: Date | null; // período informado para evento de dia inteiro
  periodEnd?: Date | null;
  status: EventStatus;
  serviceTypeId?: string | null;
  noTeam?: boolean;
  title?: string;
  /** Trabalho complexo (tipo marcado como complexo ou evento com estrela): pede a Referência primeiro. */
  complex?: boolean;
  /** Tipo externo (cobertura fora do estúdio): só a equipe de Piracicaba faz. */
  external?: boolean;
  /** Sede da série (aprendida de quem costuma fazer); nula quando não dá para saber. */
  base?: Base | null;
  /** Turma fixa gravada da série: por função, [titular, reserva] (series_rules.titulars). */
  titulars?: Readonly<Record<string, readonly string[]>>;
}

export interface SlotLike {
  id: string;
  code: string; // V1, V2...
  eventId: string;
  jobRoleId: string;
  archived?: boolean;
  /**
   * Função que não ocupa horário (Disponibilizador): a vaga não soma horas na carga da pessoa e não bate
   * horário com as outras atividades dela.
   */
  noHours?: boolean;
}

export interface AssignmentLike {
  slotId: string;
  eventId: string;
  personId: string;
  status: AssignmentStatus;
  locked: boolean;
}

export interface AbsenceLike {
  personId: string;
  startsAt: Date;
  endsAt: Date;
  archived?: boolean;
}

export interface CodedLike {
  id: string;
  code: string;
}

// Tudo o que as regras da semana precisam, já carregado pelo chamador.
export interface WeekContext {
  weekStart: string;
  now: Date;
  people: PersonLike[];
  events: EventLike[];
  slots: SlotLike[];
  assignments: AssignmentLike[];
  absences: AbsenceLike[];
  jobRoles?: CodedLike[];
  serviceTypes?: CodedLike[];
}

// Linha da fotografia publicada (published_assignments); personId nulo é "a definir".
export interface PubRow {
  eventId: string;
  jobRoleId: string;
  personId: string | null;
}

export type PersonChangeKind = 'entrou' | 'saiu' | 'mudou_evento' | 'mudou_funcao';

export interface PersonChange {
  kind: PersonChangeKind;
  eventId: string;
  jobRoleId: string;
  fromEventId?: string;
  fromJobRoleId?: string;
}

// Fato do histórico (view history_facts): uma alocação de uma pessoa numa função num evento.
export interface HistoryFact {
  eventId: string;
  weekStart: string;
  eventDate: string;
  title: string;
  serviceTypeId: string | null;
  jobRoleId: string | null;
  personId: string | null;
  hours: number;
}

export interface Period {
  from?: string; // 'YYYY-MM-DD', inclusivo
  to?: string; // 'YYYY-MM-DD', inclusivo
}
