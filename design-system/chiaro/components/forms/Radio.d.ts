/** Radio button. */
export interface RadioProps { checked?: boolean; onChange?: (checked: boolean) => void; label?: React.ReactNode; disabled?: boolean; name?: string; value?: string; }
export declare function Radio(props: RadioProps): JSX.Element;