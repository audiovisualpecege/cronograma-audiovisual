/** Native select styled as the brand field. */
export interface SelectProps { label?: string; options: (string | { value: string; label: string })[]; value?: string; placeholder?: string; disabled?: boolean; onChange?: (e:any)=>void; style?: React.CSSProperties; }
export declare function Select(props: SelectProps): JSX.Element;