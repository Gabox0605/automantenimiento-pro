/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL base opcional de la API REST (por defecto http://localhost:3001/api). */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
