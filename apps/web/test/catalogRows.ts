// Linhas de cadastro no formato do servidor para os testes das telas (setores, funções, tipos, pessoas).
import type { Row } from '../src/sync/types';

const STAMP = '2026-10-16T12:00:00.000Z';

export function row<T extends Record<string, unknown>>(id: string, fields: T): Row & T {
  return { id, version: 1, updated_at: STAMP, ...fields };
}

export const SECTORS = [
  row('s-1', { name: 'Edição', archived_at: null }),
  row('s-2', { name: 'Produção', archived_at: null }),
  row('s-3', { name: 'Técnica', archived_at: null }),
];

export const ROLES = [
  row('r-1', { code: 'R1', name: 'Câmera', sector_id: 's-2', archived_at: null }),
  row('r-2', { code: 'R2', name: 'Áudio', sector_id: 's-3', archived_at: null }),
  row('r-3', { code: 'R3', name: 'Edição', sector_id: 's-1', archived_at: null }),
];

export const TYPES = [
  row('t-1', { code: 'T1', name: 'Gravação de aula', keywords: ['aula'], no_team: false, archived_at: null }),
  row('t-2', { code: 'T2', name: 'Evento externo', keywords: [], no_team: false, archived_at: null }),
];

export function person(n: number, fields: Record<string, unknown> = {}) {
  const pad = String(n).padStart(3, '0');
  return row(`p-${pad}`, {
    code: `P${n}`,
    name: `Pessoa ${pad}`,
    email: `pessoa${pad}@exemplo.test`,
    sector_id: 's-1',
    profile: 'team',
    weekly_limit_hours: 44,
    active: true,
    invite_status: 'accepted',
    auth_user_id: null,
    ...fields,
  });
}

export function personRole(personId: string, roleId: string) {
  return row(`${personId}:${roleId}`, { person_id: personId, job_role_id: roleId, archived_at: null });
}

export const SETTINGS = row('cfg', {
  calendar_poll_enabled: true,
  calendar_poll_minutes: 15,
  ai_proposal_enabled: true,
  ai_classification_enabled: true,
  ai_provider: 'gemini',
  ai_model: 'gemini-2.5-flash',
  ai_key_hint: '...a1b2',
  push_enabled_global: true,
});
