import { DEFAULT_WEEKLY_LIMIT, normalizeName, validatePerson, WEEKLY_LIMIT_MAX, WEEKLY_LIMIT_MIN } from '@cronograma/core';
import { useState, type FormEvent } from 'react';
import { byName, rolesOf, type JobRoleRow, type PersonRoleRow, type PersonRow, type SectorRow } from '../../data/catalog';
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
    await engine.enqueue(
      'person.upsert',
      { id, ...fields, role_ids: v.roleIds },
      {
        target: {
          table: 'people',
          id,
          changes: {
            ...fields,
            role_ids: v.roleIds,
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
