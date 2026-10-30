/**
 * Ruta protegida: exige sesión activa.
 *
 * Mientras se resuelve la sesión inicial muestra un estado de carga (evita
 * redirigir a /login un instante antes de detectar la sesión guardada).
 * Sin sesión → redirige a /login guardando la ruta original de origen.
 */

import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { useAuth } from '../context/AuthContext.js';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex min-h-[50vh] items-center justify-center px-4"
      >
        <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-surface px-5 py-4 text-sm text-muted">
          <span
            className="h-4 w-4 animate-spin rounded-full border-2 border-secondary border-t-transparent"
            aria-hidden="true"
          />
          Cargando sesión…
        </div>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}
