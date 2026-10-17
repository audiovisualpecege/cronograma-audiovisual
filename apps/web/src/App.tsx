import { useEffect, useState, type ReactNode } from 'react';
import { MeProvider } from './auth/me';
import { SessionProvider, useSession } from './auth/session';
import { UpdateNotice } from './install/UpdateNotice';
import { AppShell } from './layout/AppShell';
import { NoPermission } from './layout/NoPermission';
import { homeFor, isAdminPath, loginPath, matchRoute, navigate, useHash, type RouteDef } from './router';
import { ROUTES } from './routes';
import type { Me, Remote } from './supabase';
import { openLocalStore } from './sync/localStore';
import { SyncEngine } from './sync/syncEngine';
import { SyncProvider } from './sync/SyncProvider';
import { isOnline } from './sync/useOnline';

export function App({ remote, routes = ROUTES }: { remote: Remote; routes?: readonly RouteDef[] }) {
  return (
    <SessionProvider remote={remote}>
      <AppRoutes routes={routes} />
      <UpdateNotice />
    </SessionProvider>
  );
}

function Splash() {
  return <div className="splash" aria-busy="true" />;
}

/** Volta guardada no login: só rotas do próprio app. */
function backPath(query: URLSearchParams): string | null {
  const back = query.get('volta');
  return back && back.startsWith('/') && !back.startsWith('//') ? back : null;
}

function AppRoutes({ routes }: { routes: readonly RouteDef[] }) {
  const { state } = useSession();
  const { path, query } = useHash();
  const match = matchRoute(routes, path);

  let redirect: string | null = null;
  if (state.status === 'signed_out') {
    if (!match || match.route.access !== 'public') redirect = loginPath(path);
  } else if (state.status === 'signed_in') {
    const home = homeFor(state.me.profile);
    if (match?.route.path === '/entrar' || match?.route.path === '/esqueci-senha') redirect = backPath(query) ?? home;
    else if (!match && !isAdminPath(path)) redirect = home;
  }

  useEffect(() => {
    if (redirect) navigate(redirect, { replace: true });
  }, [redirect]);

  if (state.status === 'loading' || redirect) return <Splash />;
  if (match && match.route.access === 'public') {
    const Page = match.route.component;
    return <Page params={match.params} />;
  }
  if (state.status !== 'signed_in') return <Splash />;

  const me = state.me;
  const forbidden = me.profile !== 'admin' && (!match || match.route.access === 'admin');
  const Page = match?.route.component;
  return (
    <SignedIn key={`${me.personId}:${me.profile}`} me={me}>
      <AppShell me={me} path={path} title={forbidden ? 'Sem permissão' : (match?.route.title ?? '')}>
        {forbidden || !Page || !match ? <NoPermission /> : <Page params={match.params} />}
      </AppShell>
    </SignedIn>
  );
}

/** Cópia local e sincronização da pessoa logada; fecham ao sair. */
function SignedIn({ me, children }: { me: Me; children: ReactNode }) {
  const { remote } = useSession();
  const [engine] = useState(() => new SyncEngine({ store: openLocalStore(me.personId), remote, profile: me.profile, online: isOnline() }));
  useEffect(() => {
    // Pede ao navegador para não apagar a cópia local (ADR-009).
    void navigator.storage?.persist?.().catch(() => undefined);
    // Fecha sem impedir a reabertura: no modo estrito do React o efeito monta duas vezes.
    return () => engine.store.close({ disableAutoOpen: false });
  }, [engine]);
  return (
    <MeProvider me={me}>
      <SyncProvider engine={engine}>{children}</SyncProvider>
    </MeProvider>
  );
}
