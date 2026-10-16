/** Checkbox with 6px-rounded box. */
export interface CheckboxProps { checked?: boolean; onChange?: (checked: boolean) => void; label?: React.ReactNode; disabled?: boolean; name?: string; value?: string; }
export declare function Checkbox(props: CheckboxProps): JSX.Element;