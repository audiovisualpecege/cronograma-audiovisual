import { CalendarIcon } from '@solar-icons/react/linear';
import { AppIcon } from './ui/AppIcon';
import { AppVersion } from './ui/AppVersion';

// Tela provisória: as telas de verdade chegam a partir da tarefa 5.
export function App() {
  return (
    <div className="app-shell">
      <main className="app-main">
        <h1 className="app-title">
          <AppIcon icon={CalendarIcon} size={32} />
          <span>
            <span className="app-title-light">CRONOGRAMA</span> <span className="app-title-black">AUDIOVISUAL</span>
          </span>
        </h1>
      </main>
      <footer className="app-footer">
        <AppVersion />
      </footer>
    </div>
  );
}
