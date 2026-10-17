import { describe, expect, it } from 'vitest';
import type { IcalFeed } from '../store.ts';
import { FakeStore } from '../test/fakeStore.ts';
import { fakeClock } from '../test/mocks.ts';
import { IcalPublisher, buildIcal } from './publisher.ts';

const feed = (over: Partial<IcalFeed['person']> = {}): IcalFeed => ({
  person: { id: 'p5', name: 'Pessoa Exemplo 05', active: true, ical_token: 'tok-p5', ...over },
  items: [
    {
      event_id: 'e1', job_role_id: 'r1', role_name: 'Câmera', title: 'Gravação aula Matemática', location: 'Estúdio 1',
      starts_at: '2026-10-22T17:00:00+00:00', ends_at: '2026-10-22T20:00:00+00:00', all_day: false,
      period_start: null, period_end: null, notes: 'Levar o teleprompter', colleagues: ['Pessoa Exemplo 06 (Técnico de aula)'],
    },
    {
      event_id: 'e9', job_role_id: 'r1', role_name: 'Câmera', title: 'Feira, praça; centro', location: null,
      starts_at: '2026-10-24T03:00:00+00:00', ends_at: '2026-10-25T03:00:00+00:00', all_day: true,
      period_start: null, period_end: null, notes: null, colleagues: [],
    },
  ],
});

const unfold = (ics: string) => ics.replace(/\r\n /g, '');

describe('IcalPublisher', () => {
  it('UT-143 buildIcal(P5) traz só as atividades publicadas de P5, com função, local e fuso', () => {
    const ics = unfold(buildIcal(feed(), new Date('2026-10-21T15:00:00Z')));
    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics).toContain('SUMMARY:Gravação aula Matemática (Câmera)');
    expect(ics).toContain('LOCATION:Estúdio 1');
    expect(ics).toContain('DTSTART;TZID=America/Sao_Paulo:20261022T140000');
    expect(ics).toContain('DTEND;TZID=America/Sao_Paulo:20261022T170000');
    expect(ics).toContain('TZID:America/Sao_Paulo');
    expect(ics).toContain('DESCRIPTION:Função: Câmera\\nEquipe: Pessoa Exemplo 06 (Técnico de aula)\\nObservações: Levar o teleprompter');
    expect(ics).toContain('SUMMARY:Feira\\, praça\\; centro (Câmera)');
    expect(ics).toContain('DTSTART;VALUE=DATE:20261024');
    expect(ics).toContain('UID:e1-r1@cronograma-audiovisual');
    // Nenhum dado de outra pessoa além dos colegas na descrição.
    expect(ics.match(/Pessoa Exemplo/g)).toEqual(['Pessoa Exemplo', 'Pessoa Exemplo']);
    for (const line of buildIcal(feed(), new Date()).split('\r\n')) expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
  });

  it('publica no Storage com o token da pessoa', async () => {
    const store = new FakeStore();
    store.feeds.set('p5', feed());
    const res = await new IcalPublisher(store, fakeClock()).publish('p5');
    expect(res).toEqual({ published: true, events: 2 });
    expect(store.uploads.get('tok-p5')).toContain('BEGIN:VCALENDAR');
  });

  it('UT-144 revogar apaga o arquivo antigo; pessoa desativada tem o arquivo apagado e o token nulo', async () => {
    const store = new FakeStore();
    store.feeds.set('p5', feed({ ical_token: 'tok-novo' }));
    store.uploads.set('tok-velho', 'x');
    const pub = new IcalPublisher(store, fakeClock());
    await pub.revoke('p5', 'tok-velho');
    expect(store.removed).toEqual(['tok-velho']);
    expect(store.uploads.has('tok-velho')).toBe(false);

    store.feeds.set('p8', { person: { id: 'p8', name: 'Pessoa Exemplo 08', active: false, ical_token: 'tok-p8' }, items: [] });
    store.uploads.set('tok-p8', 'x');
    expect(await pub.publish('p8')).toEqual({ published: false, reason: 'pessoa inativa' });
    expect(store.uploads.has('tok-p8')).toBe(false);
    expect(store.feeds.get('p8')?.person.ical_token).toBeNull();
  });
});
