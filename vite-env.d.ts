/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BUILD_SHA: string;
  readonly VITE_DEPLOYMENT_ID: string;
  readonly VITE_VERCEL_ENV: string;
}

declare const __APP_VERSION__: string;
