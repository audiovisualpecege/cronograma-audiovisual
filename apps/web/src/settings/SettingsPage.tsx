import { PageTitle } from '../layout/PageTitle';
import { AiSettings } from './AiSettings';
import { AutomationSettings } from './AutomationSettings';
import { CalendarSettings } from './CalendarSettings';
import { useSettings } from './jobs';

export function SettingsPage() {
  const settings = useSettings();
  return (
    <section className="page settings-page">
      <PageTitle black="CONFIGURAÇÃO" />
      <CalendarSettings />
      {settings ? (
        <>
          <AiSettings settings={settings} />
          <AutomationSettings settings={settings} />
        </>
      ) : (
        <p className="form-text">Lendo a configuração.</p>
      )}
    </section>
  );
}
