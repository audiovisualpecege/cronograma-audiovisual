/// <reference lib="webworker" />
// Service worker do app instalável (vite-plugin-pwa, injectManifest): guarda o shell (HTML, JS, CSS, fontes
// e ícones do produto) para abrir sem internet, guarda os SVG do CDN de ícones por segurança e mostra as
// notificações do Web Push, abrindo o link do aviso ao tocar (US-021, US-023, US-025). Os dados não passam
// por aqui: vêm da cópia local do app (ADR-009). O cache leva a versão no nome; a versão nova espera o app
// ser fechado e assume ao reabrir (US-027 AC-3).
import { clientsClaim, setCacheNameDetails } from 'workbox-core';
import { ExpirationPlugin } from 'workbox-expiration';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: (string | { url: string; revision: string | null })[] };

const VERSION = `v${__APP_VERSION__}`;
const PREFIX = 'cronograma';

setCacheNameDetails({ prefix: PREFIX, suffix: VERSION, precache: 'shell', runtime: 'dados' });

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
// Primeira instalação: assume a página já aberta, para o próximo recarregamento sem internet funcionar.
clientsClaim();

// Rotas por hash: toda navegação dentro do app abre o mesmo index.html guardado.
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));

// Ícones do design system que ainda venham do CDN (o app usa o pacote Solar; isto é só por segurança).
registerRoute(
  ({ url }) => url.hostname === 'cdn.jsdelivr.net' && url.pathname.endsWith('.svg'),
  new CacheFirst({ cacheName: `${PREFIX}-icones-${VERSION}`, plugins: [new ExpirationPlugin({ maxEntries: 300 })] }),
);

// Caches de versões anteriores saem quando esta assume.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => Promise.all(names.filter((n) => n.startsWith(`${PREFIX}-`) && !n.endsWith(VERSION)).map((n) => caches.delete(n)))),
  );
});

interface PushPayload {
  title?: string;
  body?: string;
  link?: string;
  tag?: string;
  id?: string;
}

function readPayload(event: PushEvent): PushPayload {
  try {
    return (event.data?.json() as PushPayload | undefined) ?? {};
  } catch {
    return { body: event.data?.text() };
  }
}

/** Endereço completo do link do aviso (`#/minha-semana/...`) dentro do escopo do app. */
function linkUrl(link: string | undefined, scope: string): string {
  const hash = link && link.includes('#') ? link.slice(link.indexOf('#')) : '#/avisos';
  return new URL(hash, scope).href;
}

self.addEventListener('push', (event) => {
  const data = readPayload(event);
  const scope = self.registration.scope;
  event.waitUntil(
    self.registration.showNotification(data.title || 'Cronograma Audiovisual', {
      body: data.body ?? '',
      // A mesma tag troca a notificação em vez de empilhar (uma por publicação, US-023 EC-4).
      tag: data.tag,
      icon: new URL('icon-192.png', scope).href,
      badge: new URL('icon-192.png', scope).href,
      lang: 'pt-BR',
      data: { link: data.link ?? '#/avisos', id: data.id },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = linkUrl((event.notification.data as { link?: string } | null)?.link, self.registration.scope);
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = windows.find((w) => w.url.startsWith(self.registration.scope));
      if (open) {
        await open.focus();
        await open.navigate(url).catch(() => undefined);
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});
