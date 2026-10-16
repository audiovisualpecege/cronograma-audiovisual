/** Stacked repeating title ("QUEM SOMOS" ×5) — the media-kit echo motif. */
export interface EchoTitleProps { text: string; repeat?: number; size?: number; color?: string; align?: 'left'|'center'; style?: React.CSSProperties; }
export declare function EchoTitle(props: EchoTitleProps): JSX.Element;