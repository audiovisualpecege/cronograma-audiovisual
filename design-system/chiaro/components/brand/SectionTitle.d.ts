/**
 * Signature two-weight title: Altivo Light + Altivo Black, uppercase ("ESTÚDIO MIRANTE").
 * @startingPoint section="Brand" subtitle="Título Light + Black do mídia kit" viewport="700x220"
 */
export interface SectionTitleProps { light?: string; bold?: string; eyebrow?: string; size?: number; color?: string; align?: 'left'|'center'|'right'; as?: 'h1'|'h2'|'h3'; style?: React.CSSProperties; }
export declare function SectionTitle(props: SectionTitleProps): JSX.Element;