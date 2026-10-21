import type { ProposalBatch } from '@cronograma/core';
import { describe, expect, it } from 'vitest';
import type { SettingsRow } from '../store.ts';
import { providerFactory } from './factory.ts';
import { LOCAL_NO_URL, LOCAL_UNAVAILABLE, providerResolver, testAiKey } from './key.ts';
import { chatBase, extractJson, LocalProvider } from './local.ts';
import { AiError, type AiProvider } from './provider.ts';

interface Call {
  url: string;
  init: RequestInit;
}

/** fetch falso: devolve as respostas na ordem e guarda os pedidos. */
function fakeFetch(...responses: (Response | Error)[]) {
  const calls: Call[] = [];
  const fn = async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const next = responses.shift();
    if (!next) throw new Error('sem resposta preparada');
    if (next instanceof Error) throw next;
    return next;
  };
  return { fn, calls };
}

const chat = (content: string) => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });

const batch: ProposalBatch = {
  index: 0,
  slots: [
    { slot: 'V1', role: 'R1', type: 'T1', start: '2026-10-26T09:00:00-03:00', end: '2026-10-26T12:00:00-03:00', hours: 3,
      candidates: [{ person: 'P5', hist: 4, loadHours: 3, loadCount: 1, inTieGroup: true }] },
  ],
  people: [{ person: 'P5', loadHours: 3, loadCount: 1, limitHours: 44 }],
};

describe('LocalProvider (MiniCPM5 ou outro modelo na rede)', () => {
  it('chama /v1/chat/completions com o modelo, as instruções e o formato em JSON Schema', async () => {
    const f = fakeFetch(chat('{"items":[{"slot":"V1","person":"P5","reason":"costuma fazer T1"}]}'));
    const p = new LocalProvider({ url: 'http://nas:11434', model: 'minicpm5', fetch: f.fn });
    expect(await p.propose(batch)).toEqual([{ slot: 'V1', person: 'P5', reason: 'costuma fazer T1' }]);
    expect(f.calls[0]?.url).toBe('http://nas:11434/v1/chat/completions');
    const body = JSON.parse(String(f.calls[0]?.init.body));
    expect(body.model).toBe('minicpm5');
    expect(body.messages[0].content).toContain('pré-escala');
    // Só códigos vão para a IA: o lote não tem nomes.
    expect(body.messages[1].content).not.toMatch(/[A-Z][a-z]+ [A-Z][a-z]+/);
    expect(body.response_format.json_schema.schema.properties.items.type).toBe('array');
  });

  it('tira o raciocínio <think> e a cerca ```json antes de ler a resposta', async () => {
    const f = fakeFetch(chat('<think>T1 é gravação de aula...</think>\n```json\n{"items":[{"id":"E1","type":"T1","certainty":"media"}]}\n```'));
    const p = new LocalProvider({ url: 'http://nas:11434/v1/', model: 'minicpm5', fetch: f.fn });
    expect(await p.classify({ items: [{ id: 'E1', title: 'Gravação aula' }], types: [{ code: 'T1', name: 'Gravação' }] })).toEqual([
      { id: 'E1', type: 'T1', certainty: 'media' },
    ]);
    expect(f.calls[0]?.url).toBe('http://nas:11434/v1/chat/completions');
  });

  it('erros viram AiError: sem conexão e 404 são indisponível, 401 é acesso recusado, texto sem JSON é resposta inválida', async () => {
    const run = async (r: Response | Error) =>
      new LocalProvider({ url: 'http://nas:11434', model: 'minicpm5', fetch: fakeFetch(r).fn }).propose(batch).catch((e: AiError) => e.kind);
    expect(await run(new Error('ECONNREFUSED'))).toBe('unavailable');
    expect(await run(new Response('', { status: 404 }))).toBe('unavailable');
    expect(await run(new Response('', { status: 401 }))).toBe('invalid_key');
    expect(await run(chat('não sei'))).toBe('invalid_response');
    expect(await run(chat('{"items":[{"vaga":"V1"}]}'))).toBe('invalid_response');
  });

  it('item fora do formato fica de fora sem derrubar o lote; "" vira ninguém', async () => {
    const f = fakeFetch(chat('{"items":[{"slot":"V1","person":"P5","reason":"ok"},{"vaga":"V2"},{"slot":"V3","person":""}]}'));
    const p = new LocalProvider({ url: 'http://nas:11434', model: 'minicpm5', fetch: f.fn });
    expect(await p.propose(batch)).toEqual([
      { slot: 'V1', person: 'P5', reason: 'ok' },
      { slot: 'V3', person: null, reason: '' },
    ]);
  });

  it('teste de conexão confere que o servidor tem o modelo', async () => {
    const models = (ids: string[]) => new Response(JSON.stringify({ data: ids.map((id) => ({ id })) }), { status: 200 });
    const test = (r: Response | Error) => new LocalProvider({ url: 'http://nas:11434', model: 'minicpm5', fetch: fakeFetch(r).fn }).testKey();
    expect(await test(models(['minicpm5:latest', 'outro']))).toEqual({ ok: true });
    expect(await test(models(['outro']))).toEqual({ ok: false, reason: 'unavailable' });
    expect(await test(new Error('timeout'))).toEqual({ ok: false, reason: 'unavailable' });
  });

  it('chatBase e extractJson aceitam as variações comuns', () => {
    expect(chatBase('http://nas:11434')).toBe('http://nas:11434/v1');
    expect(chatBase('http://nas:11434/v1/')).toBe('http://nas:11434/v1');
    expect(extractJson('Resposta: [1, 2]')).toEqual([1, 2]);
    expect(() => extractJson('nada')).toThrow(AiError);
  });
});

describe('configuração do fornecedor local', () => {
  const base: SettingsRow = {
    calendar_poll_enabled: true,
    calendar_poll_minutes: 15,
    ai_proposal_enabled: true,
    ai_classification_enabled: true,
    ai_provider: 'local',
    ai_model: 'gemini-2.5-flash',
    ai_local_url: 'http://nas:11434',
    ai_local_model: 'minicpm5',
    push_enabled_global: true,
  };
  const store = (s: Partial<SettingsRow>) => ({
    settings: async () => ({ ...base, ...s }),
    secret: async () => null,
    promoteAiKey: async () => undefined,
    dropPendingAiKey: async () => undefined,
  });

  it('local não precisa de chave e não passa pelo espaçamento do Gemini; sem endereço fica parado', async () => {
    const wrapped: AiProvider[] = [];
    const wrap = (p: AiProvider) => (wrapped.push(p), p);
    const local = await providerResolver(store({}), providerFactory({ now: () => new Date(), sleep: async () => undefined } as never), wrap)();
    expect(local?.id).toBe('local');
    expect(wrapped).toHaveLength(0);
    expect(await providerResolver(store({ ai_local_url: null }), providerFactory({} as never), wrap)()).toBeNull();
    // Gemini sem chave aprovada continua parado.
    expect(await providerResolver(store({ ai_provider: 'gemini' }), providerFactory({} as never), wrap)()).toBeNull();
  });

  it('testar conexão do local: sem endereço pede o endereço; servidor fora do ar dá a mensagem do local', async () => {
    await expect(testAiKey(store({ ai_local_url: null }), providerFactory({} as never), {})).rejects.toThrow(LOCAL_NO_URL);
    const down = (() => ({ id: 'local', testKey: async () => ({ ok: false, reason: 'unavailable' }) })) as never;
    await expect(testAiKey(store({}), down, {})).rejects.toThrow(LOCAL_UNAVAILABLE);
    const up = (() => ({ id: 'local', testKey: async () => ({ ok: true }) })) as never;
    expect(await testAiKey(store({}), up, {})).toMatchObject({ ok: true, message: 'Conexão testada: a IA local respondeu.' });
  });
});
