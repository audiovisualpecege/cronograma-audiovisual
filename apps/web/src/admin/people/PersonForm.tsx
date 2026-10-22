import { DEFAULT_WEEKLY_LIMIT, normalizeName, validatePerson, WEEKLY_LIMIT_MAX, WEEKLY_LIMIT_MIN } from '@cronograma/core';
import { useState, type FormEvent } from 'react';
import { AltArrowDownIcon, AltArrowUpIcon } from '@solar-icons/react/linear';
import { byName, LEVEL_LABEL, levelsOf, rolesOf, type JobRoleRow, type PersonRoleRow, type PersonRow, type SectorRow } from '../../data/catalog';
import { IconButton } from '../../ui/IconButton';
import { EMAIL_TAKEN, firstError } from '../../data/messages';
import { useSyncEngine, useSyncState } from '../../sync/SyncProvider';
import { OnlineButton } from '../../sync/OnlineButton';
import { Button, Checkbox, Input } from '../../ui/chiaro';
import { Dialog } from '../../ui/Dialog';
import { Select } from '../../ui/Select';
import { DeactivateDialog } from './DeactivateDialog';
import { inviteLabel } from './PeoplePage';

interface Props {
  person?: PersonRow;
  people: readonly PersonRow[];
  personRoles: readonly PersonRoleRow[];
  sectors: readonly SectorRow[];
  roles: readonly JobRoleRow[];
  onClose: () => void;
}

export function PersonForm({ person, people, personRoles, sectors, roles, onClose }: Props) {
  const engine = useSyncEngine();
  const { pendingRows } = useSyncState();
  // O id nasce com o formulário: clique duplo em salvar grava a mesma pessoa (US-002 EC-9).
  const [id] = useState(() => person?.id ?? crypto.randomUUID());
  const [name, setName] = useState(person?.name ?? '');
  const [email, setEmail] = useState(person?.email ?? '');
  const [sectorId, setSectorId] = useState(person?.sector_id ?? '');
  const [profile, setProfile] = useState<'admin' | 'team'>(person?.profile ?? 'team');
  const [limit, setLimit] = useState(person ? String(person.weekly_limit_hours) : '');
  const [roleIds, setRoleIds] = useState<string[]>(() => (person ? rolesOf(person, personRoles) : []));
  const [levels, setLevels] = useState<Record<string, number>>(() => (person ? levelsOf(person, personRoles) : {}));
  const roleName = (id: string) => roles.find((r) => r.id === id)?.name ?? 'Função';
  function move(i: number, by: -1 | 1) {
    setRoleIds((ids) => {
      const next = [...ids];
      const [it] = next.splice(i, 1);
      next.splice(i + by, 0, it as string);
      return next;
    });
  }
  const [tried, setTried] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const check = validatePerson({ name, email, weeklyLimitHours: limit, roleIds });
  const taken = people.find((p) => p.id !== id && p.email && normalizeName(p.email) === normalizeName(email.trim()));
  const errors = tried ? check.errors : [];
  const selectableRoles = [...roles].filter((r) => !r.archived_at || roleIds.includes(r.id)).sort(byName);
  const synced = person && !pendingRows.has(`people:${person.id}`);
  const invite = person ? inviteLabel(person) : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    if (!check.ok || taken) return;
    const v = check.value;
    const fields = {
      name: v.name,
      email: v.email,
      sector_id: sectorId || null,
      profile,
      weekly_limit_hours: v.weeklyLimitHours,
    };
    // A ordem de role_ids é a prioridade; o nível vai junto, por função.
    const roleLevels = Object.fromEntries(v.roleIds.map((r) => [r, levels[r] ?? 2]));
    await engine.enqueue(
      'person.upsert',
      { id, ...fields, role_ids: v.roleIds, role_levels: roleLevels },
      {
        target: {
          table: 'people',
          id,
          changes: {
            ...fields,
            role_ids: v.roleIds,
            role_levels: roleLevels,
            active: person?.active ?? true,
            invite_status: person?.invite_status ?? 'pending',
            code: person?.code ?? '',
          },
        },
      },
    );
    onClose();
  }

  async function resendInvite() {
    if (!person) return;
    setNotice(null);
    try {
      await engine.runOnline((remote) => remote.rpc('request_job', { kind: 'invite', payload: { person_id: person.id } }));
      setNotice(`Convite reenviado para ${person.email}. Peça para conferir também a caixa de spam.`);
    } catch {
      setNotice('Não foi possível reenviar o convite agora. Tente de novo em instantes.');
    }
  }

  async function reactivate() {
    if (!person) return;
    await engine.enqueue('person.reactivate', { id: person.id }, { target: { table: 'people', id: person.id, changes: { active: true } } });
    onClose();
  }

  return (
    <Dialog open onClose={onClose} title={person ? person.name : 'Nova pessoa'} width={620}>
      <form className="form-stack" onSubmit={submit} noValidate aria-label={person ? `Cadastro de ${person.name}` : 'Cadastro de pessoa'}>
        <Input label="Nome" value={name} onChange={(e) => setName(e.target.value)} error={firstError(errors, ['name_required'])} />
        <div>
          <Input
            label="E-mail"
            type="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={taken ? `${EMAIL_TAKEN}.` : firstError(errors, ['email_invalid'])}
          />
          {taken && (
            <a className="text-link field-link" href={`#/admin/pessoas?id=${taken.id}`}>
              Abrir o cadastro de {taken.name}
            </a>
          )}
        </div>
        <div className="form-grid">
          <Select
            label="Setor"
            value={sectorId}
            onChange={(e) => setSectorId(e.target.value)}
            placeholder="Sem setor"
            options={[...sectors].filter((s) => !s.archived_at || s.id === sectorId).sort(byName).map((s) => ({ value: s.id, label: s.name }))}
          />
          <Select
            label="Perfil"
            value={profile}
            onChange={(e) => setProfile(e.target.value as 'admin' | 'team')}
            options={[
              { value: 'team', label: 'Equipe' },
              { value: 'admin', label: 'Administrador' },
            ]}
          />
        </div>
        <Input
          label="Limite semanal de horas"
          inputMode="decimal"
          placeholder={String(DEFAULT_WEEKLY_LIMIT)}
          value={limit}
          onChange={(e) => setLimit(e.target.value)}
          hint={`De ${WEEKLY_LIMIT_MIN} a ${WEEKLY_LIMIT_MAX} horas. Vazio vale ${DEFAULT_WEEKLY_LIMIT}.`}
          error={firstError(errors, ['invalid_limit'])}
        />
        <fieldset className="check-group" aria-invalid={errors.includes('roles_required') || undefined}>
          <legend className="field-label">Funções</legend>
          {selectableRoles.length === 0 && <p className="form-text">Cadastre as funções antes, em Funções.</p>}
          {selectableRoles.map((r) => (
            <Checkbox
              key={r.id}
              label={r.name}
              checked={roleIds.includes(r.id)}
              onChange={(on) => setRoleIds((ids) => (on ? [...ids, r.id] : ids.filter((x) => x !== r.id)))}
            />
          ))}
          {errors.includes('roles_required') && (
            <span className="field-error" role="alert">
              {firstError(errors, ['roles_required'])}
            </span>
          )}
        </fieldset>
        {roleIds.length > 0 && (
          <fieldset className="check-group">
            <legend className="field-label">Prioridade e nível</legend>
            <p className="form-text">
              A 1ª é a função principal. Na escala sugerida, a ordem desempata entre pessoas com o mesmo histórico, e a Referência é chamada
              primeiro nos trabalhos complexos (e fica por último nos simples).
            </p>
            <ol className="role-order" aria-label="Funções em ordem de prioridade">
              {roleIds.map((rid, i) => {
                const name = roleName(rid);
                return (
                  <li key={rid} className="role-order-item">
                    <span className="role-order-pos">{i + 1}</span>
                    <span className="role-order-name">{name}</span>
                    <Select
                      label="Nível"
                      aria-label={`Nível em ${name}`}
                      value={String(levels[rid] ?? 2)}
                      onChange={(e) => setLevels((l) => ({ ...l, [rid]: Number(e.target.value) }))}
                      options={[1, 2, 3].map((n) => ({ value: String(n), label: LEVEL_LABEL[n] as string }))}
                      style={{ minWidth: 150 }}
                    />
                    <span className="role-order-actions">
                      <IconButton icon={AltArrowUpIcon} label={`Subir ${name}`} size={36} disabled={i === 0} onClick={() => move(i, -1)} />
                      <IconButton icon={AltArrowDownIcon} label={`Descer ${name}`} size={36} disabled={i === roleIds.length - 1} onClick={() => move(i, 1)} />
                    </span>
                  </li>
                );
              })}
            </ol>
          </fieldset>
        )}

        {person && (
          <div className="person-status">
            {invite && <p className="form-text">{invite === 'convite pendente' ? 'Convite pendente: sai quando o cadastro chegar ao servidor.' : 'Convite enviado. A pessoa ainda não criou a senha.'}</p>}
            {invite && synced && (
              <OnlineButton type="button" variant="secondary" onClick={() => void resendInvite()}>
                Reenviar convite
              </OnlineButton>
            )}
            {notice && (
              <p className="form-message" role="status">
                {notice}
              </p>
            )}
          </div>
        )}

        <div className="dialog-actions">
          {person?.active && (
            <Button type="button" variant="ghost" onClick={() => setDeactivating(true)}>
              Desativar
            </Button>
          )}
          {person && !person.active && (
            <Button type="button" variant="ghost" onClick={() => void reactivate()} disabled={!person.email}>
              Reativar
            </Button>
          )}
          <span className="dialog-actions-spacer" />
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit">Salvar</Button>
        </div>
        {person && !person.active && !person.email && <p className="form-text">Informe o e-mail e salve antes de reativar.</p>}
      </form>
      {deactivating && person && (
        <DeactivateDialog
          person={person}
          onCancel={() => setDeactivating(false)}
          onDone={() => {
            setDeactivating(false);
            onClose();
          }}
        />
      )}
    </Dialog>
  );
}
