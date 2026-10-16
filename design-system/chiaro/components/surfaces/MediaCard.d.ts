/**
 * Photo / video tile with protection gradient, optional play affordance.
 * @startingPoint section="Surfaces" subtitle="Card de foto/vídeo com play e legenda" viewport="700x320"
 */
export interface MediaCardProps { image: string; title?: string; eyebrow?: string; meta?: string; playable?: boolean; /** CSS aspect-ratio, default "16 / 10" */ ratio?: string; onClick?: () => void; style?: React.CSSProperties; }
export declare function MediaCard(props: MediaCardProps): JSX.Element;