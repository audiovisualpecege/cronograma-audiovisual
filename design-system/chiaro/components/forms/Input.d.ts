/** Text field (or textarea via multiline) with uppercase label. */
export interface InputProps { label?: string; hint?: string; error?: string; multiline?: boolean; rows?: number; placeholder?: string; value?: string; defaultValue?: string; type?: string; disabled?: boolean; onChange?: (e:any)=>void; style?: React.CSSProperties; }
export declare function Input(props: InputProps): JSX.Element;