// Cliente da Google Calendar API por conta de serviço (ADR-007). Escopo calendar.readonly e só GET na API:
// a plataforma nunca escreve na agenda (ADR-003). O único POST é a troca do JWT por token no OAuth.
import { createSign } from 'node:crypto';
import type { RemoteEvent } from '@cronograma/core';
import type { Clock } from '../clock.ts';

export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';
export const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';
const TOKEN_URI = 'https://oauth2.googleapis.com/token';

export interface ServiceAccount {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

/** Falha do Google; status 0 é rede. */
export class GoogleError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'GoogleError';
  }

  /** 401, 403 e 404: autorização perdida ou agenda não compartilhada; a origem fica em erro. */
  get isAuth(): boolean {
    return this.status === 401 || this.status === 403 || this.status === 404;
  }
}

export interface CalendarWindow {
  timeMin: Date;
  timeMax: Date;
}

export interface CalendarApi {
  getCalendar(calendarId: string): Promise<{ id: string; summary?: string }>;
  listEvents(calendarId: string, window: CalendarWindow): Promise<RemoteEvent[]>;
  /** Evento pelo id; nulo em 404 ou 410 (apagado). */
  getEvent(calendarId: string, eventId: string): Promise<RemoteEvent | null>;
}

const b64url = (s: string | Buffer) => Buffer.from(s).toString('base64url');

export class GoogleCalendar implements CalendarApi {
  private token: { value: string; expiresAt: number } | null = null;

  constructor(
    private account: ServiceAccount,
    private clock: Pick<Clock, 'now'>,
  ) {}

  private async accessToken(): Promise<string> {
    const now = this.clock.now().getTime();
    if (this.token && this.token.expiresAt - 60_000 > now) return this.token.value;
    const tokenUri = this.account.token_uri || TOKEN_URI;
    const iat = Math.floor(now / 1000);
    const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claims = b64url(
      JSON.stringify({ iss: this.account.client_email, scope: CALENDAR_SCOPE, aud: tokenUri, iat, exp: iat + 3600 }),
    );
    const signature = createSign('RSA-SHA256').update(`${header}.${claims}`).sign(this.account.private_key, 'base64url');
    const res = await this.fetch(tokenUri, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: `${header}.${claims}.${signature}`,
      }),
    });
    const body = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error_description?: string };
    if (!res.ok || !body.access_token) {
      // Conta de serviço recusada conta como autorização perdida.
      throw new GoogleError(401, `Conta de serviço recusada pelo Google: ${body.error_description ?? res.status}`);
    }
    this.token = { value: body.access_token, expiresAt: now + (body.expires_in ?? 3600) * 1000 };
    return this.token.value;
  }

  private async fetch(url: string, init: RequestInit): Promise<Response> {
    try {
      return await fetch(url, init);
    } catch (e) {
      throw new GoogleError(0, `Sem conexão com o Google: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  private async get<T>(path: string, params: Record<string, string> = {}): Promise<T> {
    const url = new URL(`${CALENDAR_API}${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const res = await this.fetch(url.toString(), {
      method: 'GET',
      headers: { authorization: `Bearer ${await this.accessToken()}` },
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      throw new GoogleError(res.status, body.error?.message ?? `Google respondeu ${res.status}`);
    }
    return (await res.json()) as T;
  }

  getCalendar(calendarId: string) {
    return this.get<{ id: string; summary?: string }>(`/calendars/${encodeURIComponent(calendarId)}`);
  }

  async listEvents(calendarId: string, window: CalendarWindow): Promise<RemoteEvent[]> {
    const items: RemoteEvent[] = [];
    let pageToken: string | undefined;
    do {
      const page = await this.get<{ items?: RemoteEvent[]; nextPageToken?: string }>(
        `/calendars/${encodeURIComponent(calendarId)}/events`,
        {
          singleEvents: 'true',
          showDeleted: 'true',
          timeMin: window.timeMin.toISOString(),
          timeMax: window.timeMax.toISOString(),
          timeZone: 'America/Sao_Paulo',
          maxResults: '2500',
          ...(pageToken ? { pageToken } : {}),
        },
      );
      items.push(...(page.items ?? []));
      pageToken = page.nextPageToken;
    } while (pageToken);
    return items;
  }

  async getEvent(calendarId: string, eventId: string): Promise<RemoteEvent | null> {
    try {
      return await this.get<RemoteEvent>(
        `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
        { timeZone: 'America/Sao_Paulo' },
      );
    } catch (e) {
      if (e instanceof GoogleError && (e.status === 404 || e.status === 410)) return null;
      throw e;
    }
  }
}
