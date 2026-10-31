/**
 * Página "Mis vehículos" (F01).
 *
 * Lista exclusivamente los vehículos del usuario autenticado (el backend
 * filtra por usuario), permite dar de alta nuevos y entrar al panel de cada
 * uno. Incluye estado vacío para guiar el primer alta.
 */

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { VehicleFormModal } from '../components/VehicleFormModal.js';
import { deleteVehicle, listVehicles, type Vehicle } from '../services/api.js';

type LoadState = 'loading' | 'ready' | 'error';

export function VehiclesPage() {
  const navigate = useNavigate();

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  const [loadError, setLoadError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [confirmingId, setConfirmingId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setState('loading');
    setLoadError('');

    try {
      const data = await listVehicles();
      setVehicles(data);
      setState('ready');
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : 'No se pudieron cargar los vehículos.',
      );
      setState('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function handleCreated(vehicle: Vehicle): void {
    setShowForm(false);
    setSuccessMessage(`Vehículo ${vehicle.marca} ${vehicle.modelo} agregado.`);
    setVehicles((current) => [vehicle, ...current]);
  }

  async function handleDelete(vehicle: Vehicle): Promise<void> {
    setDeleting(true);

    try {
      await deleteVehicle(vehicle.id);
      setVehicles((current) => current.filter((item) => item.id !== vehicle.id));
      setSuccessMessage(
        `Se eliminó ${vehicle.marca} ${vehicle.modelo} y su historial.`,
      );
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : 'No se pudo eliminar el vehículo.',
      );
    } finally {
      setDeleting(false);
      setConfirmingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-secondary text-2xl font-extrabold tracking-tight text-foreground">
            Mis vehículos
          </h1>
          <p className="mt-1 text-sm text-muted">
            {state === 'ready'
              ? `${vehicles.length} ${vehicles.length === 1 ? 'vehículo registrado' : 'vehículos registrados'}`
              : 'Vehículos de tu cuenta'}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-secondary px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
        >
          <span aria-hidden="true" className="text-base leading-none">+</span>
          Agregar vehículo
        </button>
      </div>

      {successMessage ? (
        <div
          role="status"
          className="flex items-start justify-between gap-3 rounded-xl border border-success/40 bg-success/10 px-4 py-3 text-sm text-foreground"
        >
          <span>{successMessage}</span>
          <button
            type="button"
            onClick={() => setSuccessMessage('')}
            aria-label="Cerrar aviso"
            className="text-muted hover:text-foreground"
          >
            ×
          </button>
        </div>
      ) : null}

      {state === 'loading' ? (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
          {[0, 1, 2].map((index) => (
            <li
              key={index}
              className="h-44 animate-pulse rounded-2xl border border-line bg-surface"
            />
          ))}
        </ul>
      ) : null}

      {state === 'error' ? (
        <div
          role="alert"
          className="rounded-2xl border border-danger/40 bg-danger/10 p-5 text-sm"
        >
          <p className="font-medium text-danger">No se pudieron cargar tus vehículos.</p>
          <p className="mt-1 text-muted">{loadError}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-3 rounded-xl border border-line bg-surface px-4 py-2 text-sm font-medium text-foreground transition hover:bg-background"
          >
            Reintentar
          </button>
        </div>
      ) : null}

      {state === 'ready' && vehicles.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-surface px-6 py-12 text-center">
          <span
            className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary/15 text-xl"
            aria-hidden="true"
          >
            🚗
          </span>
          <h2 className="mt-4 font-secondary text-lg font-bold text-foreground">
            Aún no tienes vehículos
          </h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted">
            Agrega tu primer vehículo para registrar lecturas de odómetro y llevar
            el control de sus mantenimientos.
          </p>
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="mt-5 rounded-xl bg-secondary px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
          >
            Agregar mi primer vehículo
          </button>
        </div>
      ) : null}

      {state === 'ready' && vehicles.length > 0 ? (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {vehicles.map((vehicle) => (
            <li
              key={vehicle.id}
              className="flex flex-col rounded-2xl border border-line bg-surface p-5 shadow-card"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-secondary text-base font-bold text-foreground">
                    {vehicle.alias || `${vehicle.marca} ${vehicle.modelo}`}
                  </p>
                  <p className="mt-0.5 text-sm text-muted">
                    {vehicle.marca} {vehicle.modelo} · {vehicle.anio}
                  </p>
                </div>

                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    vehicle.hasFactorySpecs
                      ? 'bg-success/15 text-success'
                      : 'bg-warning/15 text-warning'
                  }`}
                  title={
                    vehicle.hasFactorySpecs
                      ? 'Tiene especificaciones de fábrica: los intervalos se validan.'
                      : 'Sin especificaciones de fábrica: los intervalos no se validan.'
                  }
                >
                  {vehicle.hasFactorySpecs ? 'Con specs' : 'Sin specs'}
                </span>
              </div>

              <dl className="mt-4 space-y-1.5 text-sm">
                <div className="flex items-center justify-between">
                  <dt className="text-muted">Placa</dt>
                  <dd className="font-medium text-foreground">
                    {vehicle.placa ?? '—'}
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-muted">Kilometraje</dt>
                  <dd className="font-medium text-foreground">
                    {vehicle.kilometrajeActual.toLocaleString('es')} km
                  </dd>
                </div>
                {vehicle.unidadDistancia === 'MI' ? (
                  <div className="flex items-center justify-between">
                    <dt className="text-muted">Registra en</dt>
                    <dd className="font-medium text-foreground">
                      Millas (aquí se muestra km)
                    </dd>
                  </div>
                ) : null}
              </dl>

              <div className="mt-5 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => navigate(`/vehiculos/${vehicle.id}`)}
                  className="w-full rounded-xl bg-secondary px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
                >
                  Abrir panel
                </button>

                {confirmingId === vehicle.id ? (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void handleDelete(vehicle)}
                      disabled={deleting}
                      className="flex-1 rounded-xl bg-danger px-3 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
                    >
                      {deleting ? 'Eliminando…' : 'Sí, eliminar'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingId(null)}
                      disabled={deleting}
                      className="flex-1 rounded-xl border border-line px-3 py-2 text-sm font-medium text-muted transition hover:bg-background disabled:opacity-60"
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmingId(vehicle.id)}
                    className="w-full rounded-xl border border-line px-4 py-2 text-sm font-medium text-muted transition hover:border-danger/40 hover:text-danger"
                  >
                    Eliminar
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {showForm ? (
        <VehicleFormModal
          onClose={() => setShowForm(false)}
          onCreated={handleCreated}
        />
      ) : null}
    </div>
  );
}
