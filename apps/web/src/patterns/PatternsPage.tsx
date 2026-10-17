import { personPatterns, typeStats, type Period } from '@cronograma/core';
import { useMemo, useState } from 'react';
import { byName, toFact, useTable, type JobRoleRow, type PersonRow, type ServiceTypeRow } from '../data/catalog';
import { useHistory } from '../data/history';
import { PageTitle } from '../layout/PageTitle';
import { Card, Input, Tag } from '../ui/chiaro';
import { formatStamp } from '../ui/format';
import { Select } from '../ui/Select';

export const NO_HISTORY = 'Os padrões aparecem depois de importar planilhas ou publicar semanas.';

const hours = (n: number) => `${n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h`;

export function PatternsPage() {
  const history = useHistory();
  const types = useTable<ServiceTypeRow>('service_types') ?? [];
  const roles = useTable<JobRoleRow>('job_roles') ?? [];
  const loadedPeople = useTable<PersonRow>('people');
  const people = useMemo(() => loadedPeople ?? [], [loadedPeople]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [personId, setPersonId] = useState('');

  const facts = useMemo(() => (history.rows ?? []).map(toFact), [history.rows]);
  const period = useMemo<Period | undefined>(() => (from || to ? { from: from || undefined, to: to || undefined } : undefined), [from, to]);
  const stats = useMemo(() => typeStats(facts, period), [facts, period]);
  const mine = useMemo(() => (personId ? personPatterns(personId, facts, period) : null), [personId, facts, period]);

  const typeName = new Map(types.map((t) => [t.id, t.name]));
  const roleName = new Map(roles.map((r) => [r.id, r.name]));
  const personName = new Map(people.map((p) => [p.id, p.active ? p.name : `${p.name} (inativa)`]));
  const historyPeople = useMemo(() => {
    const ids = new Set(facts.map((f) => f.personId).filter((x): x is string => Boolean(x)));
    return people.filter((p) => ids.has(p.id)).sort(byName);
  }, [facts, people]);

  if (history.rows === null) {
    return (
      <section className="page">
        <PageTitle black="PADRÕES" />
        <p className="form-text" role="status">
          {history.status === 'loading'
            ? 'Lendo o histórico'
            : history.status === 'offline'
              ? 'Sem internet e sem cópia do histórico neste aparelho. Conecte para ver os padrões.'
              : 'Não foi possível ler o histórico agora. Tente de novo em instantes.'}
        </p>
      </section>
    );
  }

  if (facts.length === 0) {
    return (
      <section className="page">
        <PageTitle black="PADRÕES" />
        <Card variant="raised" padding={20}>
          <p className="form-text">{NO_HISTORY}</p>
          <a className="text-link" href="#/importar">
            Importar planilhas
          </a>
        </Card>
      </section>
    );
  }

  return (
    <section className="page">
      <PageTitle black="PADRÕES" />
      {history.status !== 'ready' && history.fetchedAt && (
        <p className="form-text">Cópia do histórico lida em {formatStamp(history.fetchedAt)}.</p>
      )}
      <div className="filter-bar" aria-label="Período">
        <Input label="De" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input label="Até" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>

      <section aria-labelledby="pad-tipos" className="review-section">
        <h2 id="pad-tipos" className="section-title">
          Por tipo de serviço
        </h2>
        {stats.length === 0 && <p className="form-text">Nenhum evento com tipo neste período.</p>}
        <div className="card-grid">
          {stats.map((s) => (
            <Card key={s.serviceTypeId} variant="default" padding={20}>
              <article aria-label={typeName.get(s.serviceTypeId) ?? 'Tipo'}>
                <div className="review-week-head">
                  <h3 className="card-title">{typeName.get(s.serviceTypeId) ?? 'Tipo arquivado'}</h3>
                  {s.lowHistory && <Tag>pouco histórico</Tag>}
                </div>
                <p className="form-text">
                  {s.events} {s.events === 1 ? 'evento' : 'eventos'}
                </p>
                <p className="form-text">
                  <strong>Equipe típica:</strong>{' '}
                  {s.crew.length ? s.crew.map((c) => `${c.quantity} ${roleName.get(c.jobRoleId) ?? '?'}`).join(', ') : 'sem funções registradas'}
                </p>
                {s.topPeople.map((r) => (
                  <p key={r.jobRoleId} className="list-row-sub">
                    {roleName.get(r.jobRoleId) ?? '?'}: {r.people.map((p) => `${personName.get(p.personId) ?? '?'} (${p.count})`).join(', ')}
                  </p>
                ))}
              </article>
            </Card>
          ))}
        </div>
      </section>

      <section aria-labelledby="pad-pessoas" className="review-section">
        <h2 id="pad-pessoas" className="section-title">
          Por pessoa
        </h2>
        <Select
          label="Pessoa"
          value={personId}
          onChange={(e) => setPersonId(e.target.value)}
          placeholder="Escolha a pessoa"
          options={historyPeople.map((p) => ({ value: p.id, label: personName.get(p.id) ?? p.name }))}
          style={{ maxWidth: 360 }}
        />
        {mine && (
          <Card variant="default" padding={20} style={{ marginTop: 'var(--space-3)' }}>
            {mine.weeks === 0 ? (
              <p className="form-text">Sem eventos desta pessoa no período.</p>
            ) : (
              <>
                <p className="form-text">
                  Carga média: {hours(mine.avgWeeklyHours)} e {mine.avgWeeklyCount.toLocaleString('pt-BR')} eventos por semana, em {mine.weeks}{' '}
                  {mine.weeks === 1 ? 'semana' : 'semanas'}.
                </p>
                <p className="form-text">
                  <strong>Tipos que mais fez:</strong> {mine.types.map((t) => `${typeName.get(t.serviceTypeId) ?? '?'} (${t.count})`).join(', ') || 'nenhum'}
                </p>
                <p className="form-text">
                  <strong>Funções que mais fez:</strong> {mine.roles.map((r) => `${roleName.get(r.jobRoleId) ?? '?'} (${r.count})`).join(', ') || 'nenhuma'}
                </p>
              </>
            )}
          </Card>
        )}
      </section>
    </section>
  );
}
