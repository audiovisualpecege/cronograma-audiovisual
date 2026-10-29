// Horário de trabalho da pessoa: entrada e saída em cada dia da semana; dia vazio é dia de não trabalhar. Fora do
// horário a pessoa ainda pode ser sugerida, por último e com o aviso (pedido do Raoni em 27/10/2026).
import type { PersonRow } from '../../data/catalog';

/** Dias ISO ('1' segunda a '7' domingo) com o rótulo curto. */
export const WEEK_DAYS: readonly [string, string][] = [
  ['1', 'Seg'],
  ['2', 'Ter'],
  ['3', 'Qua'],
  ['4', 'Qui'],
  ['5', 'Sex'],
  ['6', 'Sáb'],
  ['7', 'Dom'],
];

export type HoursDraft = Record<string, [string, string]>;

export function hoursDraft(hours: PersonRow['work_hours']): HoursDraft {
  return Object.fromEntries(WEEK_DAYS.map(([d]) => [d, hours?.[d] ? [...hours[d]] : ['', '']])) as HoursDraft;
}

/** O horário para gravar: só os dias preenchidos; nenhum dia preenchido é "sem horário" (nulo). */
export function hoursValue(draft: HoursDraft): PersonRow['work_hours'] {
  const days = Object.entries(draft).filter(([, [from, to]]) => from && to);
  return days.length > 0 ? (Object.fromEntries(days) as Record<string, [string, string]>) : null;
}

/** Dias com só a entrada ou só a saída, ou com a saída antes da entrada. */
export function hoursErrors(draft: HoursDraft): string[] {
  return WEEK_DAYS.filter(([d]) => {
    const [from, to] = draft[d] ?? ['', ''];
    return Boolean(from) !== Boolean(to) || (from && to && from >= to);
  }).map(([, label]) => label);
}

export function WorkHoursField({ value, onChange }: { value: HoursDraft; onChange: (v: HoursDraft) => void }) {
  const errors = hoursErrors(value);
  const set = (day: string, i: 0 | 1, time: string) => {
    const [from, to] = value[day] ?? ['', ''];
    onChange({ ...value, [day]: i === 0 ? [time, to] : [from, time] });
  };
  const monday = value['1'] ?? ['', ''];
  return (
    <fieldset className="check-group">
      <legend className="field-label">Horário de trabalho</legend>
      <p className="form-text">
        Entrada e saída em cada dia; dia vazio é dia de folga. Sem nenhum dia, o horário não pesa. Fora do horário a pessoa ainda pode ser
        sugerida, por último e com o aviso.
      </p>
      <div className="work-hours">
        {WEEK_DAYS.map(([d, label]) => {
          const [from, to] = value[d] ?? ['', ''];
          return (
            <div key={d} className="work-hours-day" role="group" aria-label={`Horário de ${label}`}>
              <span className="work-hours-label">{label}</span>
              <input type="time" className="work-hours-input" aria-label={`Entrada de ${label}`} value={from} onChange={(e) => set(d, 0, e.target.value)} />
              <input type="time" className="work-hours-input" aria-label={`Saída de ${label}`} value={to} onChange={(e) => set(d, 1, e.target.value)} />
            </div>
          );
        })}
      </div>
      <button
        type="button"
        className="text-button"
        disabled={!monday[0] || !monday[1]}
        onClick={() => onChange({ ...value, ...Object.fromEntries(['2', '3', '4', '5'].map((d) => [d, [...monday]])) })}
      >
        Repetir a segunda de terça a sexta
      </button>
      {errors.length > 0 && (
        <span className="field-error" role="alert">
          Confira {errors.join(', ')}: preencha entrada e saída, com a saída depois da entrada.
        </span>
      )}
    </fieldset>
  );
}
