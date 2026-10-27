import {
  CREW_QUANTITY_MAX,
  CREW_QUANTITY_MIN,
  DEFAULT_SIZE,
  EVENT_SIZES,
  isEventSize,
  SINGLE_CREW_SIZE,
  SIZE_LABEL,
  suggestCrew,
  validateServiceType,
  type EventSize,
} from '@cronograma/core';
import { AddCircleIcon, TrashBinMinimalisticIcon } from '@solar-icons/react/linear';
import { useMemo, useState, type FormEvent } from 'react';
import { byName, crewOf, toFact, useTable, type CrewItem, type CrewRow, type JobRoleRow, type SectorRow, type ServiceTypeRow } from '../../data/catalog';
import { firstError } from '../../data/messages';
import { previewActive, previewCatalog, setPreviewExternal, usePreviewExternal } from '../../dev/sizePreview';
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
  /** Porte da linha (1 Simples, 2 Médio, 3 Grande); sem porte, todas ficam no 2. */
  size: EventSize;
}

export function crewText(crew: readonly CrewItem[], roleName: Map<string, string>): string {
  return crew.map((c) => `${c.quantity} ${roleName.get(c.job_role_id) ?? '?'}`).join(', ');
}

/** Equipe do tipo em texto; com porte, "Simples: ... · Médio: ... · Grande: ...". */
export function typeCrewText(type: ServiceTypeRow, crew: readonly CrewRow[], roleName: Map<string, string>): string {
  if (!type.sized) return crewText(crewOf(type, crew, SINGLE_CREW_SIZE), roleName);
  const fallback = isEventSize(type.default_size) ? type.default_size : DEFAULT_SIZE;
  return EVENT_SIZES.map((s) => `${SIZE_LABEL[s]}${s === fallback ? ' (padrão)' : ''}: ${crewText(crewOf(type, crew, s), roleName) || 'ninguém'}`).join(' · ');
}

const draftRow = (c: Pick<CrewItem, 'job_role_id' | 'quantity'>, size: EventSize): CrewDraft => ({
  key: crypto.randomUUID(),
  jobRoleId: c.job_role_id,
  quantity: String(c.quantity),
  size,
});

/** As linhas de um porte da equipe típica: função, quantidade e tirar; mais "Adicionar função". */
function CrewRows({
  rows,
  roles,
  label,
  onChange,
  onRemove,
  onAdd,
}: {
  rows: CrewDraft[];
  roles: JobRoleRow[];
  label: string;
  onChange: (key: string, patch: Partial<CrewDraft>) => void;
  onRemove: (key: string) => void;
  onAdd: () => void;
}) {
  return (
    <fieldset className="check-group">
      <legend className="field-label">{label}</legend>
      {rows.map((r) => (
        <div key={r.key} className="crew-row">
          <Select
            label="Função"
            value={r.jobRoleId}
            onChange={(e) => onChange(r.key, { jobRoleId: e.target.value })}
            placeholder="Escolha a função"
            options={roles.filter((x) => !x.archived_at || x.id === r.jobRoleId).map((x) => ({ value: x.id, label: x.name }))}
          />
          <Input
            label="Quantidade"
            inputMode="numeric"
            value={r.quantity}
            onChange={(e) => onChange(r.key, { quantity: e.target.value })}
            style={{ maxWidth: 140 }}
          />
          <IconButton icon={TrashBinMinimalisticIcon} label="Tirar esta função" onClick={() => onRemove(r.key)} />
        </div>
      ))}
      <Button type="button" variant="ghost" size="sm" onClick={onAdd}>
        <AppIcon icon={AddCircleIcon} size={18} /> Adicionar função
      </Button>
    </fieldset>
  );
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
  simulated,
  sectors,
  onClose,
}: {
  type?: ServiceTypeRow;
  initialName?: string;
  roles: JobRoleRow[];
  sectors: SectorRow[];
  types: ServiceTypeRow[];
  crew: CrewRow[];
  suggested: CrewItem[];
  /** Simulação do porte no app local: só para ver; salvar gravaria a equipe errada no banco antigo. */
  simulated: boolean;
  onClose: () => void;
}) {
  const engine = useSyncEngine();
  const [id] = useState(() => type?.id ?? crypto.randomUUID());
  const [name, setName] = useState(type?.name ?? initialName ?? '');
  const [keywords, setKeywords] = useState((type?.keywords ?? []).join(', '));
  const [noTeam, setNoTeam] = useState(type?.no_team ?? false);
  const [icon, setIcon] = useState(type?.icon ?? '');
  const [complex, setComplex] = useState(type?.complex ?? false);
  const [external, setExternal] = useState(type?.external ?? false);
  const [sized, setSized] = useState(type?.sized ?? false);
  const [sectorIds, setSectorIds] = useState<string[]>(type?.sector_ids ?? []);
  const [defaultSize, setDefaultSize] = useState(String(isEventSize(type?.default_size) ? type.default_size : DEFAULT_SIZE));
  const [rows, setRows] = useState<CrewDraft[]>(() =>
    (type ? crewOf(type, crew) : []).filter((c) => type?.sized || c.size === SINGLE_CREW_SIZE).map((c) => draftRow(c, isEventSize(c.size) ? c.size : SINGLE_CREW_SIZE)),
  );
  const [tried, setTried] = useState(false);
  const roleName = new Map(roles.map((r) => [r.id, r.name]));
  // Sem porte, só vale a equipe única (as linhas dos outros portes ficam guardadas até salvar, caso volte).
  const visible = sized ? rows : rows.filter((r) => r.size === SINGLE_CREW_SIZE);
  const picked = visible.filter((r) => r.jobRoleId);
  const items = picked.map((r) => ({ jobRoleId: r.jobRoleId, quantity: Number(r.quantity), ...(sized ? { size: r.size } : {}) }));
  const check = validateServiceType(
    { name, keywords: keywords.split(','), crew: noTeam ? [] : items, noTeam, sized },
    types.filter((t) => t.id !== id).map((t) => t.name),
  );
  const errors = tried ? check.errors : [];
  const repeated = EVENT_SIZES.some((s) => {
    const inSize = picked.filter((r) => r.size === s);
    return new Set(inSize.map((r) => r.jobRoleId)).size !== inSize.length;
  });

  function update(key: string, patch: Partial<CrewDraft>) {
    setRows((list) => list.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  // Ligar o porte começa Simples e Grande com a equipe de hoje, para ajustar a partir dela.
  function toggleSized(on: boolean) {
    setSized(on);
    if (!on) return;
    setRows((list) => {
      const single = list.filter((r) => r.size === SINGLE_CREW_SIZE);
      const copy = (size: EventSize) => (list.some((r) => r.size === size) ? [] : single.map((r) => ({ ...r, key: crypto.randomUUID(), size })));
      return [...list, ...copy(1), ...copy(3)];
    });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    if (!check.ok || repeated) return;
    const v = check.value;
    const crewPayload = v.crew.map((c) => ({ job_role_id: c.jobRoleId, quantity: c.quantity, ...(sized ? { size: c.size } : {}) }));
    const fields = {
      name: v.name,
      keywords: v.keywords,
      no_team: v.noTeam,
      icon: icon || null,
      complex,
      external: !v.noTeam && external,
      sized,
      default_size: Number(defaultSize),
      // Setores só valem para tipo sem equipe (reunião); com equipe, quem vê é quem está escalado.
      sector_ids: v.noTeam ? sectorIds : [],
      crew: crewPayload,
    };
    await engine.enqueue('service_type.upsert', { id, ...fields }, { target: { table: 'service_types', id, changes: { ...fields, code: type?.code ?? '' } } });
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
          hint='Separadas por vírgula. Um título com a palavra recebe este tipo com certeza alta. Com "^" ("^reuniao"), só vale quando o título começa com ela e vem antes das outras e do histórico; a mais longa ganha. Com asterisco ("*disponibilizar"), vale quando o título começa com "*" e a palavra, e ganha de todas.'
        />
        <IconPicker name={name} value={icon} onChange={setIcon} />
        <Checkbox label="Não exige equipe (não gera vagas; só os setores marcados abaixo veem na agenda)" checked={noTeam} onChange={setNoTeam} />
        {noTeam && (
          <fieldset className="check-group">
            <legend className="field-label">Setores que veem na agenda</legend>
            {sectors.filter((s) => !s.archived_at || sectorIds.includes(s.id)).map((s) => (
              <Checkbox
                key={s.id}
                label={s.name}
                checked={sectorIds.includes(s.id)}
                onChange={(on) => setSectorIds((list) => (on ? [...list, s.id] : list.filter((x) => x !== s.id)))}
              />
            ))}
            <span className="form-text">Reunião do setor: quem é do setor vê em Minha semana e no filtro da Equipe. Sem setor, só quem monta a escala vê.</span>
          </fieldset>
        )}
        {!noTeam && (
          <Checkbox
            label="Trabalho complexo (a escala sugerida chama primeiro quem é Referência na função)"
            checked={complex}
            onChange={setComplex}
          />
        )}

        {!noTeam && (
          <Checkbox
            label={`Externo (cobertura fora do estúdio: só a equipe de Piracicaba é sugerida)${simulated ? '. No app local, vale já, só neste navegador' : ''}`}
            checked={external}
            onChange={(on) => {
              setExternal(on);
              // Sem a 0022 no banco, a marca fica no navegador, valendo na sugestão da semana.
              if (simulated && type) setPreviewExternal(type.id, on);
            }}
          />
        )}

        {!noTeam && (
          <Checkbox
            label="Tem porte (Simples, Médio e Grande, com equipe diferente; quem monta a escala escolhe o porte de cada evento)"
            checked={sized}
            onChange={toggleSized}
          />
        )}

        {!noTeam && (
          <div className="form-stack">
            {(sized ? EVENT_SIZES : [SINGLE_CREW_SIZE]).map((s) => (
              <CrewRows
                key={s}
                label={sized ? `Equipe do porte ${SIZE_LABEL[s]}` : 'Equipe típica'}
                rows={visible.filter((r) => r.size === s)}
                roles={roles}
                onChange={update}
                onRemove={(key) => setRows((list) => list.filter((x) => x.key !== key))}
                onAdd={() => setRows((list) => [...list, { key: crypto.randomUUID(), jobRoleId: '', quantity: '1', size: s }])}
              />
            ))}
            {sized && (
              <Select
                label="Porte padrão"
                value={defaultSize}
                onChange={(e) => setDefaultSize(e.target.value)}
                options={EVENT_SIZES.map((s) => ({ value: String(s), label: SIZE_LABEL[s] }))}
                style={{ maxWidth: 220 }}
              />
            )}
            {sized && (
              <p className="form-text">
                O padrão vale para o evento sem porte escolhido e sem série no histórico. O porte Grande também chama primeiro quem é Referência na função.
              </p>
            )}
            {errors.includes('invalid_quantity') && (
              <span className="field-error" role="alert">
                A quantidade por função vai de {CREW_QUANTITY_MIN} a {CREW_QUANTITY_MAX}.
              </span>
            )}
            {(errors.includes('type_without_crew') || errors.includes('size_without_crew')) && (
              <span className="field-error" role="alert">
                {firstError(errors, ['type_without_crew', 'size_without_crew'])}
              </span>
            )}
            {tried && repeated && (
              <span className="field-error" role="alert">
                Cada função entra uma vez só em cada porte. Junte as quantidades na mesma linha.
              </span>
            )}
          </div>
        )}

        {type && suggested.length > 0 && !noTeam && (
          <div className="form-message">
            Equipe sugerida pelo histórico: {crewText(suggested, roleName)}.{' '}
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setRows((list) => [...list.filter((r) => r.size !== SINGLE_CREW_SIZE), ...suggested.map((c) => draftRow(c, SINGLE_CREW_SIZE))])}
            >
              {sized ? 'Adotar no porte Médio' : 'Adotar equipe sugerida'}
            </Button>
          </div>
        )}
        {type && <p className="form-text">Mudar a equipe vale para os eventos ainda sem escala; os já escalados mantêm as vagas e mostram "equipe típica mudou".</p>}

        {simulated && (
          <p className="form-message" role="note">
            Simulação do porte no app local: o banco ainda não tem a mudança, então aqui dá só para ver. Salvar volta a funcionar quando ela for publicada.
          </p>
        )}
        <div className="dialog-actions">
          {type && !type.archived_at && (
            <Button type="button" variant="ghost" onClick={() => void archive()} disabled={simulated}>
              Arquivar
            </Button>
          )}
          <span className="dialog-actions-spacer" />
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={simulated}>
            Salvar
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function ServiceTypesPage() {
  const { pendingRows } = useSyncState();
  const serverTypes = useTable<ServiceTypeRow>('service_types');
  const serverCrew = useTable<CrewRow>('service_type_crew');
  const serverRoles = [...(useTable<JobRoleRow>('job_roles') ?? [])].sort(byName);
  const sectors = [...(useTable<SectorRow>('sectors') ?? [])].sort(byName);
  // App local sem a 0017 e a 0018 no banco: mostra os tipos como ficariam (dev/sizePreview), só para ver.
  usePreviewExternal(); // a marca de externo guardada no navegador refaz a lista
  const preview = serverTypes && serverCrew ? previewCatalog(serverTypes, serverCrew, serverRoles, sectors) : undefined;
  const simulated = Boolean(serverTypes && previewActive(serverTypes));
  const types = preview?.types;
  const crew = preview?.crew;
  const roles = [...(preview?.roles ?? serverRoles)].sort(byName);
  const suggestions = useCatalogSuggestions(roles, types);
  const [open, setOpen] = useState<{ id?: string; name?: string } | null>(null);
  const list = [...(types ?? [])].sort((a, b) => Number(Boolean(a.archived_at)) - Number(Boolean(b.archived_at)) || byName(a, b));
  const roleName = new Map(roles.map((r) => [r.id, r.name]));
  const sectorName = new Map(sectors.map((s) => [s.id, s.name]));
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
          const team = typeCrewText(t, crew ?? [], roleName);
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
                    {t.external && !t.no_team ? 'externo, só Piracicaba · ' : ''}
                    {t.no_team
                      ? `não exige equipe${t.sector_ids?.length ? ` · veem: ${t.sector_ids.map((id) => sectorName.get(id) ?? 'Setor').join(', ')}` : ''}`
                      : items.length
                        ? team
                        : 'sem equipe típica'}
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
          sectors={sectors}
          simulated={simulated}
          suggested={editing ? suggestCrew(facts, editing.id).map((c) => ({ job_role_id: c.jobRoleId, quantity: c.quantity })) : []}
          onClose={() => setOpen(null)}
        />
      )}
    </section>
  );
}
