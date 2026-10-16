/** Small uppercase status label. */
export interface BadgeProps { tone?: 'brand'|'soft'|'warm'|'dark'|'live'|'success'; children?: React.ReactNode; style?: React.CSSProperties; }
export declare function Badge(props: BadgeProps): JSX.Element;