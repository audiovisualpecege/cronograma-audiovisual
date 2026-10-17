import { useState } from 'react';
import type { SettingsRow } from '../data/catalog';
import { useSyncEngine } from '../sync/SyncProvider';
import { Card, Input } from '../ui/chiaro';
import { Switch } from '../ui/Switch';

export const POLL_MIN = 5;
export const POLL_MAX = 120;

type Flag = 'calendar_poll_enabled' | 'ai_classification_enabled' | 'ai_proposal_enabled' | 'push_enabled_global';

export function AutomationSettings({ settings }: { settings: SettingsRow }) {
  const engine = useSyncEngine();
  const [minutes, setMinutes] = useState(String(settings.calendar_poll_minutes));
  const value = Number(minutes);
  const valid = Number.isInteger(value) && value >= POLL_MIN && value <= POLL_MAX;

  function update(changes: Partial<Pick<SettingsRow, Flag | 'calendar_poll_minutes'>>) {
    void engine.enqueue('settings.update', changes, { target: { table: 'settings', id: settings.id, changes } });
  }

  function saveMinutes() {
    if (valid && value !== settings.calendar_poll_minutes) update({ calendar_poll_minutes: value });
  }

  return (
    <Card variant="raised" padding={24}>
      <section aria-labelledby="cfg-auto">
        <h2 id="cfg-auto" className="section-title">
          Automações
        </h2>
        <div className="switch-list">
          <Switch
            label="Releitura automática das agendas"
            checked={settings.calendar_poll_enabled}
            onChange={(on) => update({ calendar_poll_enabled: on })}
            hint="Desligada, as agendas só são lidas em Reler agora."
          />
          {settings.calendar_poll_enabled && (
            <Input
              label="Intervalo da releitura, em minutos"
              inputMode="numeric"
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              onBlur={saveMinutes}
              hint={`De ${POLL_MIN} a ${POLL_MAX} minutos. O padrão é 15.`}
              error={valid ? undefined : `Use um intervalo de ${POLL_MIN} a ${POLL_MAX} minutos.`}
              style={{ maxWidth: 320 }}
            />
          )}
          <Switch
            label="Classificação dos eventos pela IA"
            checked={settings.ai_classification_enabled}
            onChange={(on) => update({ ai_classification_enabled: on })}
            hint="Desligada, o tipo é previsto só pelas palavras-chave e pelos títulos do histórico."
          />
          <Switch
            label="Pré-escala pela IA"
            checked={settings.ai_proposal_enabled}
            onChange={(on) => update({ ai_proposal_enabled: on })}
            hint="Desligada, a escala é toda manual."
          />
          <Switch
            label="Notificações no celular para toda a equipe"
            checked={settings.push_enabled_global}
            onChange={(on) => update({ push_enabled_global: on })}
            hint="Desligadas, os avisos continuam dentro da plataforma."
          />
        </div>
      </section>
    </Card>
  );
}
