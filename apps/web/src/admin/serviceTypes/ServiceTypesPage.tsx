import { CREW_QUANTITY_MAX, CREW_QUANTITY_MIN, suggestCrew, validateServiceType } from '@cronograma/core';
import { AddCircleIcon, TrashBinMinimalisticIcon } from '@solar-icons/react/linear';
import { useMemo, useState, type FormEvent } from 'react';
import { byName, crewOf, toFact, useTable, type CrewItem, type CrewRow, type JobRoleRow, type ServiceTypeRow } from '../../data/catalog';
import { firstError } from '../../data/messages';
import { PageTitle } from '../../layout/PageTitle';
import { useSyncEngine, useSyncState } from '../../sync/SyncProvider';
import { AppIcon } from '../../ui/AppIcon';
import { Button, Card, Checkbox, Input, Tag } from '../../ui/chiaro';
import { Dialog } from '../../ui/Dialog';
import { IconButton } from '../../ui/IconButton';
import { Select } from '../../ui/Select';
import { TYPE_ICONS, typeIcon } from '../../ui/typeIcons';
import { useCatalogSuggestions } from '../suggestions';

interface CrewDraft {
  key: string;
  jobRoleId: string;
  quantity: string;
}

export function crewText(crew: readonly CrewItem[], roleName: Map<string, string>): string {
  return crew.map((c) => `${c.quantity} ${roleName.get(c.job_role_id) ?? '?'}`).join(', ');
}

/** Banco de ícones do tipo; "Automático" deixa o app escolher pelo nome. */
function IconPicker({ name, value, onChange }: { name: string; value: string; onChange: (key: string) => void }) {
  const auto = typeIcon({ name });
  return (
    <fieldset className="check-group">
      <legend className="field-label">Ícone</legend>
      <div className="icon-bank" role="radiogroup" aria-label="Ícone do tipo">
        <button
          type="button"
          role="radio"
          aria-checked={value === ''}
          className={`icon-choice icon-choice--auto${value === '' ? ' is-selected' : ''}`}
          onClick={() => onChange('')}
          title={`Automático (${auto.label})`}
        >
          <AppIcon icon={auto.icon} size={24} />
          <span className="icon-choice-label">Automático</span>
        </button>
        {TYPE_ICONS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="radio"
            aria-checked={value === t.key}
            aria-label={t.label}
            title={t.label}
            className={`icon-choice${value === t.key ? ' is-selected' : ''}`}
            onClick={() => onChange(t.key)}
          >
            <AppIcon icon={t.icon} size={24} />
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function ServiceTypeForm({
  type,
  initialName,
  roles,
  types,
  crew,
  suggested,
  onClose,
}: {
  type?: ServiceTypeRow;
  initialName?: string;
  roles: JobRoleRow[];
  types: ServiceTypeRow[];
  crew: CrewRow[];
  suggested: CrewItem[];
  onClose: () => void;
}) {
  const engine = useSyncEngine();
  const [id] = useState(() => type?.id ?? crypto.randomUUID());
  const [name, setName] = useState(type?.name ?? initialName ?? '');
  const [keywords, setKeywords] = useState((type?.keywords ?? []).join(', '));
  const [noTeam, setNoTeam] = useState(type?.no_team ?? false);
  const [icon, setIcon] = useState(type?.icon ?? '');
  const [complex, setComplex] = useState(type?.complex ?? false);
  const [rows, setRows] = useState<CrewDraft[]>(() =>
    (type ? crewOf(type, crew) : []).map((c) => ({ key: crypto.randomUUID(), jobRoleId: c.job_role_id, quantity: String(c.quantity) })),
  );
  const [tried, setTried] = useState(false);
  const roleName = new Map(roles.map((r) => [r.id, r.name]));
  const picked = rows.filter((r) => r.jobRoleId);
  const items = picked.map((r) => ({ jobRoleId: r.jobRoleId, quantity: Number(r.quantity) }));
  const check = validateServiceType(
    { name, keywords: keywords.split(','), crew: noTeam ? [] : items, noTeam },
    types.filter((t) => t.id !== id).map((t) => t.name),
  );
  const errors = tried ? check.errors : [];
  const repeated = new Set(picked.map((r) => r.jobRoleId)).size !== picked.length;

  function update(key: string, patch: Partial<CrewDraft>) {
    setRows((list) => list.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    if (!check.ok || repeated) return;
    const v = check.value;
    const crewPayload = v.crew.map((c) => ({ job_role_id: c.jobRoleId, quantity: c.quantity }));
    await engine.enqueue(
      'service_type.upsert',
      { id, name: v.name, keywords: v.keywords, no_team: v.noTeam, icon: icon || null, complex, crew: crewPayload },
      { target: { table: 'service_types', id, changes: { name: v.name, keywords: v.keywords, no_team: v.noTeam, icon: icon || null, complex, crew: crewPayload, code: type?.code ?? '' } } },
    );
    onClose();
  }

  async function archive() {
    if (!type) return;
    await engine.enqueue('service_type.archive', { id: type.id }, { target: { table: 'service_types', id: type.id, changes: { archived_at: new Date().toISOString() } } });
    onClose();
  }

  return (
    <Dialog open onClose={onClose} title={type ? type.name : 'Novo tipo de serviço'} width={640}>
      <form className="form-stack" onSubmit={submit} noValidate aria-label="Tipo de serviço">
        <Input label="Nome" value={name} onChange={(e) => setName(e.target.value)} error={firstError(errors, ['name_required', 'name_taken'])} />
        <Input
          label="Palavras-chave"
          value={keywords}
          onChange={(e) => setKeywords(e.target.value)}
          hint="Separadas por vírgula. Um título com a palavra recebe este tipo com certeza alta."
        />
        <IconPicker name={name} value={icon} onChange={setIcon} />
        <Checkbox label="Não exige equipe (não gera vagas e não aparece para a equipe)" checked={noTeam} onChange={setNoTeam} />
        {!noTeam && (
          <Checkbox
            label="Trabalho complexo (a escala sugerida chama primeiro quem é Referência na função)"
            checked={complex}
            onChange={setComplex}
          />
        )}

        {!noTeam && (
          <fieldset className="check-group">
            <legend className="field-label">Equipe típica</legend>
            {rows.map((r) => (
              <div key={r.key} className="crew-row">
                <Select
                  label="Função"
                  value={r.jobRoleId}
                  onChange={(e) => update(r.key, { jobRoleId: e.target.value })}
                  placeholder="Escolha a função"
                  options={roles.filter((x) => !x.archived_at || x.id === r.jobRoleId).map((x) => ({ value: x.id, label: x.name }))}
                />
                <Input
                  label="Quantidade"
                  inputMode="numeric"
                  value={r.quantity}
                  onChange={(e) => update(r.key, { quantity: e.target.value })}
                  style={{ maxWidth: 140 }}
                />
                <IconButton icon={TrashBinMinimalisticIcon} label="Tirar esta função" onClick={() => setRows((list) => list.filter((x) => x.key !== r.key))} />
              </div>
            ))}
            <Button type="button" variant="ghost" size="sm" onClick={() => setRows((list) => [...list, { key: crypto.randomUUID(), jobRoleId: '', quantity: '1' }])}>
              <AppIcon icon={AddCircleIcon} size={18} /> Adicionar função
            </Button>
            {errors.includes('invalid_quantity') && (
              <span className="field-error" role="alert">
                A quantidade por função vai de {CREW_QUANTITY_MIN} a {CREW_QUANTITY_MAX}.
              </span>
            )}
            {errors.includes('type_without_crew') && (
              <span className="field-error" role="alert">
                {firstError(errors, ['type_without_crew'])}
              </span>
            )}
            {tried && repeated && (
              <span className="field-error" role="alert">
                Cada função entra uma vez só. Junte as quantidades na mesma linha.
              </span>
            )}
          </fieldset>
        )}

        {type && suggested.length > 0 && !noTeam && (
          <div className="form-message">
            Equipe sugerida pelo histórico: {crewText(suggested, roleName)}.{' '}
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setRows(suggested.map((c) => ({ key: crypto.randomUUID(), jobRoleId: c.job_role_id, quantity: String(c.quantity) })))}
            >
              Adotar equipe sugerida
            </Button>
          </div>
        )}
        {type && <p className="form-text">Mudar a equipe vale para os eventos ainda sem escala; os já escalados mantêm as vagas e mostram "equipe típica mudou".</p>}

        <div className="dialog-actions">
          {type && !type.archived_at && (
            <Button type="button" variant="ghost" onClick={() => void archive()}>
              Arquivar
            </Button>
          )}
          <span className="dialog-actions-spacer" />
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit">Salvar</Button>
        </div>
      </form>
    </Dialog>
  );
}

export function ServiceTypesPage() {
  const { pendingRows } = useSyncState();
  const types = useTable<ServiceTypeRow>('service_types');
  const crew = useTable<CrewRow>('service_type_crew');
  const roles = [...(useTable<JobRoleRow>('job_roles') ?? [])].sort(byName);
  const suggestions = useCatalogSuggestions(roles, types);
  const [open, setOpen] = useState<{ id?: string; name?: string } | null>(null);
  const list = [...(types ?? [])].sort((a, b) => Number(Boolean(a.archived_at)) - Number(Boolean(b.archived_at)) || byName(a, b));
  const roleName = new Map(roles.map((r) => [r.id, r.name]));
  const facts = useMemo(() => (suggestions.history.rows ?? []).map(toFact), [suggestions.history.rows]);
  const editing = open?.id ? list.find((t) => t.id === open.id) : undefined;

  return (
    <section className="page">
      <div className="page-head">
        <PageTitle light="TIPOS DE" black="SERVIÇO" />
        <Button onClick={() => setOpen({})}>
          <AppIcon icon={AddCircleIcon} size={18} /> Novo tipo
        </Button>
      </div>

      {suggestions.types.length > 0 && (
        <Card variant="default" padding={20} style={{ marginBottom: 'var(--space-4)' }}>
          <h2 className="section-title">Tipos encontrados no histórico</h2>
          <p className="form-text">Toque para criar o tipo e escolher a equipe típica.</p>
          <div className="tag-row">
            {suggestions.types.map((name) => (
              <Tag key={name} onClick={() => setOpen({ name })}>
                Criar {name}
              </Tag>
            ))}
          </div>
        </Card>
      )}

      <ul className="catalog-list" aria-label="Tipos de serviço">
        {list.map((t) => {
          const items = crewOf(t, crew ?? []);
          return (
            <li key={t.id} className="catalog-item">
              <button type="button" className="list-row" onClick={() => setOpen({ id: t.id })} aria-label={`Abrir ${t.name}`}>
                <span className="type-icon">
                  <AppIcon icon={typeIcon(t).icon} size={24} />
                </span>
                <span className="list-row-main">
                  <span className="list-row-title">
                    {t.name}
                    {t.code && <span className="list-row-code">{t.code}</span>}
                  </span>
                  <span className="list-row-sub">
                    {t.complex ? 'trabalho complexo · ' : ''}
                    {t.no_team ? 'não exige equipe' : items.length ? crewText(items, roleName) : 'sem equipe típica'}
                    {t.keywords.length > 0 && ` · palavras-chave: ${t.keywords.join(', ')}`}
                  </span>
                </span>
                <span className="list-row-tags">
                  {t.archived_at && <Tag>arquivado</Tag>}
                  {pendingRows.has(`service_types:${t.id}`) && <Tag>a enviar</Tag>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {types && list.length === 0 && <p className="form-text">Nenhum tipo cadastrado ainda.</p>}

      {open && types && crew && (
        <ServiceTypeForm
          key={open.id ?? open.name ?? 'novo'}
          type={editing}
          initialName={open.name}
          roles={roles}
          types={types}
          crew={crew}
          suggested={editing ? suggestCrew(facts, editing.id).map((c) => ({ job_role_id: c.jobRoleId, quantity: c.quantity })) : []}
          onClose={() => setOpen(null)}
        />
      )}
    </section>
  );
}
