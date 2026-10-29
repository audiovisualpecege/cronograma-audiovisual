// Validadores dos cadastros. Os códigos são os mesmos que as funções SQL levantam (tarefa 3);
// o app valida antes de enviar e o banco valida de novo.
import { isNameTaken } from './names.ts';

export type ValidationCode =
  | 'name_required'
  | 'name_taken'
  | 'email_invalid'
  | 'invalid_limit'
  | 'roles_required'
  | 'invalid_quantity'
  | 'type_without_crew'
  | 'size_without_crew'
  | 'end_before_start'
  | 'notes_too_long';

export interface Validation<T> {
  ok: boolean;
  errors: ValidationCode[];
  value: T;
}

export const DEFAULT_WEEKLY_LIMIT = 44;
export const WEEKLY_LIMIT_MIN = 1;
export const WEEKLY_LIMIT_MAX = 80;
export const CREW_QUANTITY_MIN = 1;
export const CREW_QUANTITY_MAX = 30;
export const NOTES_MAX = 2000;
/** Ausência acima disso pede confirmação (US-006 EC-4). */
export const ABSENCE_CONFIRM_DAYS = 60;

function result<T>(errors: ValidationCode[], value: T): Validation<T> {
  return { ok: errors.length === 0, errors, value };
}

const EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL.test(email.trim());
}

export interface PersonInput {
  name: string;
  email: string;
  weeklyLimitHours?: number | string | null;
  roleIds: string[];
}

export interface PersonValue {
  name: string;
  email: string;
  weeklyLimitHours: number;
  roleIds: string[];
}

/** Nome, e-mail, limite semanal (1 a 80, vazio vira 44) e ao menos uma função. */
export function validatePerson(input: PersonInput): Validation<PersonValue> {
  const errors: ValidationCode[] = [];
  const name = input.name.trim().replace(/\s+/g, ' ');
  const email = input.email.trim().toLowerCase();
  if (!name) errors.push('name_required');
  if (!isValidEmail(email)) errors.push('email_invalid');
  const rawLimit = input.weeklyLimitHours;
  const limit =
    rawLimit === null || rawLimit === undefined || String(rawLimit).trim() === ''
      ? DEFAULT_WEEKLY_LIMIT
      : Number(String(rawLimit).replace(',', '.'));
  if (!Number.isFinite(limit) || limit < WEEKLY_LIMIT_MIN || limit > WEEKLY_LIMIT_MAX) errors.push('invalid_limit');
  if (input.roleIds.length === 0) errors.push('roles_required');
  return result(errors, { name, email, weeklyLimitHours: limit, roleIds: [...new Set(input.roleIds)] });
}

/** Nome de função, setor ou tipo: obrigatório e único sem diferenciar maiúsculas e acentos. */
export function validateName(name: string, existing: string[] = []): Validation<string> {
  const value = name.trim().replace(/\s+/g, ' ');
  const errors: ValidationCode[] = [];
  if (!value) errors.push('name_required');
  else if (isNameTaken(value, existing)) errors.push('name_taken');
  return result(errors, value);
}

export interface ServiceTypeInput {
  name: string;
  keywords?: string[];
  /** Porte de cada item (1 Simples, 2 Médio, 3 Grande) quando o tipo tem porte. */
  crew: { jobRoleId: string; quantity: number; size?: number }[];
  noTeam: boolean;
  /** Tipo com porte: uma equipe típica para cada um dos três. */
  sized?: boolean;
}

/**
 * Tipo de serviço: nome único, quantidade de 1 a 30 por função e equipe ou "não exige equipe"; com porte, os três
 * portes com alguém.
 */
export function validateServiceType(input: ServiceTypeInput, existingNames: string[] = []): Validation<ServiceTypeInput> {
  const errors: ValidationCode[] = [...validateName(input.name, existingNames).errors];
  if (input.crew.some((c) => !Number.isInteger(c.quantity) || c.quantity < CREW_QUANTITY_MIN || c.quantity > CREW_QUANTITY_MAX)) {
    errors.push('invalid_quantity');
  }
  if (input.crew.length === 0 && !input.noTeam) errors.push('type_without_crew');
  else if (input.sized && !input.noTeam && [1, 2, 3].some((s) => !input.crew.some((c) => c.size === s))) errors.push('size_without_crew');
  const keywords = [...new Set((input.keywords ?? []).map((k) => k.trim()).filter(Boolean))];
  return result(errors, { ...input, name: input.name.trim(), keywords });
}

export interface AbsenceInput {
  startsAt: Date;
  endsAt: Date;
  note?: string | null;
}

/** Ausência: fim depois do início; mais de 60 dias pede confirmação; observação até 2.000. */
export function validateAbsence(input: AbsenceInput): Validation<AbsenceInput> & { needsConfirmation: boolean } {
  const errors: ValidationCode[] = [];
  if (input.endsAt.getTime() <= input.startsAt.getTime()) errors.push('end_before_start');
  errors.push(...validateNotes(input.note ?? '').errors);
  const days = (input.endsAt.getTime() - input.startsAt.getTime()) / 86_400_000;
  return { ...result(errors, input), needsConfirmation: days > ABSENCE_CONFIRM_DAYS };
}

/** Observação de evento ou ausência: até 2.000 caracteres. */
export function validateNotes(notes: string): Validation<string> {
  return result([...notes].length > NOTES_MAX ? ['notes_too_long'] : [], notes);
}
