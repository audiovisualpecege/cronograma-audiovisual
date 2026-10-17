import { useId, type ComponentProps } from 'react';
import { Button } from '../ui/chiaro';
import { useOnline } from './useOnline';

export const NEEDS_INTERNET = 'Precisa de internet';

/**
 * Botão de ação que não entra na fila (publicar, descartar, propor, reler, importar, reenviar convite):
 * sem conexão fica desabilitado e diz "Precisa de internet" (ADR-009, US-026 EC-1).
 */
export function OnlineButton({ disabled, ...props }: ComponentProps<typeof Button>) {
  const online = useOnline();
  const hintId = useId();
  return (
    <span className="online-action">
      <Button {...props} disabled={disabled || !online} aria-describedby={online ? undefined : hintId} />
      {!online && (
        <small id={hintId} className="online-action-hint">
          {NEEDS_INTERNET}
        </small>
      )}
    </span>
  );
}
