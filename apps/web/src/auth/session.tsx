// Sessão do app: a do Supabase Auth fica no localStorage e vale até a pessoa sair ou expirar (US-001 AC-4).
// Sem internet, o app usa a sessão e o perfil guardados e não tenta renovar (ADR-009).
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { navigate, parseHash } from '../router';
import type { Me, Remote, SignInResult } from '../supabase';
import { isOnline } from '../sync/useOnline';

export type SignedOutNotice = 'expired' | 'disabled' | 'password_created';

export type SessionState =
  | { status: 'loading' }
  | { status: 'signed_out'; notice?: SignedOutNotice }
  | { status: 'signed_in'; me: Me };

export interface SessionApi {
  state: SessionState;
  remote: Remote;
  /** Erro do link do e-mail (link expirado ou já usado), para a tela de criar senha. */
  linkError: string | null;
  signIn(email: string, password: string): Promise<SignInResult>;
  signOut(notice?: SignedOutNotice): Promise<void>;
}

const ME_KEY = 'cronograma-me';

function readCachedMe(): Me | null {
  try {
    const raw = localStorage.getItem(ME_KEY);
    return raw ? (JSON.parse(raw) as Me) : null;
  } catch {
    return null;
  }
}

function cacheMe(me: Me | null): void {
  if (me) localStorage.setItem(ME_KEY, JSON.stringify(me));
  else localStorage.removeItem(ME_KEY);
}

const SessionContext = createContext<SessionApi | null>(null);

export function SessionProvider({ remote, children }: { remote: Remote; children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: 'loading' });
  const [linkError, setLinkError] = useState<string | null>(null);
  const leaving = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const set = (s: SessionState) => {
      if (!cancelled) setState(s);
    };

    async function boot() {
      // Link do convite ou da redefinição: `#/criar-senha#access_token=...&type=recovery`.
      const { path, authParams } = parseHash(window.location.hash);
      if (authParams) {
        const target = path === '/' ? '/criar-senha' : path;
        if (authParams.get('access_token')) {
          const adopted = await remote.adoptSessionFromUrl(authParams);
          if (!adopted.ok && !cancelled) setLinkError('O link expirou ou já foi usado. Peça um novo em "Esqueci a senha".');
        } else if (!cancelled) {
          setLinkError('O link expirou ou já foi usado. Peça um novo em "Esqueci a senha".');
        }
        navigate(target, { replace: true });
      }

      if (!remote.hasStoredSession()) return set({ status: 'signed_out' });
      const cached = readCachedMe();
      if (!isOnline()) return set(cached ? { status: 'signed_in', me: cached } : { status: 'signed_out' });

      const result = await remote.loadMe();
      if (result.status === 'ok') {
        cacheMe(result.me);
        return set({ status: 'signed_in', me: result.me });
      }
      if (result.status === 'offline') return set(cached ? { status: 'signed_in', me: cached } : { status: 'signed_out' });
      cacheMe(null);
      if (result.status === 'disabled') {
        await remote.signOut();
        return set({ status: 'signed_out', notice: 'disabled' });
      }
      return set({ status: 'signed_out', notice: cached ? 'expired' : undefined });
    }

    void boot();
    const off = remote.onSignedOut(() => {
      if (leaving.current) return;
      cacheMe(null);
      set({ status: 'signed_out', notice: 'expired' });
    });
    return () => {
      cancelled = true;
      off();
    };
  }, [remote]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const result = await remote.signIn(email, password);
      if (result.ok) {
        cacheMe(result.me);
        setLinkError(null);
        setState({ status: 'signed_in', me: result.me });
      }
      return result;
    },
    [remote],
  );

  const signOut = useCallback(
    async (notice?: SignedOutNotice) => {
      leaving.current = true;
      try {
        await remote.signOut();
      } finally {
        leaving.current = false;
      }
      cacheMe(null);
      setState({ status: 'signed_out', notice });
    },
    [remote],
  );

  const api = useMemo(() => ({ state, remote, linkError, signIn, signOut }), [state, remote, linkError, signIn, signOut]);
  return <SessionContext.Provider value={api}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionApi {
  const api = useContext(SessionContext);
  if (!api) throw new Error('useSession fora do SessionProvider');
  return api;
}
