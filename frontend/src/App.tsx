/**
 * Raíz de la aplicación: contexto de autenticación + enrutamiento.
 *
 * Rutas:
 *   /                   → landing PÚBLICA (o salto a /vehiculos si hay sesión)
 *   /login              → iniciar sesión (pública)
 *   /registro           → crear cuenta  (pública)
 *   /vehiculos          → listado y alta de vehículos (protegida)
 *   /vehiculos/:id      → panel del vehículo (protegida)
 *
 * Todas las rutas bajo <ProtectedRoute> exigen sesión; sin ella se redirige
 * a /login conservando la ruta original de origen. La raíz muestra la landing
 * al visitante no autenticado para que conozca la app antes de registrarse.
 */

import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { AppShell } from './components/AppShell.js';
import { ProtectedRoute } from './components/ProtectedRoute.js';
import { AuthProvider, useAuth } from './context/AuthContext.js';
import { LandingPage } from './pages/LandingPage.js';
import { LoginPage } from './pages/LoginPage.js';
import { RegisterPage } from './pages/RegisterPage.js';
import { VehicleDashboardPage } from './pages/VehicleDashboardPage.js';
import { VehiclesPage } from './pages/VehiclesPage.js';

/**
 * Raíz `/`:
 *  - resolviendo la sesión → breve indicador de carga (evita parpadear);
 *  - con sesión → redirige al listado de vehículos;
 *  - sin sesión → landing pública con la vista previa del panel.
 */
function HomeRoute() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex min-h-screen items-center justify-center bg-background"
      >
        <div className="flex items-center gap-3 rounded-xl border border-line bg-surface px-5 py-4 text-sm text-muted">
          <span
            className="h-4 w-4 animate-spin rounded-full border-2 border-secondary border-t-transparent"
            aria-hidden="true"
          />
          Cargando…
        </div>
      </div>
    );
  }

  if (session) {
    return <Navigate to="/vehiculos" replace />;
  }

  return <LandingPage />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Públicas */}
          <Route path="/" element={<HomeRoute />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/registro" element={<RegisterPage />} />

          {/* Protegidas */}
          <Route
            element={
              <ProtectedRoute>
                <AppShell />
              </ProtectedRoute>
            }
          >
            <Route path="/vehiculos" element={<VehiclesPage />} />
            <Route path="/vehiculos/:vehicleId" element={<VehicleDashboardPage />} />
          </Route>

          {/* Cualquier otra ruta → inicio (landing o login). */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
