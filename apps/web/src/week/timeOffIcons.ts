// Rótulo e ícone de cada tipo de folga.
import { ClockCircleIcon, SuitcaseIcon, SunIcon } from '@solar-icons/react/bold-duotone';

export const TIME_OFF = {
  ferias: { label: 'Férias', icon: SuitcaseIcon },
  folga: { label: 'Folga', icon: SunIcon },
  ausencia: { label: 'Ausência', icon: ClockCircleIcon },
} as const;
