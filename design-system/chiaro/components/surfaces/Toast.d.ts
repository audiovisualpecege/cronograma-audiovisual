/** Dark notification pill-card. */
export interface ToastProps { tone?: 'default'|'success'|'danger'; title?: string; message?: string; onClose?: () => void; style?: React.CSSProperties; }
export declare function Toast(props: ToastProps): JSX.Element;