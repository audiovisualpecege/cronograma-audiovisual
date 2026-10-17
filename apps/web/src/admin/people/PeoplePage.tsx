import { normalizeName } from '@cronograma/core';
import { UserPlusIcon } from '@solar-icons/react/linear';
import { useMemo, useState } from 'react';
import { byName, rolesOf, useTable, type JobRoleRow, type PersonRoleRow, type PersonRow, type SectorRow } from '../../data/catalog';
import { PageTitle } from '../../layout/PageTitle';
import { navigate, useHash } from '../../router';
import { useSyncState } from '../../sync/SyncProvider';
import { AppIcon } from '../../ui/AppIcon';
import { Button, Input, Tag } from '../../ui/chiaro';
import { Select } from '../../ui/Select';
import { VirtualList } from '../../ui/VirtualList';
import { PersonForm } from './PersonForm';

const ROW_HEIGHT = 76;
const LIST_HEIGHT = 560;

export function inviteLabel(p: PersonRow): string | null {
  if (!p.active || p.invite_status === 'accepted') return null;
  return p.invite_status === 'sent' ? 'convite enviado' : 'convite pendente';
}

export function PeoplePage() {
  const people = useTable<PersonRow>('people');
  const loadedRoles = useTable<PersonRoleRow>('person_roles');
  const personRoles = useMemo(() => loadedRoles ?? [], [loadedRoles]);
  const loadedSectors = useTable<SectorRow>('sectors');
  const loadedJobRoles = useTable<JobRoleRow>('job_roles');
  const sectors = useMemo(() => loadedSectors ?? [], [loadedSectors]);
  const roles = useMemo(() => loadedJobRoles ?? [], [loadedJobRoles]);
  const { pendingRows } = useSyncState();
  const { query } = useHash();
  const openId = query.get('id');
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState('');
  const [sectorFilter, setSectorFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');

  const sectorName = useMemo(() => new Map(sectors.map((s) => [s.id, s.name])), [sectors]);
  const roleName = useMemo(() => new Map(roles.map((r) => [r.id, r.name])), [roles]);

  const filtered = useMemo(() => {
    const q = normalizeName(search);
    return [...(people ?? [])]
      .filter((p) => !q || normalizeName(p.name).includes(q) || normalizeName(p.email ?? '').includes(q))
      .filter((p) => !sectorFilter || p.sector_id === sectorFilter)
      .filter((p) => !roleFilter || rolesOf(p, personRoles).includes(roleFilter))
      .sort((a, b) => Number(b.active) - Number(a.active) || byName(a, b));
  }, [people, personRoles, search, sectorFilter, roleFilter]);

  const editing = openId ? (people ?? []).find((p) => p.id === openId) : undefined;
  // O link "Abrir o cadastro de..." troca o formulário novo pelo cadastro existente.
  const showNew = creating && !openId;
  const closeForm = () => {
    setCreating(false);
    if (openId) navigate('/admin/pessoas', { replace: true });
  };

  return (
    <section className="page">
      <div className="page-head">
        <PageTitle black="PESSOAS" />
        <Button onClick={() => setCreating(true)}>
          <AppIcon icon={UserPlusIcon} size={18} /> Nova pessoa
        </Button>
      </div>

      <div className="filter-bar" role="search">
        <Input label="Buscar" placeholder="Nome ou e-mail" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Select
          label="Setor"
          value={sectorFilter}
          onChange={(e) => setSectorFilter(e.target.value)}
          placeholder="Todos os setores"
          options={[...sectors].sort(byName).map((s) => ({ value: s.id, label: s.name }))}
        />
        <Select
          label="Função"
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          placeholder="Todas as funções"
          options={[...roles].filter((r) => !r.archived_at).sort(byName).map((r) => ({ value: r.id, label: r.name }))}
        />
      </div>

      <p className="list-count">
        {people === undefined ? 'Abrindo a cópia local' : `${filtered.length} de ${people.length} pessoas`}
      </p>

      <VirtualList
        label="Pessoas"
        items={filtered}
        rowHeight={ROW_HEIGHT}
        height={LIST_HEIGHT}
        getKey={(p) => p.id}
        empty={people && <p className="form-text">Nenhuma pessoa com esses filtros.</p>}
        renderRow={(p) => {
          const invite = inviteLabel(p);
          const names = rolesOf(p, personRoles).map((id) => roleName.get(id) ?? '').filter(Boolean);
          return (
            <button type="button" className="list-row" onClick={() => navigate(`/admin/pessoas?id=${p.id}`)} aria-label={`Abrir ${p.name}`}>
              <span className="list-row-main">
                <span className="list-row-title">
                  {p.name}
                  {p.code && <span className="list-row-code">{p.code}</span>}
                </span>
                <span className="list-row-sub">
                  {[p.sector_id ? sectorName.get(p.sector_id) : null, names.join(', ') || 'sem função'].filter(Boolean).join(' · ')}
                </span>
              </span>
              <span className="list-row-tags">
                {p.profile === 'admin' && <Tag>administrador</Tag>}
                {!p.active && <Tag>inativa</Tag>}
                {invite && <Tag>{invite}</Tag>}
                {pendingRows.has(`people:${p.id}`) && <Tag>a enviar</Tag>}
              </span>
            </button>
          );
        }}
      />

      {(showNew || editing) && people && loadedRoles && (
        <PersonForm
          key={editing?.id ?? 'nova'}
          person={editing}
          people={people}
          personRoles={personRoles}
          sectors={sectors}
          roles={roles}
          onClose={closeForm}
        />
      )}
    </section>
  );
}
