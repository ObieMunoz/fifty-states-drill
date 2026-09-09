/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

/** The short commit the site was built from, or `dev`. Set in vite.config.ts. */
declare const __BUILD__: string;

interface ImportMetaEnv {
  /** Where TURN credentials are minted; see src/versus/turn.ts and worker/. */
  readonly VITE_TURN_URL?: string;
}
