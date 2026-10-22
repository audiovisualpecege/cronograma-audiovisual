// Domínio compartilhado entre o app, o worker e as funções SQL (TechSpec, Core Interfaces).
// Datas de calendário são 'YYYY-MM-DD' no fuso America/Sao_Paulo; instantes são Date.

export type Certainty = 'alta' | 'media' | 'baixa';
export type AssignmentStatus = 'proposed' | 'confirmed';
export type Warning = 'overlap' | 'absent' | 'over_limit' | 'role_not_enabled';
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
}

export interface SlotLike {
  id: string;
  code: string; // V1, V2...
  eventId: string;
  jobRoleId: string;
  archived?: boolean;
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
