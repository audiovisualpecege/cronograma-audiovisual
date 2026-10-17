/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** Chave pública VAPID das notificações no celular (a privada fica só no NAS). */
  readonly VITE_VAPID_PUBLIC_KEY?: string;
}
