// Rotas por hash (#/semana/2026-10-19): funcionam no GitHub Pages e no protocolo do Electron sem servidor
// (ADR-008). Cada rota diz quem pode abrir: público, qualquer pessoa ativa ou só administrador.
import { useSyncExternalStore, type ComponentType } from 'react';
import type { Profile } from './supabase';

export type Access = 'public' | 'any' | 'admin';

export interface RouteProps {
  params: Record<string, string>;
}

export interface RouteDef {
  path: string;
  access: Access;
  title: string;
  component: ComponentType<RouteProps>;
}

export interface ParsedHash {
  path: string;
  query: URLSearchParams;
  /** Parâmetros do link do e-mail (access_token, type, error_description), quando houver. */
  authParams: URLSearchParams | null;
}

const AUTH_KEYS = /(^|&)(access_token|error|error_description)=/;

/** Lê `#/rota?x=1`, `#/criar-senha#access_token=...` e `#access_token=...`. */
export function parseHash(hash: string): ParsedHash {
  let raw = hash.startsWith('#') ? hash.slice(1) : hash;
  let auth: string | null = null;
  const second = raw.indexOf('#');
  if (second >= 0) {
    auth = raw.slice(second + 1);
    raw = raw.slice(0, second);
  }
  if (AUTH_KEYS.test(raw)) {
    auth = raw;
    raw = '';
  }
  const q = raw.indexOf('?');
  const path = (q >= 0 ? raw.slice(0, q) : raw) || '/';
  const query = new URLSearchParams(q >= 0 ? raw.slice(q + 1) : '');
  return { path: path.startsWith('/') ? path : `/${path}`, query, authParams: auth && AUTH_KEYS.test(auth) ? new URLSearchParams(auth) : null };
}

function subscribe(cb: () => void): () => void {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
}

const currentHash = () => window.location.hash;

export function useHash(): ParsedHash & { hash: string } {
  const hash = useSyncExternalStore(subscribe, currentHash, () => '');
  return { hash, ...parseHash(hash) };
}

/** Vai para outra rota; `replace` troca a entrada do histórico (redirecionamentos). */
export function navigate(to: string, options: { replace?: boolean } = {}): void {
  const target = `#${to.startsWith('/') ? to : `/${to}`}`;
  if (window.location.hash === target) return;
  if (options.replace) {
    window.history.replaceState(window.history.state, '', target);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    window.location.hash = target;
  }
}

export function homeFor(profile: Profile): string {
  return profile === 'admin' ? '/painel' : '/minha-semana';
}

/** Login com volta à rota pedida (US-001 EC-5 e EC-8). */
export function loginPath(back?: string): string {
  return back && back !== '/' && back !== '/entrar' ? `/entrar?volta=${encodeURIComponent(back)}` : '/entrar';
}

export function matchRoute(routes: readonly RouteDef[], path: string): { route: RouteDef; params: Record<string, string> } | null {
  const parts = path.split('/').filter(Boolean);
  for (const route of routes) {
    const pattern = route.path.split('/').filter(Boolean);
    if (pattern.length !== parts.length) continue;
    const params: Record<string, string> = {};
    const ok = pattern.every((seg, i) => {
      const part = parts[i] as string;
      if (seg.startsWith(':')) {
        params[seg.slice(1)] = decodeURIComponent(part);
        return true;
      }
      return seg === part;
    });
    if (ok) return { route, params };
  }
  return null;
}

/** Telas de administrador, mesmo as que ainda não existem (`#/admin/...`). */
export function isAdminPath(path: string): boolean {
  return path === '/admin' || path.startsWith('/admin/');
}
