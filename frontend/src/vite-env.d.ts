/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL base opcional de la API REST (por defecto http://localhost:3001/api). */
  readonly VITE_API_URL?: string;

  /** URL del proyecto Supabase (usada solo por Supabase Auth). */
  readonly VITE_SUPABASE_URL?: string;

  /** Clave pública publishable de Supabase (segura en el navegador). */
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
