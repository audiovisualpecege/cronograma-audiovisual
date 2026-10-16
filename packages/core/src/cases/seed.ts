// Semente padrão do _tests.md, com nomes e e-mails inventados. A mesma semente alimenta os testes
// do core e a semente SQL de teste (tarefa 3), para os dois lados darem a mesma resposta.
import type { PersonLike } from '../types.ts';

const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

// Funções de cada pessoa (P1 e P2 são administradores).
const ROLES_OF: Record<number, string[]> = {
  1: ['r6'],
  2: ['r6'],
  3: ['r1'],
  4: ['r1'],
  5: ['r1'],
  6: ['r1', 'r5'],
  7: ['r1', 'r2'],
  8: ['r1'],
  9: ['r2'],
  10: ['r2'],
  11: ['r2', 'r3'],
  12: ['r3'],
  13: ['r3'],
  14: ['r3', 'r4'],
  15: ['r4'],
  16: ['r4'],
  17: ['r5'],
  18: ['r5', 'r1'],
  19: ['r6'],
  20: ['r6', 'r2'],
};

export const SEED = {
  now: '2026-10-21T12:00:00-03:00',
  weekA: '2026-10-19',
  weekB: '2026-10-26',
  sectors: [
    { id: 's-edicao', name: 'Edição' },
    { id: 's-producao', name: 'Produção' },
    { id: 's-tecnica', name: 'Técnica' },
  ],
  jobRoles: [
    { id: 'r1', code: 'R1', name: 'Câmera', sectorId: 's-producao' },
    { id: 'r2', code: 'R2', name: 'Áudio', sectorId: 's-tecnica' },
    { id: 'r3', code: 'R3', name: 'Edição', sectorId: 's-edicao' },
    { id: 'r4', code: 'R4', name: 'Mediação', sectorId: 's-producao' },
    { id: 'r5', code: 'R5', name: 'Técnico de aula', sectorId: 's-tecnica' },
    { id: 'r6', code: 'R6', name: 'Produção', sectorId: 's-producao' },
  ],
  serviceTypes: [
    { id: 't1', code: 'T1', name: 'Gravação de aula', keywords: ['aula'], noTeam: false, crew: [{ jobRoleId: 'r1', quantity: 1 }, { jobRoleId: 'r5', quantity: 1 }] },
    {
      id: 't2',
      code: 'T2',
      name: 'Evento externo',
      keywords: [],
      noTeam: false,
      crew: [
        { jobRoleId: 'r1', quantity: 2 },
        { jobRoleId: 'r2', quantity: 1 },
        { jobRoleId: 'r6', quantity: 1 },
      ],
    },
    { id: 't3', code: 'T3', name: 'Transmissão ao vivo', keywords: [], noTeam: false, crew: [] as { jobRoleId: string; quantity: number }[] },
    { id: 't4', code: 'T4', name: 'Reunião', keywords: [], noTeam: true, crew: [] as { jobRoleId: string; quantity: number }[] },
  ],
  people: range(20).map(
    (n): PersonLike & { name: string; email: string; profile: 'admin' | 'team' } => ({
      id: `p${n}`,
      code: `P${n}`,
      name: `Pessoa Exemplo ${String(n).padStart(2, '0')}`,
      email: `pessoa${String(n).padStart(2, '0')}@exemplo.test`,
      profile: n <= 2 ? 'admin' : 'team',
      active: true,
      weeklyLimitHours: 44,
      roleIds: ROLES_OF[n] ?? [],
    }),
  ),
  calendarSources: [
    { id: 'S1', label: 'pecegeworks' },
    { id: 'S2', label: 'audiovisualpecege' },
  ],
};
