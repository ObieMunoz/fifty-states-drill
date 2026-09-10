/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

/** The short commit the site was built from, or `dev`. Set in vite.config.ts. */
declare const __BUILD__: string;

interface ImportMetaEnv {
  /** The Supabase project the phones listen to; see src/versus/supabase.ts. */
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}
