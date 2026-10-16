// Versão do produto, lida do package.json da raiz no build (`__APP_VERSION__`), nunca digitada à mão.
export function AppVersion({ className }: { className?: string }) {
  return <small className={className ? `app-version ${className}` : 'app-version'}>v{__APP_VERSION__}</small>;
}
