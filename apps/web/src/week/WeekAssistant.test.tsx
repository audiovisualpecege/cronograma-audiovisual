import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithSync } from '../../test/helpers';
import { eventRow, NOW, peopleRows, slotWith, TYPE_ROWS, WEEK_B, weekRemote } from '../../test/weekFixtures';
import type { EventRow, ServiceTypeRow } from '../data/catalog';
import { activityKind, dayValidation, shortTitle, timeOffAbsences } from './assistant';
import { WeekPage } from './WeekPage';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

const AULA = eventRow('ea', { title: 'Gravação aula Biologia\nProfessora: Ana' });
const FERIAS = eventRow('ef', { title: 'Férias Carla', service_type_id: 't4', all_day: true, starts_at: '2026-10-26T00:00:00-03:00', ends_at: '2026-10-31T00:00:00-03:00' });

describe('Assistente da semana', () => {
  it('abre nas folgas, passa ao dia com as atividades por cor e valida o dia confirmando as pessoas', async () => {
    const user = userEvent.setup();
    const open = slotWith('ea', 'r1');
    const proposed = slotWith('ea', 'r5', 'p17', 'proposed');
    // Só a Carla (p3) faria a vaga de Câmera sem as férias: com elas confirmadas, ela não pode ser sugerida.
    const remote = weekRemote({ events: [AULA, FERIAS], slots: [open, proposed], people: peopleRows(20, { p3: { name: 'Carla Mendes' } }) });
    const view = renderWithSync(<WeekPage params={{ date: WEEK_B }} />, { remote });
    await waitFor(() => expect(view.engine.getState().lastSyncAt).not.toBeNull());

    await user.click(await screen.findByRole('button', { name: /Assistente/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Assistente' });
    expect(within(dialog).getByRole('heading', { name: 'Folga e férias' })).toBeInTheDocument();
    const off = within(dialog).getByRole('list', { name: 'Folga e férias' });
    expect(off).toHaveTextContent('Carla Mendes');
    expect(off).toHaveTextContent('Férias, 26/10 a 30/10');

    await user.click(await within(dialog).findByRole('button', { name: 'Confirmar e seguir', hidden: false }));
    expect(within(dialog).getByRole('heading', { name: 'segunda, 26/10' })).toBeInTheDocument();
    const card = within(dialog).getByRole('listitem', { name: 'Gravação aula Biologia' });
    // Só a primeira linha do título, e a cor da família (aula).
    expect(card).toHaveClass('wiz-kind--aula');
    expect(within(dialog).getByText('Sem equipe')).toBeInTheDocument();
    // A vaga aberta ganhou uma sugestão (tracejada), e não a pessoa de férias.
    const chips = within(card).getAllByRole('button').filter((b) => b.className.includes('wiz-slot-main'));
    expect(chips).toHaveLength(2);
    expect(chips[0]).not.toHaveAccessibleName(/Carla/);

    await user.click(within(dialog).getByRole('button', { name: 'Validar e concluir' }));
    await waitFor(() => {
      const kinds = remote.applyCalls.flat().map((o) => o.kind);
      expect(kinds).toContain('assignment.set');
      expect(kinds).toContain('assignment.accept');
    });
    expect(await within(dialog).findByRole('heading', { name: 'Semana revisada' })).toBeInTheDocument();
  });
});

describe('regras do Assistente', () => {
  const types = TYPE_ROWS as unknown as ServiceTypeRow[];

  it('separa as famílias pela cor: aula, produção, reunião e sem equipe', () => {
    const t = (name: string, extra: Partial<ServiceTypeRow> = {}) => ({ id: name, code: name, name, keywords: [], no_team: false, archived_at: null, ...extra }) as unknown as ServiceTypeRow;
    const all = [t('AULA MBA'), t('GRAVACAO'), t('REUNIAO EDICAO'), t('FOLGA', { no_team: true }), t('DISPONIBILIZAR')];
    const e = (typeId: string) => ({ id: typeId, title: 'x', status: 'active', service_type_id: typeId }) as EventRow;
    expect(['AULA MBA', 'GRAVACAO', 'REUNIAO EDICAO', 'FOLGA', 'DISPONIBILIZAR'].map((id) => activityKind(e(id), all))).toEqual(['aula', 'producao', 'reuniao', 'marcacao', 'aula']);
    expect(types.length).toBeGreaterThan(0);
  });

  it('folga da agenda confirmada vale como ausência dos dias inteiros; a desmarcada não', () => {
    const items = [
      { key: 'e:1', personId: 'p3', name: 'P3', kind: 'ferias' as const, from: '2026-10-26', to: '2026-10-30', agendaTitle: 'Férias P3' },
      { key: 'e:2', personId: 'p4', name: 'P4', kind: 'folga' as const, from: '2026-10-27', to: '2026-10-27', agendaTitle: 'Folga P4' },
      { key: 'a:3', personId: 'p5', name: 'P5', kind: 'folga' as const, from: '2026-10-27', to: '2026-10-27', agendaTitle: null },
    ];
    const out = timeOffAbsences(items, new Set(['e:1', 'a:3']));
    expect(out).toEqual([{ personId: 'p3', startsAt: new Date('2026-10-26T03:00:00Z'), endsAt: new Date('2026-10-31T03:00:00Z') }]);
  });

  it('validar o dia: sugestões e propostas viram confirmadas; o resto fica aberto', () => {
    const slots = new Map([['e1', [{ id: 's1' }, { id: 's2' }, { id: 's3' }, { id: 's4' }]]]) as never;
    const a = (id: string, person: string | null, status: string | null) => ({ id: `a-${id}`, slot_id: id, event_id: 'e1', person_id: person, status });
    const bySlot = new Map([['s1', a('s1', null, null)], ['s2', a('s2', 'p1', 'proposed')], ['s3', a('s3', 'p2', 'confirmed')], ['s4', a('s4', null, null)]]) as never;
    const drafts = new Map([['s1', { personId: 'p9', reason: '' }]]);
    const plan = dayValidation([{ id: 'e1' } as EventRow], slots, bySlot, drafts);
    expect(plan.drafts.map((d) => d.personId)).toEqual(['p9']);
    expect(plan.proposals.map((p) => p.slot_id)).toEqual(['s2']);
    expect([plan.confirmed, plan.open]).toEqual([1, 1]);
    expect(shortTitle('Curso X\nDisciplina: Y')).toBe('Curso X');
  });
});
