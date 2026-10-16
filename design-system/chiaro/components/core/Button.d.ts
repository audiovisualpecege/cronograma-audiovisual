/**
 * Pill-shaped call to action, uppercase Altivo Bold.
 * @startingPoint section="Core" subtitle="Botões pill — primário, secundário, ghost, claro, gradiente" viewport="700x260"
 */
export interface ButtonProps { variant?: 'primary'|'secondary'|'ghost'|'light'|'gradient'; size?: 'sm'|'md'|'lg'; /** Solar icon name (linear weight) */ iconLeft?: string; iconRight?: string; disabled?: boolean; fullWidth?: boolean; type?: 'button'|'submit'; onClick?: (e: any) => void; children?: React.ReactNode; style?: React.CSSProperties; }
export declare function Button(props: ButtonProps): JSX.Element;