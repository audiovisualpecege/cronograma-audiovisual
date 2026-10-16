/** Tab switcher — underline (Light→Black weight shift) or pill. */
export interface TabsProps { items: (string | { value: string; label: string })[]; value?: string; onChange?: (value: string) => void; variant?: 'underline'|'pill'; style?: React.CSSProperties; }
export declare function Tabs(props: TabsProps): JSX.Element;