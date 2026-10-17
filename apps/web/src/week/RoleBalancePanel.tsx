import type { RoleBalance } from '@cronograma/core';
import { Card } from '../ui/chiaro';
import { hoursText } from './model';
import { Seal } from './Seal';

/** Horas pedidas e disponíveis por função, destacando as funções em falta (US-010 AC-3, US-013 EC-4). */
export function RoleBalancePanel({ balance, roleName }: { balance: readonly RoleBalance[]; roleName: (id: string) => string }) {
  const short = balance.filter((b) => b.short).length;
  return (
    <Card variant="raised" padding={20}>
      <section aria-labelledby="falta-title">
        <h2 id="falta-title" className="section-title">
          Horas por função
        </h2>
        {balance.length === 0 ? (
          <p className="form-text">Nenhuma função pedida nesta semana.</p>
        ) : (
          <>
            <p className="form-text">{short === 0 ? 'A equipe disponível cobre todas as funções.' : short === 1 ? '1 função em falta.' : `${short} funções em falta.`}</p>
            <ul className="plain-list balance-list" aria-label="Horas por função">
              {balance.map((b) => (
                <li key={b.jobRoleId} className={`balance-item${b.short ? ' is-short' : ''}`} aria-label={roleName(b.jobRoleId)}>
                  <span className="load-name">{roleName(b.jobRoleId)}</span>
                  <span className="load-hours">
                    {hoursText(b.demandHours)} pedidas, {hoursText(b.supplyHours)} disponíveis
                  </span>
                  {b.short && <Seal kind="cancelado">em falta</Seal>}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </Card>
  );
}
