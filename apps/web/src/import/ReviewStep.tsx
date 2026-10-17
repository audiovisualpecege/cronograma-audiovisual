import { addDays, planImport, type TitleIndex, type WeekChoice, type WorkbookRead } from '@cronograma/core';
import { useMemo, useState } from 'react';
import { byName, type HistoryFactRow, type JobRoleRow, type PersonRow, type ServiceTypeRow } from '../data/catalog';
import { OnlineButton } from '../sync/OnlineButton';
import { Button, Card, Radio, Tag } from '../ui/chiaro';
import { formatDate } from '../ui/format';
import { Select } from '../ui/Select';
import {
  buildCommit,
  defaultNameChoice,
  defaultTypes,
  eventKey,
  nameChoiceReady,
  readNames,
  readRoleLabels,
  SKIP_REASON,
  type CommitArgs,
  type NameChoice,
} from './review';

export interface ReviewProps {
  fileName: string;
  read: WorkbookRead;
  people: readonly PersonRow[];
  roles: readonly JobRoleRow[];
  types: readonly ServiceTypeRow[];
  /** Semanas com linha em `weeks` (montadas ou publicadas na plataforma). */
  platformWeeks: readonly string[];
  /** Histórico já gravado; nulo enquanto não foi lido do servidor. */
  history: readonly HistoryFactRow[] | null;
  saving: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: (args: CommitArgs, outside: number) => void;
}

const firstLine = (s: string) => s.split('\n')[0] ?? s;

export function ReviewStep({ fileName, read, people, roles, types, platformWeeks, history, saving, error, onCancel, onConfirm }: ReviewProps) {
  const sortedPeople = useMemo(() => [...people].sort(byName), [people]);
  const activeRoles = useMemo(() => [...roles].filter((r) => !r.archived_at).sort(byName), [roles]);
  const activeTypes = useMemo(() => [...types].filter((t) => !t.archived_at).sort(byName), [types]);
  const nameRows = useMemo(() => readNames(read.weeks, people), [read.weeks, people]);
  const roleRows = useMemo(() => readRoleLabels(read.weeks, roles), [read.weeks, roles]);
  const titles: TitleIndex = useMemo(
    () => (history ?? []).flatMap((h) => (h.service_type_id ? [{ title: h.title, serviceTypeId: h.service_type_id }] : [])),
    [history],
  );

  // Só o que a pessoa mudou fica guardado; o resto segue a proposta, que muda quando a cópia local termina de abrir.
  const [nameOverrides, setNames] = useState<Record<string, NameChoice>>({});
  const [roleOverrides, setRoleLinks] = useState<Record<string, string | null>>({});
  const [typeOverrides, setEventTypes] = useState<Record<string, string>>({});
  const [choices, setChoices] = useState<Record<string, WeekChoice>>({});
  const names = useMemo(
    () => Object.fromEntries(nameRows.map((r) => [r.raw, nameOverrides[r.raw] ?? defaultNameChoice(r)])),
    [nameRows, nameOverrides],
  );
  const roleLinks = useMemo(
    () => Object.fromEntries(roleRows.map((r) => [r.label, r.label in roleOverrides ? (roleOverrides[r.label] ?? null) : r.suggested])),
    [roleRows, roleOverrides],
  );
  const eventTypes = useMemo(() => ({ ...defaultTypes(read.weeks, types, titles), ...typeOverrides }), [read.weeks, types, titles, typeOverrides]);

  const importedWeeks = useMemo(() => [...new Set((history ?? []).filter((h) => h.source === 'import').map((h) => h.week_start))], [history]);
  const plan = useMemo(
    () => planImport({ weeks: read.weeks, platformWeeks: [...platformWeeks], importedWeeks, choices }),
    [read.weeks, platformWeeks, importedWeeks, choices],
  );
  const byWeek = new Map(read.weeks.map((w) => [w.weekStart, w]));
  const namesReady = Object.values(names).every(nameChoiceReady);
  const ready = plan.ready && namesReady && history !== null;
  const excludedEvents = plan.excluded.reduce((n, x) => n + (byWeek.get(x.weekStart)?.events.length ?? 0), 0);
  const ignoredEvents = plan.weeks.filter((w) => w.choice === 'ignore').reduce((n, w) => n + w.events, 0);

  function confirm() {
    const args = buildCommit({ fileName, plan, names, roles: roleLinks, eventTypes, types });
    onConfirm(args, read.skipped.length + excludedEvents + ignoredEvents);
  }

  return (
    <div className="review">
      <Card variant="raised" padding={20}>
        <h2 className="section-title">Revisão de {fileName}</h2>
        <p className="form-text">
          Nada foi gravado ainda. Confira as semanas, ligue os nomes ao cadastro e confirme no fim. Cancelar descarta a leitura.
        </p>
        {history === null && (
          <p className="form-message form-message--alert" role="alert">
            Precisa de internet para conferir as semanas já importadas antes de gravar.
          </p>
        )}
      </Card>

      <section aria-labelledby="rev-semanas" className="review-section">
        <h3 id="rev-semanas" className="section-title">
          Semanas encontradas ({plan.weeks.length})
        </h3>
        {plan.weeks.map((w) => {
          const week = byWeek.get(w.weekStart);
          return (
            <Card key={w.weekStart} variant="default" padding={16} style={{ marginBottom: 'var(--space-3)' }}>
              <div className="review-week-head">
                <strong>
                  Semana de {formatDate(w.weekStart)} a {formatDate(addDays(w.weekStart, 6))}
                </strong>
                <span className="list-row-sub">
                  {w.events} eventos, {w.assignments} alocações
                </span>
                {w.status === 'already_imported' ? <Tag>já importada</Tag> : <Tag>nova</Tag>}
              </div>
              {w.status === 'already_imported' && (
                <fieldset className="radio-row">
                  <legend className="form-text">Esta semana já foi importada antes. O que fazer?</legend>
                  <Radio
                    name={`semana-${w.weekStart}`}
                    label="Substituir a semana antiga"
                    checked={w.choice === 'replace'}
                    onChange={() => setChoices((c) => ({ ...c, [w.weekStart]: 'replace' }))}
                  />
                  <Radio
                    name={`semana-${w.weekStart}`}
                    label="Ignorar a nova"
                    checked={w.choice === 'ignore'}
                    onChange={() => setChoices((c) => ({ ...c, [w.weekStart]: 'ignore' }))}
                  />
                </fieldset>
              )}
              {week && w.choice !== 'ignore' && (
                <details className="review-events">
                  <summary>Ver eventos e tipos</summary>
                  <ul className="plain-list">
                    {week.events.map((e, i) => {
                      const key = eventKey(w.weekStart, i);
                      const title = firstLine(e.title);
                      return (
                        <li key={key} className="review-event">
                          <span>
                            <strong>{title}</strong>{' '}
                            <span className="list-row-sub">
                              {formatDate(e.date)} {e.start ?? ''}
                              {e.end ? ` até ${e.end}` : ''}
                              {e.assignments.length > 0 && ` · ${e.assignments.map((a) => a.rawName).join(', ')}`}
                            </span>
                            {e.cancelled && <Tag>cancelado</Tag>}
                          </span>
                          <Select
                            aria-label={`Tipo de ${title}`}
                            value={eventTypes[key] ?? ''}
                            onChange={(ev) => setEventTypes((t) => ({ ...t, [key]: ev.target.value }))}
                            placeholder="Tipo a definir"
                            options={activeTypes.map((t) => ({ value: t.id, label: t.name }))}
                            style={{ minWidth: 220 }}
                          />
                        </li>
                      );
                    })}
                  </ul>
                </details>
              )}
            </Card>
          );
        })}
        {plan.weeks.length === 0 && <p className="form-text">Nenhuma semana para gravar.</p>}
      </section>

      {nameRows.length > 0 && (
        <section aria-labelledby="rev-nomes" className="review-section">
          <h3 id="rev-nomes" className="section-title">
            Pessoas lidas ({nameRows.length})
          </h3>
          {nameRows.map((row) => {
            const c = names[row.raw] as NameChoice;
            const set = (next: NameChoice) => setNames((n) => ({ ...n, [row.raw]: next }));
            return (
              <fieldset key={row.raw} className="name-link" aria-label={`Ligação de ${row.raw}`}>
                <legend>
                  <strong>{row.raw}</strong> <span className="list-row-sub">aparece {row.count} {row.count === 1 ? 'vez' : 'vezes'}</span>
                </legend>
                <div className="radio-row">
                  {row.suggestion && (
                    <Radio
                      name={`nome-${row.raw}`}
                      label={`${row.suggestion.name} (${row.suggestion.exact ? 'mesmo nome' : 'sugerido'})`}
                      checked={c.mode === 'suggested'}
                      onChange={() => set({ mode: 'suggested', personId: row.suggestion?.id ?? '' })}
                    />
                  )}
                  <Radio name={`nome-${row.raw}`} label="Escolher outra" checked={c.mode === 'other'} onChange={() => set({ mode: 'other', personId: null })} />
                  <Radio name={`nome-${row.raw}`} label="Criar pessoa inativa" checked={c.mode === 'create'} onChange={() => set({ mode: 'create' })} />
                  <Radio name={`nome-${row.raw}`} label="Ignorar" checked={c.mode === 'ignore'} onChange={() => set({ mode: 'ignore' })} />
                </div>
                {c.mode === 'other' && (
                  <Select
                    label={`Pessoa para ${row.raw}`}
                    value={c.personId ?? ''}
                    onChange={(e) => set({ mode: 'other', personId: e.target.value || null })}
                    placeholder="Escolha a pessoa"
                    options={sortedPeople.map((p) => ({ value: p.id, label: p.active ? p.name : `${p.name} (inativa)` }))}
                    error={c.personId ? undefined : 'Escolha a pessoa ou outra opção.'}
                  />
                )}
              </fieldset>
            );
          })}
        </section>
      )}

      {roleRows.length > 0 && (
        <section aria-labelledby="rev-funcoes" className="review-section">
          <h3 id="rev-funcoes" className="section-title">
            Funções lidas
          </h3>
          <p className="form-text">Ligue cada função da planilha a uma função do cadastro. Para criar uma função nova, use a tela Funções: as funções lidas aparecem lá como sugestão.</p>
          <div className="form-grid">
            {roleRows.map((r) => (
              <Select
                key={r.label}
                label={`${r.label} (${r.count})`}
                value={roleLinks[r.label] ?? ''}
                onChange={(e) => setRoleLinks((l) => ({ ...l, [r.label]: e.target.value || null }))}
                placeholder="Sem função"
                options={activeRoles.map((x) => ({ value: x.id, label: x.name }))}
              />
            ))}
          </div>
        </section>
      )}

      {(read.skipped.length > 0 || plan.excluded.length > 0) && (
        <section aria-labelledby="rev-fora" className="review-section">
          <h3 id="rev-fora" className="section-title">
            Não importados
          </h3>
          <ul className="plain-list skipped-list" aria-label="Não importados">
            {plan.excluded.map((x) => (
              <li key={`semana-${x.weekStart}`}>
                <Tag>semana montada</Tag> Semana de {formatDate(x.weekStart)}: já existe na plataforma e nunca é sobrescrita.
              </li>
            ))}
            {read.skipped.map((s, i) => (
              <li key={`${s.sheet}-${s.row ?? 'aba'}-${i}`}>
                <Tag>{SKIP_REASON[s.reason]}</Tag> {s.sheet}
                {s.row !== null ? `, linha ${s.row}` : ''}: {s.detail}
              </li>
            ))}
          </ul>
        </section>
      )}

      {plan.needsChoice.length > 0 && (
        <p className="form-message form-message--alert" role="alert">
          Escolha se substitui ou ignora as semanas já importadas antes de confirmar.
        </p>
      )}
      {!namesReady && (
        <p className="form-message form-message--alert" role="alert">
          Escolha a pessoa de cada nome marcado com "Escolher outra".
        </p>
      )}
      {error && (
        <p className="form-message form-message--alert" role="alert">
          {error}
        </p>
      )}
      <div className="dialog-actions">
        <span className="dialog-actions-spacer" />
        <Button variant="secondary" onClick={onCancel} disabled={saving}>
          Cancelar
        </Button>
        <OnlineButton onClick={confirm} disabled={!ready || saving}>
          {saving ? 'Gravando' : 'Confirmar importação'}
        </OnlineButton>
      </div>
    </div>
  );
}
