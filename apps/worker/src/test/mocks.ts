// Simuladores msw dos serviços externos do worker: Google Calendar (com o OAuth da conta de serviço), Gemini e
// serviços de Web Push. Usados nos testes de unidade e nos de integração contra o Supabase local.
import { createECDH, generateKeyPairSync, randomBytes, type ECDH } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { http, HttpResponse, type HttpHandler } from 'msw';
import type { ServiceAccount } from '../calendar/google.ts';
import type { Clock } from '../clock.ts';

const FIXTURES = fileURLToPath(new URL('../../../../fixtures/', import.meta.url));

/** Gravação de resposta em fixtures/ (google/*.json, gemini/*.json). */
export function fixture<T = unknown>(path: string): T {
  return JSON.parse(readFileSync(`${FIXTURES}${path}`, 'utf8')) as T;
}

let account: ServiceAccount | null = null;
/** Conta de serviço de teste com uma chave RSA de verdade (o JWT é assinado). */
export function testServiceAccount(): ServiceAccount {
  if (!account) {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    account = {
      client_email: 'cronograma@projeto-teste.iam.gserviceaccount.com',
      private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    };
  }
  return account;
}

/** Relógio falso: a hora anda só quando alguém espera, e cada espera fica registrada. */
export function fakeClock(start: string | Date = '2026-10-21T12:00:00-03:00'): Clock & { slept: number[]; advance(ms: number): void } {
  let t = new Date(start).getTime();
  const slept: number[] = [];
  return {
    slept,
    now: () => new Date(t),
    sleep: async (ms) => {
      slept.push(ms);
      t += Math.max(0, ms);
    },
    advance: (ms) => {
      t += ms;
    },
  };
}

export interface Reply {
  status?: number;
  body: unknown;
}

const reply = (r: Reply) => HttpResponse.json(r.body as never, { status: r.status ?? 200 });
const googleError = (status: number): Reply => ({ status, body: fixture(`google/error-${status}.json`) });

// ---------------------------------------------------------------------------------------------
// Google Calendar

export class GoogleFake {
  /** Todas as requisições à Calendar API, na ordem. */
  calls: { method: string; url: URL }[] = [];
  /** Respostas de events.list por agenda: uma página ou várias, ligadas por nextPageToken. */
  lists = new Map<string, Reply | Reply[]>();
  /** Respostas de events.get por `${agenda}/${evento}`; ausente = 404. */
  events = new Map<string, Reply>();
  /** Respostas de calendars.get; ausente = calendar.json. */
  calendars = new Map<string, Reply>();
  /** Cor de cada agenda na lista de agendas da conta; ausente = 404 (fora da lista). */
  colors = new Map<string, string>();
  tokenRequests = 0;

  static error = googleError;

  list(calendarId: string, ...pages: (Reply | string | number)[]) {
    const replies = pages.map((p) => (typeof p === 'number' ? googleError(p) : typeof p === 'string' ? { body: fixture(p) } : p));
    this.lists.set(calendarId, replies.length === 1 ? (replies[0] as Reply) : replies);
    return this;
  }

  get nonGet() {
    return this.calls.filter((c) => c.method !== 'GET');
  }

  handlers(): HttpHandler[] {
    return [
      http.post('https://oauth2.googleapis.com/token', () => {
        this.tokenRequests++;
        return HttpResponse.json(fixture('google/token.json') as never);
      }),
      http.all('https://www.googleapis.com/calendar/v3/*', ({ request }) => {
        const url = new URL(request.url);
        this.calls.push({ method: request.method, url });
        // A plataforma nunca escreve na agenda (ADR-003): qualquer outro método é falha do teste.
        if (request.method !== 'GET') return HttpResponse.json({ error: { message: 'só leitura' } }, { status: 405 });
        const listed = /\/users\/me\/calendarList\/(.+)$/.exec(url.pathname);
        if (listed) {
          const color = this.colors.get(decodeURIComponent(listed[1] ?? ''));
          return reply(color ? { body: { id: listed[1], backgroundColor: color } } : googleError(404));
        }
        const parts = url.pathname.replace('/calendar/v3/calendars/', '').split('/').map(decodeURIComponent);
        const [cal = '', what, eventId] = parts;
        if (what === 'events' && eventId) return reply(this.events.get(`${cal}/${eventId}`) ?? googleError(404));
        if (what === 'events') {
          const r = this.lists.get(cal) ?? { body: fixture('google/empty.json') };
          if (!Array.isArray(r)) return reply(r);
          const token = url.searchParams.get('pageToken');
          const idx = token ? r.findIndex((p, i) => i > 0 && (r[i - 1]?.body as { nextPageToken?: string }).nextPageToken === token) : 0;
          return reply(r[idx] ?? googleError(404));
        }
        return reply(this.calendars.get(cal) ?? { body: { ...fixture<object>('google/calendar.json'), id: cal } });
      }),
    ];
  }
}

// ---------------------------------------------------------------------------------------------
// Gemini

/** Corpo do generateContent com o texto dado, no formato da gravação. */
export function geminiText(text: string): unknown {
  const base = fixture<{ candidates: { content: { parts: { text: string }[] } }[] }>('gemini/propose.json');
  return { ...base, candidates: [{ ...base.candidates[0], content: { parts: [{ text }], role: 'model' } }] };
}

export interface GeminiRequest {
  model: string;
  body: { contents: { parts: { text: string }[] }[]; systemInstruction?: unknown; generationConfig?: Record<string, unknown> };
  raw: string;
  at: number;
}

/**
 * Primeiro candidato de cada vaga que não esteja noutra vaga no mesmo horário e caiba no limite de horas,
 * como faria uma IA obediente.
 */
export function chooseFirstFree(
  slots: { slot: string; start: string; end: string; hours: number; candidates: { person: string }[] }[],
  people: { person: string; loadHours: number; limitHours: number }[] = [],
): { slot: string; person: string | null; reason: string }[] {
  const busy = new Map<string, [number, number][]>();
  const load = new Map(people.map((p) => [p.person, p.loadHours]));
  const limit = new Map(people.map((p) => [p.person, p.limitHours]));
  return slots.map((s) => {
    const iv: [number, number] = [Date.parse(s.start), Date.parse(s.end)];
    const c = s.candidates.find(
      (x) =>
        !(busy.get(x.person) ?? []).some(([a, b]) => a < iv[1] && iv[0] < b) &&
        (load.get(x.person) ?? 0) + s.hours <= (limit.get(x.person) ?? Infinity),
    );
    if (c) {
      busy.set(c.person, [...(busy.get(c.person) ?? []), iv]);
      load.set(c.person, (load.get(c.person) ?? 0) + s.hours);
    }
    return { slot: s.slot, person: c?.person ?? null, reason: c ? 'primeiro apto da lista' : 'nenhum apto' };
  });
}

/** Resposta do simulador: proposta pelo primeiro apto livre; classificação deixa tudo a definir. */
export function firstCandidateAnswer(req: GeminiRequest): Reply {
  const payload = JSON.parse(req.body.contents[0]?.parts[0]?.text ?? '{}') as {
    slots?: { slot: string; start: string; end: string; hours: number; candidates: { person: string }[] }[];
    people?: { person: string; loadHours: number; limitHours: number }[];
    items?: { id: string }[];
  };
  if (payload.items) return { body: geminiText(JSON.stringify(payload.items.map((i) => ({ id: i.id, type: null, certainty: 'baixa' })))) };
  return { body: geminiText(JSON.stringify(chooseFirstFree(payload.slots ?? [], payload.people))) };
}

export class GeminiFake {
  requests: GeminiRequest[] = [];
  modelRequests: { key: string | null }[] = [];
  /** Respostas em fila para o generateContent; vazia = `fallback`. */
  queue: Reply[] = [];
  fallback: (req: GeminiRequest) => Reply = firstCandidateAnswer;
  model: Reply = { body: fixture('gemini/model.json') };

  constructor(private now: () => number = Date.now) {}

  static error(name: '429' | '400-invalid-key' | '503'): Reply {
    return { status: Number(name.slice(0, 3)), body: fixture(`gemini/error-${name}.json`) };
  }

  handlers(): HttpHandler[] {
    return [
      http.post(/^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\/[^/]+:generateContent/, async ({ request }) => {
        const raw = await request.text();
        const req: GeminiRequest = {
          model: /models\/([^:]+):/.exec(request.url)?.[1] ?? '',
          body: JSON.parse(raw) as GeminiRequest['body'],
          raw,
          at: this.now(),
        };
        this.requests.push(req);
        return reply(this.queue.shift() ?? this.fallback(req));
      }),
      http.get(/^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\/[^/:?]+/, ({ request }) => {
        this.modelRequests.push({ key: request.headers.get('x-goog-api-key') });
        return reply(this.model);
      }),
    ];
  }
}

// ---------------------------------------------------------------------------------------------
// Web Push

const ece = createRequire(import.meta.url)('http_ece') as {
  decrypt(buffer: Buffer, params: { version: string; privateKey: ECDH; authSecret: Buffer }): Buffer;
};

export interface PushDevice {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface ReceivedPush {
  endpoint: string;
  payload: { title: string; body: string; link: string; tag: string; id: string };
  headers: Record<string, string>;
}

export class PushFake {
  received: ReceivedPush[] = [];
  /** Status por endpoint (padrão 201). */
  status = new Map<string, number>();
  private keys = new Map<string, { ecdh: ECDH; auth: Buffer }>();

  /** Inscrição de um aparelho com chaves de verdade, para o conteúdo ser decifrado aqui. */
  device(name: string): PushDevice {
    const ecdh = createECDH('prime256v1');
    ecdh.generateKeys();
    const auth = randomBytes(16);
    const endpoint = `https://push.exemplo.test/send/${name}`;
    this.keys.set(endpoint, { ecdh, auth });
    return { endpoint, p256dh: ecdh.getPublicKey().toString('base64url'), auth: auth.toString('base64url') };
  }

  handlers(): HttpHandler[] {
    return [
      http.post('https://push.exemplo.test/send/:device', async ({ request }) => {
        const status = this.status.get(request.url) ?? 201;
        if (status >= 400) return new HttpResponse(null, { status });
        const key = this.keys.get(request.url);
        const body = Buffer.from(await request.arrayBuffer());
        const plain = key ? ece.decrypt(body, { version: 'aes128gcm', privateKey: key.ecdh, authSecret: key.auth }) : Buffer.from('{}');
        this.received.push({
          endpoint: request.url,
          payload: JSON.parse(plain.toString('utf8')) as ReceivedPush['payload'],
          headers: Object.fromEntries(request.headers.entries()),
        });
        return new HttpResponse(null, { status: 201 });
      }),
    ];
  }
}

export const TEST_VAPID = (() => {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  return {
    publicKey: ecdh.getPublicKey().toString('base64url'),
    privateKey: ecdh.getPrivateKey().toString('base64url'),
    subject: 'mailto:audiovisualpecege@gmail.com',
  };
})();
