import { LogoutIcon } from '@solar-icons/react/linear';
import productIcon from '../assets/icon.svg';
import { useSession } from '../auth/session';
import type { Me } from '../supabase';
import { AppIcon } from '../ui/AppIcon';
import { AppVersion } from '../ui/AppVersion';
import { navEntries } from './nav';
import { NavList } from './NavList';

/** Menu lateral do PC e do Mac, com a versão fixa no rodapé. */
export function SideNav({ me, path }: { me: Me; path: string }) {
  const { signOut } = useSession();
  return (
    <nav className="side-nav" aria-label="Menu principal">
      <a className="side-nav-brand" href={`#${me.profile === 'admin' ? '/painel' : '/minha-semana'}`}>
        <img src={productIcon} alt="" width={32} height={32} />
        <span className="screen-title">
          <span className="screen-title-light">CRONOGRAMA</span> <span className="screen-title-black">AUDIOVISUAL</span>
        </span>
      </a>
      <ul className="side-nav-list">
        <NavList entries={navEntries(me.profile)} path={path} />
      </ul>
      <div className="side-nav-footer">
        <span className="side-nav-user">{me.name}</span>
        <button type="button" className="nav-link" onClick={() => void signOut()}>
          <AppIcon icon={LogoutIcon} size={20} />
          <span>Sair</span>
        </button>
        <AppVersion />
      </div>
    </nav>
  );
}
