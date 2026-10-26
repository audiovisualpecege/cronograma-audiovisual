// Textos dos códigos de validação do core (os mesmos que as funções SQL levantam): dizem o que fazer.
import type { ValidationCode } from '@cronograma/core';

export const VALIDATION_MESSAGES: Record<ValidationCode, string> = {
  name_required: 'Informe o nome.',
  name_taken: 'Já existe um cadastro com este nome. Use outro nome.',
  email_invalid: 'E-mail inválido',
  invalid_limit: 'O limite semanal vai de 1 a 80 horas.',
  roles_required: 'Escolha ao menos uma função.',
  invalid_quantity: 'A quantidade por função vai de 1 a 30.',
  type_without_crew: 'Escolha ao menos uma função ou marque "não exige equipe".',
  size_without_crew: 'Cada porte (Simples, Médio e Grande) precisa de ao menos uma função.',
  end_before_start: 'O fim precisa ser depois do início.',
  notes_too_long: 'A observação vai até 2.000 caracteres.',
};

export const EMAIL_TAKEN = 'Já existe uma pessoa com este e-mail';

export function firstError<T extends ValidationCode>(errors: readonly ValidationCode[], codes: readonly T[]): string | undefined {
  const code = errors.find((e): e is T => (codes as readonly ValidationCode[]).includes(e));
  return code ? VALIDATION_MESSAGES[code] : undefined;
}

export const ABSENCE_KIND_LABEL = { folga: 'folga', ferias: 'férias', ausencia: 'ausência' } as const;
