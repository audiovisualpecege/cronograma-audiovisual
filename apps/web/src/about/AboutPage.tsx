import logoChiaro from '@chiaro/assets/logos/chiaro-filmes-horizontal-white.png';
import { useEffect, useState, type FormEvent } from 'react';
import productIcon from '../assets/icon.svg';
import { desktopBridge, type DesktopBridge } from '../desktop/bridge';
import { UPDATE_EVENT } from '../desktop/UpdateBanner';
import { PageTitle } from '../layout/PageTitle';
import { AppVersion } from '../ui/AppVersion';
import { Button, Card, Input } from '../ui/chiaro';

/** Tela Sobre: o produto, a versão em uso, a assinatura da Chiaro e, no programa, a pasta dos instaladores. */
export function AboutPage({ bridge = desktopBridge() }: { bridge?: DesktopBridge }) {
  return (
    <section className="page about-page">
      <PageTitle light="SOBRE O" black="CRONOGRAMA" />
      <div className="card-grid">
        <Card variant="raised" padding={20}>
          <div className="about-product">
            <img src={productIcon} alt="" width={64} height={64} />
            <div>
              <h2 className="section-title">Cronograma Audiovisual</h2>
              <p className="form-text">Escala da equipe de audiovisual: minha semana, equipe e avisos.</p>
              <AppVersion className="about-version" />
            </div>
          </div>
          <p className="about-signature">
            <span>um produto</span>
            <img src={logoChiaro} alt="Chiaro Filmes" height={20} />
          </p>
        </Card>
        {bridge && <UpdateFolderCard bridge={bridge} />}
      </div>
    </section>
  );
}

/** Pasta central da rede onde ficam os instaladores e o latest.json (só no programa de Windows e Mac). */
function UpdateFolderCard({ bridge }: { bridge: DesktopBridge }) {
  const [folder, setFolder] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    bridge
      .getUpdateFolder()
      .then((value) => alive && setFolder(value))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [bridge]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const result = await bridge.setUpdateFolder(folder);
      setFolder(result.folder);
      window.dispatchEvent(new CustomEvent(UPDATE_EVENT, { detail: result.update }));
      setStatus(result.update ? `Versão nova encontrada: v${result.update.version}.` : 'Pasta salva. Nenhuma versão nova nela agora.');
    } catch {
      setStatus('Não deu para salvar a pasta. Tente de novo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card variant="raised" padding={20}>
      <form className="form-stack" onSubmit={(e) => void save(e)}>
        <h2 className="section-title">Versões novas</h2>
        <p className="form-text">
          Ao abrir, o programa procura versão nova nesta pasta da rede. No Mac, o endereço \\servidor\pasta vira
          /Volumes/pasta sozinho.
        </p>
        <Input label="Pasta dos instaladores" name="update-folder" value={folder} onChange={(e) => setFolder(e.target.value)} />
        {status && (
          <p className="form-text" role="status">
            {status}
          </p>
        )}
        <div>
          <Button type="submit" variant="secondary" size="sm" disabled={saving}>
            Salvar pasta
          </Button>
        </div>
      </form>
    </Card>
  );
}
