/**
 * Raíz de la aplicación: contexto de autenticación + enrutamiento.
 *
 * Rutas:
 *   /login              → iniciar sesión (pública)
 *   /registro           → crear cuenta  (pública)
 *   /                   → redirige a /vehiculos
 *   /vehiculos          → listado y alta de vehículos (protegida)
 *   /vehiculos/:id      → panel del vehículo (protegida)
 *
 * Todas las rutas bajo <ProtectedRoute> exigen sesión; sin ella se redirige
 * a /login conservando la ruta original de origen.
 */

import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { AppShell } from './components/AppShell.js';
import { ProtectedRoute } from './components/ProtectedRoute.js';
import { AuthProvider } from './context/AuthContext.js';
import { LoginPage } from './pages/LoginPage.js';
import { RegisterPage } from './pages/RegisterPage.js';
import { VehicleDashboardPage } from './pages/VehicleDashboardPage.js';
import { VehiclesPage } from './pages/VehiclesPage.js';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Públicas */}
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
            <Route path="/" element={<Navigate to="/vehiculos" replace />} />
            <Route path="/vehiculos" element={<VehiclesPage />} />
            <Route path="/vehiculos/:vehicleId" element={<VehicleDashboardPage />} />
          </Route>

          {/* Cualquier otra ruta → inicio (o login si no hay sesión). */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
