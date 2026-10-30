/**
 * Contexto de autenticación (Supabase Auth).
 * ----------------------------------------------------------------------------
 * Expone la sesión activa y las operaciones de login/registro/cierre. La
 * sesión persiste en localStorage (gestión interna de supabase-js) y se
 * refresca automáticamente.
 *
 * El access token de esta sesión es lo que services/api.ts adjunta como
 * `Authorization: Bearer` en cada llamada a nuestra API.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';

import { supabase } from '../lib/supabase.js';

// ============================================================================
// Traducción de errores de Supabase Auth a mensajes amigables
// ============================================================================

function friendlyAuthError(raw: string): string {
  const message = raw.toLowerCase();

  if (message.includes('invalid login credentials')) {
    return 'Email o contraseña incorrectos.';
  }
  if (message.includes('email not confirmed')) {
    return 'Debes confirmar tu email antes de iniciar sesión. Revisa tu bandeja de entrada.';
  }
  if (message.includes('already registered') || message.includes('already been registered')) {
    return 'Ya existe una cuenta con ese email. Inicia sesión en su lugar.';
  }
  if (message.includes('password should be at least')) {
    return 'La contraseña debe tener al menos 6 caracteres.';
  }
  if (message.includes('rate limit') || message.includes('rate_limit')) {
    return 'Demasiados intentos. Espera un minuto y vuelve a intentarlo.';
  }
  if (message.includes('signups not allowed') || message.includes('disabled')) {
    return 'El registro no está habilitado en este proyecto.';
  }

  return raw;
}

// ============================================================================
// Contexto
// ============================================================================

interface AuthContextValue {
  /** Sesión activa de Supabase (null si no hay sesión). */
  session: Session | null;
  /** Usuario autenticado (atajo de session.user). */
  user: User | null;
  /**
   * true mientras se resuelve la sesión inicial. Se usa para no parpadear la
   * redirección a /login antes de saber si hay sesión guardada.
   */
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  /** Devuelve needsConfirmation=true si Supabase exige confirmar el email. */
  signUp: (email: string, password: string) => Promise<{ needsConfirmation: boolean }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    // Sesión guardada (puede venir de localStorage).
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
    });

    // Refleja login, logout, refresh de token y expiración.
    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        if (!active) return;
        setSession(nextSession);
        setLoading(false);
      },
    );

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      throw new Error(friendlyAuthError(error.message));
    }
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({ email, password });

    if (error) {
      throw new Error(friendlyAuthError(error.message));
    }

    return { needsConfirmation: data.session === null };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      signIn,
      signUp,
      signOut,
    }),
    [session, loading, signIn, signUp, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Hook de acceso al contexto. Fuera de AuthProvider lanza un error claro. */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (context === undefined) {
    throw new Error('useAuth() debe usarse dentro de <AuthProvider>.');
  }

  return context;
}
