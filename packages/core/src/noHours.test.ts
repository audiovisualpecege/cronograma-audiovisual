import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { assign, event, person, slot, weekContext } from './cases/builders.ts';
import { SEED } from './cases/seed.ts';
import { classifyTitle, startsWithMarker } from './classify.ts';
import { checkEligibility, personLoad } from './scheduling.ts';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(SEED.now));
});
afterEach(() => {
  vi.useRealTimers();
});

describe('função que não ocupa horário (Disponibilizador)', () => {
  const aula = event('aula', '2026-10-21', '09:00', '12:00');
  const disp = event('disp', '2026-10-21', '10:00', '11:00');
  const sAula = slot('s-aula', 'V1', 'aula');
  const sDisp = slot('s-disp', 'V2', 'disp', 'r9', { noHours: true });
  const p = person('p5', { roleIds: ['r1', 'r9'], weeklyLimitHours: 3 });

  it('não soma horas na carga, mas conta a atividade', () => {
    const ctx = weekContext({ people: [p], events: [aula, disp], slots: [sAula, sDisp], assignments: [assign(sAula, 'p5'), assign(sDisp, 'p5')] });
    expect(personLoad('p5', ctx)).toEqual({ hours: 3, count: 2 });
  });

  it('não bate horário nem passa do limite, nos dois sentidos', () => {
    const comAula = weekContext({ people: [p], events: [aula, disp], slots: [sAula, sDisp], assignments: [assign(sAula, 'p5')] });
    expect(checkEligibility('p5', 's-disp', comAula)).toMatchObject({ ok: true, warnings: [] });
    const comDisp = weekContext({ people: [p], events: [aula, disp], slots: [sAula, sDisp], assignments: [assign(sDisp, 'p5')] });
    expect(checkEligibility('p5', 's-aula', comDisp)).toMatchObject({ ok: true, warnings: [] });
  });

  it('ausência continua valendo', () => {
    const ctx = weekContext({
      people: [p],
      events: [disp],
      slots: [sDisp],
      absences: [{ personId: 'p5', startsAt: new Date('2026-10-21T00:00:00-03:00'), endsAt: new Date('2026-10-22T00:00:00-03:00') }],
    });
    expect(checkEligibility('p5', 's-disp', ctx).warnings).toEqual(['absent']);
  });
});

describe('"*DISPONIBILIZAR" no começo do título', () => {
  const types = [
    { id: 'disp', code: 'T1', keywords: ['*disponibilizar', 'disponibilizar'] },
    { id: 'mba', code: 'T2', keywords: ['mba', 'aula mba'] },
  ];

  it('define o tipo mesmo quando o título tem palavra-chave de outro tipo', () => {
    expect(classifyTitle('*DISPONIBILIZAR: Aula MBA Gestão de Projetos', types, [])).toMatchObject({ typeId: 'disp', certainty: 'alta', source: 'keyword' });
    expect(classifyTitle('  *Disponibilizar aula 3', types, [])).toMatchObject({ typeId: 'disp' });
  });

  it('só vale no começo e com o asterisco', () => {
    expect(startsWithMarker('Aula MBA *DISPONIBILIZAR', '*disponibilizar')).toBe(false);
    expect(startsWithMarker('DISPONIBILIZAR aula', '*disponibilizar')).toBe(false);
    expect(startsWithMarker('*DISPONIBILIZAR aula', 'disponibilizar')).toBe(false);
    expect(startsWithMarker('*REDISPONIBILIZAR aula', '*disponibilizar')).toBe(false);
  });
});
