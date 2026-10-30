/**
 * Ruta del panel de un vehículo concreto (`/vehiculos/:vehicleId`).
 *
 * Carga el vehículo del usuario (el backend responde 404 si no le pertenece)
 * y monta el Dashboard con sus datos. Antes el panel estaba hardcodeado al
 * vehículo demo id=1.
 */

import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { Dashboard } from '../components/Dashboard.js';
import { getVehicle, type Vehicle } from '../services/api.js';

export function VehicleDashboardPage() {
  const params = useParams<{ vehicleId: string }>();
  const vehicleId = Number(params.vehicleId);
  const isValidId = Number.isInteger(vehicleId) && vehicleId > 0;

  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isValidId) {
      setVehicle(null);
      setError('El identificador del vehículo no es válido.');
      setLoading(false);
      return;
    }

    let isActive = true;
    setLoading(true);
    setError('');

    void getVehicle(vehicleId)
      .then((data) => {
        if (!isActive) return;
        setVehicle(data);
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (!isActive) return;
        setVehicle(null);
        setError(
          cause instanceof Error
            ? cause.message
            : 'No se pudo cargar el vehículo.',
        );
        setLoading(false);
      });

    return () => {
      isActive = false;
    };
  }, [vehicleId, isValidId]);

  if (loading) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex min-h-[40vh] items-center justify-center"
      >
        <div className="flex items-center gap-3 rounded-xl border border-line bg-surface px-5 py-4 text-sm text-muted">
          <span
            className="h-4 w-4 animate-spin rounded-full border-2 border-secondary border-t-transparent"
            aria-hidden="true"
          />
          Cargando vehículo…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        role="alert"
        className="rounded-2xl border border-danger/40 bg-danger/10 p-6 text-center"
      >
        <p className="font-medium text-danger">{error}</p>
        <p className="mt-1 text-sm text-muted">
          Puede que el vehículo no exista o no pertenezca a tu cuenta.
        </p>
        <Link
          to="/vehiculos"
          className="mt-4 inline-block rounded-xl bg-secondary px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
        >
          Volver a mis vehículos
        </Link>
      </div>
    );
  }

  if (!vehicle) {
    return null;
  }

  return <Dashboard vehicle={vehicle} />;
}
