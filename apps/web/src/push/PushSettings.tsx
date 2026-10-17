import { BellOffIcon } from '@solar-icons/react/linear';
import { useEffect, useState } from 'react';
import { useMe } from '../auth/me';
import { browserKind } from '../install/platform';
import { useLocalQuery, useSyncEngine, useSyncState } from '../sync/SyncProvider';
import { AppIcon } from '../ui/AppIcon';
import { Button, Card } from '../ui/chiaro';
import { currentSubscription, disablePush, enablePush, needsReactivation, pushStatus, type PushStatus } from './enablePush';

/** Como liberar as notificações bloqueadas, no navegador em uso (US-023 EC-1). */
export function unblockSteps(): string {
  switch (browserKind()) {
    case 'ios':
      return 'Abra os Ajustes do iPhone, toque em Notificações, escolha Cronograma Audiovisual e ligue Permitir Notificações.';
    case 'firefox-android':
      return 'No Firefox, toque no cadeado ao lado do endereço, depois em Permissões, e libere as notificações. Depois volte aqui e toque em Ativar notificações.';
    case 'android':
    case 'samsung':
      return 'Toque no cadeado ao lado do endereço, depois em Permissões e em Notificações, e escolha Permitir. Com o app instalado, use as configurações do Android: Apps, Cronograma Audiovisual, Notificações.';
    default:
      return 'Clique no cadeado ao lado do endereço, libere as notificações para este site e recarregue a página.';
  }
}

/** O próprio cadastro na cópia local (push_enabled e ical_token). */
export function useOwnPerson(): { push_enabled?: boolean; ical_token?: string | null } | null | undefined {
  const me = useMe();
  return useLocalQuery(async (store) => ((await store.mirror('people').get(me.personId)) as { push_enabled?: boolean; ical_token?: string | null } | undefined) ?? null, [me.personId]);
}

/** Preferência de notificações no celular deste aparelho. */
export function PushSettings() {
  const { remote } = useSyncEngine();
  const { online } = useSyncState();
  const [status, setStatus] = useState<PushStatus>(() => pushStatus());
  const [active, setActive] = useState<boolean | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void currentSubscription()
      .then((s) => alive && setActive(Boolean(s)))
      .catch(() => alive && setActive(false));
    return () => {
      alive = false;
    };
  }, [status]);

  async function enable() {
    setBusy(true);
    setMessage(null);
    const result = await enablePush(remote);
    setBusy(false);
    setStatus(pushStatus());
    if (result.ok) {
      setActive(true);
      setMessage('Notificações ativadas neste aparelho.');
    } else if (result.reason === 'failed') {
      setMessage('Não foi possível ativar agora. Confira a internet e tente de novo.');
    }
  }

  async function disable() {
    setBusy(true);
    await disablePush().catch(() => undefined);
    setBusy(false);
    setActive(false);
    setMessage('Notificações desligadas neste aparelho. Os avisos continuam no sino.');
  }

  let content;
  if (status === 'install_first') {
    content = <p className="form-text">No iPhone, as notificações só funcionam com o app instalado na tela inicial (iOS 16.4 ou mais novo). Siga a instrução de instalar abaixo e abra pelo ícone.</p>;
  } else if (status === 'unsupported') {
    content = <p className="form-text">Este navegador não recebe notificações. Os avisos continuam no sino da plataforma.</p>;
  } else if (status === 'unconfigured') {
    content = <p className="form-text">As notificações no celular ainda não foram configuradas pelo administrador. Os avisos continuam no sino.</p>;
  } else if (status === 'denied') {
    content = (
      <div role="alert" className="form-message form-message--alert">
        <p style={{ margin: 0, display: 'flex', gap: 8, alignItems: 'center' }}>
          <AppIcon icon={BellOffIcon} size={18} />
          <strong>Notificações bloqueadas no aparelho</strong>
        </p>
        <p style={{ margin: '8px 0 0' }}>{unblockSteps()}</p>
      </div>
    );
  } else if (active) {
    content = (
      <>
        <p className="form-text">Notificações ativas neste aparelho. Você recebe um resumo quando a sua escala sai ou muda.</p>
        <Button variant="secondary" size="sm" disabled={busy} onClick={() => void disable()}>
          Desligar neste aparelho
        </Button>
      </>
    );
  } else {
    content = (
      <>
        <p className="form-text">Receba no celular um resumo quando a sua escala sai ou muda. Tocar na notificação abre a atividade.</p>
        <Button size="sm" disabled={busy || !online || active === null} onClick={() => void enable()}>
          Ativar notificações
        </Button>
        {!online && <p className="form-text">Precisa de internet.</p>}
      </>
    );
  }

  return (
    <Card variant="raised" padding={20}>
      <section aria-labelledby="push-title" className="form-stack">
        <h2 id="push-title" className="section-title">
          Notificações no celular
        </h2>
        {content}
        {message && (
          <p className="form-text" role="status">
            {message}
          </p>
        )}
      </section>
    </Card>
  );
}

/** Faixa "Reativar notificações" quando a inscrição deste aparelho sumiu (US-023 EC-3). */
export function PushReminder() {
  const { remote } = useSyncEngine();
  const own = useOwnPerson();
  const [show, setShow] = useState(false);
  const enabled = own?.push_enabled !== false;
  const known = own !== undefined;

  useEffect(() => {
    if (!known) return;
    let alive = true;
    void needsReactivation(enabled)
      .then((need) => alive && setShow(need))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [known, enabled]);

  if (!show) return null;
  return (
    <div role="status" className="offline-banner offline-banner--info push-reminder">
      <span>As notificações deste aparelho pararam de chegar.</span>
      <Button
        size="sm"
        onClick={() =>
          void enablePush(remote).then((r) => {
            if (r.ok) setShow(false);
          })
        }
      >
        Reativar notificações
      </Button>
    </div>
  );
}
