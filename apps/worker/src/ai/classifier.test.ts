import { describe, expect, it } from 'vitest';
import { silentLogger } from '../log.ts';
import { FakeStore } from '../test/fakeStore.ts';
import { Classifier } from './classifier.ts';
import type { AiProvider, ClassifyRequest } from './provider.ts';

function setup(aiEnabled: boolean) {
  const store = new FakeStore();
  store.settingsRow.ai_classification_enabled = aiEnabled;
  store.types = [
    { id: 't1', code: 'T1', name: 'Gravação de aula', keywords: ['aula'], no_team: false },
    { id: 't3', code: 'T3', name: 'Transmissão ao vivo', keywords: [], no_team: false },
    { id: 't4', code: 'T4', name: 'Reunião', keywords: [], no_team: true },
  ];
  store.titles = [{ title: 'Reunião de pauta semanal', serviceTypeId: 't4' }];
  const requests: ClassifyRequest[] = [];
  const provider: AiProvider = {
    id: 'gemini',
    testKey: async () => ({ ok: true }),
    propose: async () => [],
    classify: async (req) => {
      requests.push(req);
      return req.items.map((i) => ({ id: i.id, type: 'T3', certainty: 'media' as const }));
    },
  };
  return { requests, classifier: new Classifier(store, async () => provider, silentLogger()) };
}

const items = [
  { id: 'a', title: 'Gravação aula Biologia' },
  { id: 'b', title: 'Reunião de pauta semanal' },
  { id: 'c', title: 'Live de lançamento do curso' },
];

describe('Classifier', () => {
  it('UT-138 com a IA desligada classifica só por palavra-chave e histórico, sem chamar o provedor', async () => {
    const { classifier, requests } = setup(false);
    const res = await classifier.classify(items);
    expect(requests).toEqual([]);
    expect(res.aiCalls).toBe(0);
    expect(Object.fromEntries(res.types)).toEqual({
      a: { service_type_id: 't1', certainty: 'alta', source: 'keyword', no_team: false },
      b: { service_type_id: 't4', certainty: 'media', source: 'history', no_team: true },
      c: { service_type_id: null, certainty: 'baixa', source: null, no_team: false },
    });
  });

  it('com a IA ligada, só os títulos sem tipo vão para o provedor, com ids curtos', async () => {
    const { classifier, requests } = setup(true);
    const res = await classifier.classify(items);
    expect(requests).toEqual([{ items: [{ id: 'E1', title: 'Live de lançamento do curso' }], types: expect.any(Array) }]);
    expect(res.types.get('c')).toEqual({ service_type_id: 't3', certainty: 'media', source: 'ai', no_team: false });
    expect(res.aiCalls).toBe(1);
  });
});
