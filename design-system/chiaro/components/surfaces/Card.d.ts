/** Rounded (18px) container. */
export interface CardProps { variant?: 'default'|'raised'|'noite'|'warm'|'brand'; padding?: number|string; interactive?: boolean; onClick?: () => void; children?: React.ReactNode; style?: React.CSSProperties; }
export declare function Card(props: CardProps): JSX.Element;