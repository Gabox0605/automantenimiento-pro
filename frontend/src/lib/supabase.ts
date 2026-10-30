/**
 * Cliente Supabase para el frontend.
 * ----------------------------------------------------------------------------
 * Se usa EXCLUSIVAMENTE para Supabase Auth (registro, inicio y cierre de
 * sesión, y gestión de la sesión persistente). Los datos de la aplicación
 * (vehículos, odómetro, mantenimientos) viajan por la API REST propia
 * (services/api.ts), nunca por el Data API de Supabase.
 *
 * Variables requeridas (públicas por diseño, se incrustan en el bundle):
 *   VITE_SUPABASE_URL       ej. https://klrihexxoguhhxshfrwd.supabase.co
 *   VITE_SUPABASE_ANON_KEY  clave publishable (sb_publishable_...)
 *
 * Nunca colocar aquí una clave `sb_secret_...` ni service_role.
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Faltan VITE_SUPABASE_URL y/o VITE_SUPABASE_ANON_KEY. ' +
      'Configúralas en Vercel → Settings → Environment Variables y vuelve a desplegar.',
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
