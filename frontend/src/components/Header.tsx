import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { useAuth } from '../context/AuthContext.js';
import { listVehicles, type Vehicle } from '../services/api.js';

export function Header() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);

  // Id del vehículo activo, derivado de la ruta /vehiculos/:id.
  const routeMatch = /^\/vehiculos\/(\d+)$/.exec(location.pathname);
  const currentVehicleId = routeMatch ? Number(routeMatch[1]) : null;

  // Se recarga al navegar para reflejar altas y bajas hechas en la lista.
  useEffect(() => {
    let isActive = true;

    void listVehicles()
      .then((data) => {
        if (isActive) setVehicles(data);
      })
      .catch(() => {
        // Silencioso: el selector es complementario; la página principal ya
        // muestra sus propios errores de carga.
        if (isActive) setVehicles([]);
      });

    return () => {
      isActive = false;
    };
  }, [location.pathname]);

  const currentVehicle =
    vehicles.find((vehicle) => vehicle.id === currentVehicleId) ?? null;

  async function handleSignOut(): Promise<void> {
    await signOut();
    navigate('/login', { replace: true });
  }

  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-primary text-white shadow-lg shadow-slate-900/10">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-4 py-4 sm:px-6 lg:px-8">
        <Link to="/vehiculos" className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary font-secondary text-sm font-extrabold tracking-tight text-white shadow-sm">
            AM
          </span>
          <span>
            <span className="block font-secondary text-base font-bold leading-tight">
              AutoMantenimiento Pro
            </span>
            <span className="block text-xs text-slate-400">
              Mantenimiento preventivo inteligente
            </span>
          </span>
        </Link>

        <nav aria-label="Navegación principal" className="hidden items-center gap-1 md:flex">
          <Link
            to="/vehiculos"
            className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
              location.pathname.startsWith('/vehiculos')
                ? 'bg-white/10 text-white'
                : 'text-slate-300 hover:bg-white/5 hover:text-white'
            }`}
          >
            Mis vehículos
          </Link>
        </nav>

        <div className="flex items-center gap-3">
          {/* Selector del vehículo activo (solo si hay vehículos). */}
          {vehicles.length > 0 ? (
            <>
              <label className="sr-only" htmlFor="vehicle-switcher">
                Cambiar de vehículo
              </label>
              <select
                id="vehicle-switcher"
                value={currentVehicleId ?? ''}
                onChange={(event) => {
                  const nextId = event.target.value;
                  if (nextId) navigate(`/vehiculos/${nextId}`);
                }}
                className="hidden max-w-[13rem] truncate rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs text-white outline-none focus:border-white/40 sm:block"
              >
                {currentVehicleId === null ? (
                  <option value="" className="text-slate-900">
                    Selecciona vehículo
                  </option>
                ) : null}
                {vehicles.map((vehicle) => (
                  <option
                    key={vehicle.id}
                    value={vehicle.id}
                    className="text-slate-900"
                  >
                    {vehicle.alias || `${vehicle.marca} ${vehicle.modelo}`}
                  </option>
                ))}
              </select>
            </>
          ) : null}

          {currentVehicle && currentVehicle.placa ? (
            <span className="hidden items-center gap-2 rounded-full border border-white/15 px-3 py-1.5 text-xs text-slate-300 lg:flex">
              <span className="h-2 w-2 rounded-full bg-success" aria-hidden="true" />
              {currentVehicle.placa}
            </span>
          ) : null}

          <div className="flex items-center gap-2">
            {user?.email ? (
              <span
                className="hidden max-w-[12rem] truncate text-xs text-slate-400 sm:block"
                title={user.email}
              >
                {user.email}
              </span>
            ) : null}

            <button
              type="button"
              onClick={() => void handleSignOut()}
              className="rounded-lg border border-white/15 px-3 py-2 text-xs font-medium text-slate-200 transition hover:bg-white/10 hover:text-white"
            >
              Cerrar sesión
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
