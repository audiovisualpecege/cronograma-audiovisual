import { useEffect, useState } from 'react';
import { Toast } from '../ui/Toast';

/** Última versão aberta neste aparelho. */
export const LAST_VERSION_KEY = 'cronograma-last-version';

/** Versão nova desde a última abertura neste aparelho; nula na primeira abertura ou na mesma versão. */
export function updatedVersion(current: string): string | null {
  try {
    const last = localStorage.getItem(LAST_VERSION_KEY);
    return last && last !== current ? current : null;
  } catch {
    return null;
  }
}

/** "Atualizado para vX.Y.Z" uma vez, depois que o service worker novo assume ao reabrir o app (US-027 AC-3). */
export function UpdateNotice({ version = __APP_VERSION__ }: { version?: string }) {
  const [updated, setUpdated] = useState(() => updatedVersion(version));
  useEffect(() => {
    // Gravada logo: a próxima abertura já não mostra o aviso.
    try {
      localStorage.setItem(LAST_VERSION_KEY, version);
    } catch {
      // Sem armazenamento local, não há aviso a lembrar.
    }
  }, [version]);
  useEffect(() => {
    if (!updated) return;
    const timer = window.setTimeout(() => setUpdated(null), 8000);
    return () => window.clearTimeout(timer);
  }, [updated]);
  if (!updated) return null;
  return (
    <div className="toast-stack">
      <Toast tone="success" title={`Atualizado para v${updated}`} message="O app foi atualizado para a versão nova." onClose={() => setUpdated(null)} />
    </div>
  );
}
