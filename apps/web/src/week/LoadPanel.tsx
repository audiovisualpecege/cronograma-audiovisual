import { Card } from '../ui/chiaro';
import { activitiesText, hoursText, type PersonLoadRow } from './model';
import { Seal } from './Seal';

/** Carga semanal de cada pessoa, com destaque para quem passa do limite (US-014 AC-4). */
export function LoadPanel({ rows }: { rows: readonly PersonLoadRow[] }) {
  const over = rows.filter((r) => r.over).length;
  return (
    <Card variant="raised" padding={20}>
      <section aria-labelledby="carga-title" className="load-panel">
        <h2 id="carga-title" className="section-title">
          Carga da semana
        </h2>
        {over > 0 && (
          <p className="form-message form-message--alert" role="status">
            {over === 1 ? '1 pessoa passa do limite semanal.' : `${over} pessoas passam do limite semanal.`}
          </p>
        )}
        <ul className="plain-list load-list" aria-label="Carga por pessoa">
          {rows.map((r) => (
            <li key={r.personId} className={`load-item${r.over ? ' is-over' : ''}`} aria-label={r.name} data-over={r.over ? 'true' : undefined}>
              <span className="load-name">{r.name}</span>
              <span className="load-hours">
                {hoursText(r.hours)} de {hoursText(r.limit)}, {activitiesText(r.count)}
              </span>
              {r.over && <Seal kind="cancelado">passa do limite</Seal>}
            </li>
          ))}
        </ul>
      </section>
    </Card>
  );
}
