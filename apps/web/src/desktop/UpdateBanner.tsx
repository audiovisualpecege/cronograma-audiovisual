import { CloseIcon, DownloadMinimalisticIcon } from '@solar-icons/react/linear';
import { useEffect, useState } from 'react';
import { AppIcon } from '../ui/AppIcon';
import { Button } from '../ui/chiaro';
import { IconButton } from '../ui/IconButton';
import { desktopBridge, type DesktopBridge, type DesktopUpdate } from './bridge';

/** Evento disparado quando a pasta central muda na tela Sobre e o programa relê o latest.json. */
export const UPDATE_EVENT = 'cronograma:update';

/**
 * Aviso de versão nova no programa de Windows e Mac (US-027 AC-2): aparece quando a pasta central da rede tem
 * versão maior, com o botão "Instalar vX.Y.Z" que abre o instalador do sistema. Sem versão nova, pasta fora do
 * alcance ou fora do programa, não mostra nada.
 */
export function UpdateBanner({ bridge = desktopBridge() }: { bridge?: DesktopBridge }) {
  const [update, setUpdate] = useState<DesktopUpdate | null>(null);
  const [closed, setClosed] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!bridge) return;
    let alive = true;
    bridge
      .getUpdate()
      .then((value) => alive && setUpdate(value))
      .catch(() => undefined);
    const onChange = (event: Event) => {
      setUpdate((event as CustomEvent<DesktopUpdate | null>).detail);
      setClosed(false);
    };
    window.addEventListener(UPDATE_EVENT, onChange);
    return () => {
      alive = false;
      window.removeEventListener(UPDATE_EVENT, onChange);
    };
  }, [bridge]);

  if (!bridge || !update || closed) return null;

  const install = async () => {
    setFailed(false);
    const ok = await bridge.installUpdate().catch(() => false);
    if (!ok) setFailed(true);
  };

  return (
    <div className="update-banner" role="status" aria-label="Versão nova">
      <span className="update-banner-icon">
        <AppIcon icon={DownloadMinimalisticIcon} size={18} />
      </span>
      <div className="update-banner-text">
        <strong>Versão nova: v{update.version}</strong>
        <span>
          {failed
            ? 'Não deu para abrir o instalador. Confira se a pasta da rede está acessível e tente de novo.'
            : 'Instale para usar a mesma versão que os colegas.'}
        </span>
      </div>
      <Button size="sm" onClick={() => void install()}>
        Instalar v{update.version}
      </Button>
      <IconButton icon={CloseIcon} label="Agora não" size={36} onClick={() => setClosed(true)} />
    </div>
  );
}
