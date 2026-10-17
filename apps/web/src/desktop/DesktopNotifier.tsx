import { useEffect, useRef, useState } from 'react';
import { useNotifications } from '../notifications/useNotifications';
import { navigate } from '../router';
import { desktopBridge, type DesktopBridge } from './bridge';

/**
 * No programa de Windows e Mac, cada aviso novo que chega com o app aberto vira uma notificação do sistema;
 * clicar nela traz a janela e abre a atividade. Os avisos de antes da abertura (inclusive os que chegam na primeira
 * leitura da cópia local) não viram notificação.
 */
export function DesktopNotifier({ bridge = desktopBridge() }: { bridge?: DesktopBridge }) {
  const notifications = useNotifications();
  const seen = useRef(new Set<string>());
  // Margem para a diferença de relógio entre o aparelho e o servidor.
  const [since] = useState(() => Date.now() - 60_000);

  useEffect(() => bridge?.onNavigate((path) => navigate(path)), [bridge]);

  useEffect(() => {
    if (!bridge || !notifications) return;
    for (const n of notifications) {
      if (seen.current.has(n.id)) continue;
      seen.current.add(n.id);
      if (!n.read_at && Date.parse(n.created_at) >= since) bridge.notify({ title: n.title, body: n.body, link: n.link });
    }
  }, [bridge, notifications, since]);

  return null;
}
