/** Modal dialog over a Noite scrim with blur. */
export interface DialogProps { open: boolean; onClose?: () => void; title?: string; children?: React.ReactNode; footer?: React.ReactNode; width?: number; }
export declare function Dialog(props: DialogProps): JSX.Element | null;