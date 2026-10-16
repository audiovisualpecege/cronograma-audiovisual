import type { Icon } from '@solar-icons/react/lib/types';

// Ícones do Solar vindos do pacote `@solar-icons/react`, para funcionar sem internet.
// Use só os pesos do design system: `@solar-icons/react/linear`, `/bold` e `/bold-duotone`.
interface AppIconProps {
  icon: Icon;
  size?: number | string;
  /** Texto para leitores de tela; sem ele o ícone é decorativo. */
  label?: string;
  className?: string;
}

export function AppIcon({ icon: SolarIcon, size = 20, label, className }: AppIconProps) {
  return label ? (
    <SolarIcon size={size} alt={label} role="img" aria-label={label} className={className} />
  ) : (
    <SolarIcon size={size} aria-hidden="true" focusable="false" className={className} />
  );
}
