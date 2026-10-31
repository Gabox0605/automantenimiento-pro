import { useState } from 'react';
import type { FormEvent } from 'react';

import {
  ApiClientError,
  MAINTENANCE_SERVICE_TYPES,
  registerMaintenance,
} from '../services/api.js';
import type {
  DistanceUnit,
  MaintenanceInput,
  MaintenanceResponse,
  MaintenanceServiceType,
} from '../services/api.js';
import { fromKilometers, toKilometers, UNIT_LABELS } from '../utils/units.js';
import { Modal } from './Modal.js';

/** Intervalo por defecto expresado en kilómetros (catálogo típico de aceite). */
const DEFAULT_INTERVAL_KM = 10_000;

interface MaintenanceModalProps {
  vehicleId: number;
  /** Unidad en la que escribe el usuario (la API siempre recibe km). */
  unit: DistanceUnit;
  onClose: () => void;
  onSuccess: (record: MaintenanceResponse) => void;
}

interface MaintenanceFieldErrors {
  serviceType?: string;
  serviceKilometers?: string;
  kilometerInterval?: string;
  monthInterval?: string;
}

const inputClass =
  'mt-1.5 w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted focus:border-secondary focus:ring-2 focus:ring-secondary disabled:cursor-not-allowed disabled:bg-background';
const labelClass = 'block text-sm font-semibold text-foreground';
const hintClass = 'mt-1 text-xs text-muted';
const fieldErrorClass = 'mt-1 text-xs font-medium text-danger';

const numberFormatter = new Intl.NumberFormat('es-CO');

/** Formulario para registrar un mantenimiento y validar sus intervalos (F05). */
export function MaintenanceModal({
  vehicleId,
  unit,
  onClose,
  onSuccess,
}: MaintenanceModalProps) {
  const [serviceType, setServiceType] =
    useState<MaintenanceServiceType>('CAMBIO_ACEITE');
  const [serviceKilometers, setServiceKilometers] = useState('');
  // El intervalo por defecto se expresa en la unidad del vehículo. Para
  // vehículos en millas, 10 000 km equivalen a 6 214 mi (vuelven a 10 000 km
  // al convertir), por lo que no se marca un exceso de fábrica espurio.
  const [kilometerInterval, setKilometerInterval] = useState(
    String(
      unit === 'MI' ? fromKilometers(DEFAULT_INTERVAL_KM) : DEFAULT_INTERVAL_KM,
    ),
  );
  const [monthInterval, setMonthInterval] = useState('12');
  const [notes, setNotes] = useState('');
  const [fieldErrors, setFieldErrors] = useState<MaintenanceFieldErrors>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<MaintenanceResponse | null>(null);

  const handleSubmit = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();

    const parsedServiceKilometers = Number(serviceKilometers);
    const parsedKilometerInterval = Number(kilometerInterval);
    const parsedMonthInterval = Number(monthInterval);
    const nextErrors: MaintenanceFieldErrors = {};

    if (!isMaintenanceServiceType(serviceType)) {
      nextErrors.serviceType = 'Selecciona un tipo de servicio válido.';
    }

    if (serviceKilometers.trim().length === 0) {
      nextErrors.serviceKilometers = `Ingresa la lectura del servicio en ${UNIT_LABELS[unit]}.`;
    } else if (
      !Number.isInteger(parsedServiceKilometers) ||
      parsedServiceKilometers < 0
    ) {
      nextErrors.serviceKilometers =
        'La lectura debe ser un entero mayor o igual a cero.';
    }

    if (kilometerInterval.trim().length === 0) {
      nextErrors.kilometerInterval = `Ingresa el intervalo en ${UNIT_LABELS[unit]}.`;
    } else if (
      !Number.isInteger(parsedKilometerInterval) ||
      parsedKilometerInterval <= 0
    ) {
      nextErrors.kilometerInterval =
        'El intervalo debe ser un entero mayor a cero.';
    }

    if (monthInterval.trim().length === 0) {
      nextErrors.monthInterval = 'Ingresa el intervalo en meses.';
    } else if (
      !Number.isInteger(parsedMonthInterval) ||
      parsedMonthInterval <= 0
    ) {
      nextErrors.monthInterval =
        'El intervalo debe ser un entero mayor a cero.';
    }

    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      setApiError(null);
      return;
    }

    const trimmedNotes = notes.trim();

    const input: MaintenanceInput = {
      vehicleId,
      serviceType,
      // La BD, la API y la validación de límites de fábrica (F05) trabajan
      // siempre en kilómetros: la conversión desde la unidad del vehículo
      // ocurre aquí, antes de salir del navegador.
      serviceKilometers: toKilometers(parsedServiceKilometers, unit),
      kilometerInterval: toKilometers(parsedKilometerInterval, unit),
      monthInterval: parsedMonthInterval,
      ...(trimmedNotes.length > 0 ? { notes: trimmedNotes } : {}),
    };

    setFieldErrors({});
    setApiError(null);
    setIsSubmitting(true);

    try {
      const record = await registerMaintenance(input);

      setIsSubmitting(false);
      setResult(record);
      onSuccess(record);
    } catch (error) {
      setApiError(getErrorMessage(error));
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      title={
        result ? 'Mantenimiento registrado' : 'Registrar mantenimiento'
      }
      description={
        result
          ? 'El servicio se guardó y la proyección del próximo cambio fue calculada.'
          : `Vehículo #${vehicleId} · Registra el servicio y define el intervalo para el próximo cambio.`
      }
      onClose={onClose}
    >
      {result ? (
        <MaintenanceSuccess record={result} onClose={onClose} />
      ) : (
        <form className="space-y-5" onSubmit={handleSubmit} noValidate>
          {apiError ? (
            <div
              role="alert"
              className="rounded-xl border border-danger bg-surface p-3 text-sm font-medium text-danger"
            >
              {apiError}
            </div>
          ) : null}

          <div>
            <label htmlFor="maintenance-service-type" className={labelClass}>
              Tipo de servicio <span className="text-danger">*</span>
            </label>
            <select
              id="maintenance-service-type"
              data-autofocus
              value={serviceType}
              onChange={(event) => {
                const value = event.target.value;

                if (isMaintenanceServiceType(value)) {
                  setServiceType(value);
                  setFieldErrors({});
                  setApiError(null);
                }
              }}
              disabled={isSubmitting}
              required
              aria-invalid={fieldErrors.serviceType !== undefined}
              aria-describedby={
                fieldErrors.serviceType
                  ? 'maintenance-service-type-error'
                  : 'maintenance-service-type-hint'
              }
              className={inputClass}
            >
              {MAINTENANCE_SERVICE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {formatServiceType(type)}
                </option>
              ))}
            </select>
            {fieldErrors.serviceType ? (
              <p id="maintenance-service-type-error" className={fieldErrorClass}>
                {fieldErrors.serviceType}
              </p>
            ) : (
              <p id="maintenance-service-type-hint" className={hintClass}>
                Los intervalos se validan contra las especificaciones de fábrica.
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="maintenance-service-kilometers"
              className={labelClass}
            >
              Lectura del servicio ({UNIT_LABELS[unit]}){' '}
              <span className="text-danger">*</span>
            </label>
            <input
              id="maintenance-service-kilometers"
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={serviceKilometers}
              onChange={(event) => {
                setServiceKilometers(event.target.value);
                setFieldErrors({});
                setApiError(null);
              }}
              disabled={isSubmitting}
              required
              aria-invalid={fieldErrors.serviceKilometers !== undefined}
              aria-describedby={
                fieldErrors.serviceKilometers
                  ? 'maintenance-service-kilometers-error'
                  : 'maintenance-service-kilometers-hint'
              }
              placeholder="Ej. 52400"
              className={inputClass}
            />
            {fieldErrors.serviceKilometers ? (
              <p
                id="maintenance-service-kilometers-error"
                className={fieldErrorClass}
              >
                {fieldErrors.serviceKilometers}
              </p>
            ) : (
              <p id="maintenance-service-kilometers-hint" className={hintClass}>
                Kilometraje que marcaba el vehículo al realizar el servicio.
              </p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="maintenance-kilometer-interval"
                className={labelClass}
              >
                Intervalo en {UNIT_LABELS[unit]}{' '}
                <span className="text-danger">*</span>
              </label>
              <input
                id="maintenance-kilometer-interval"
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                value={kilometerInterval}
                onChange={(event) => {
                  setKilometerInterval(event.target.value);
                  setFieldErrors({});
                  setApiError(null);
                }}
                disabled={isSubmitting}
                required
                aria-invalid={fieldErrors.kilometerInterval !== undefined}
                aria-describedby={
                  fieldErrors.kilometerInterval
                    ? 'maintenance-kilometer-interval-error'
                    : undefined
                }
                placeholder="Ej. 10000"
                className={inputClass}
              />
              {fieldErrors.kilometerInterval ? (
                <p
                  id="maintenance-kilometer-interval-error"
                  className={fieldErrorClass}
                >
                  {fieldErrors.kilometerInterval}
                </p>
              ) : null}
            </div>

            <div>
              <label htmlFor="maintenance-month-interval" className={labelClass}>
                Intervalo en meses <span className="text-danger">*</span>
              </label>
              <input
                id="maintenance-month-interval"
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                value={monthInterval}
                onChange={(event) => {
                  setMonthInterval(event.target.value);
                  setFieldErrors({});
                  setApiError(null);
                }}
                disabled={isSubmitting}
                required
                aria-invalid={fieldErrors.monthInterval !== undefined}
                aria-describedby={
                  fieldErrors.monthInterval
                    ? 'maintenance-month-interval-error'
                    : undefined
                }
                placeholder="Ej. 12"
                className={inputClass}
              />
              {fieldErrors.monthInterval ? (
                <p
                  id="maintenance-month-interval-error"
                  className={fieldErrorClass}
                >
                  {fieldErrors.monthInterval}
                </p>
              ) : null}
            </div>
          </div>

          <div>
            <label htmlFor="maintenance-notes" className={labelClass}>
              Notas o descripción{' '}
              <span className="font-normal text-muted">(opcional)</span>
            </label>
            <textarea
              id="maintenance-notes"
              rows={3}
              value={notes}
              onChange={(event) => {
                setNotes(event.target.value);
                setApiError(null);
              }}
              disabled={isSubmitting}
              placeholder="Ej. Cambio de aceite sintético y revisión general."
              className={`${inputClass} resize-y`}
            />
          </div>

          <div className="flex flex-col-reverse gap-3 border-t border-line pt-5 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-xl border border-line px-4 py-2.5 text-sm font-semibold text-foreground transition hover:bg-background focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? 'Guardando…' : 'Registrar mantenimiento'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function MaintenanceSuccess({
  record,
  onClose,
}: {
  record: MaintenanceResponse;
  onClose: () => void;
}) {
  return (
    <div>
      <div
        role="status"
        className="flex items-start gap-3 rounded-xl border border-success bg-background p-4"
      >
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-success text-sm font-extrabold text-white"
          aria-hidden="true"
        >
          ✓
        </span>
        <div>
          <p className="text-sm font-bold text-foreground">
            Servicio guardado correctamente
          </p>
          <p className="mt-1 text-sm text-muted">
            {formatServiceType(record.serviceType)} a los{' '}
            {numberFormatter.format(record.serviceKilometers)} km.
          </p>
        </div>
      </div>

      <dl className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-line bg-background p-3">
          <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
            Próximo servicio
          </dt>
          <dd className="mt-1 font-secondary text-sm font-bold text-foreground">
            {numberFormatter.format(record.nextServiceKilometers)} km
          </dd>
        </div>
        <div className="rounded-xl border border-line bg-background p-3">
          <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
            Intervalo elegido
          </dt>
          <dd className="mt-1 font-secondary text-sm font-bold text-foreground">
            {numberFormatter.format(record.kilometerInterval)} km ·{' '}
            {numberFormatter.format(record.monthInterval)} meses
          </dd>
        </div>
      </dl>

      {record.exceedsManufacturerSpecs ? (
        <div className="mt-4 rounded-xl border border-warning bg-surface p-4">
          <p className="text-sm font-bold text-foreground">
            Advertencia de fábrica
          </p>
          <p className="mt-1 text-xs text-muted">
            Los intervalos elegidos superan las especificaciones recomendadas
            para este vehículo.
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted">
            {record.manufacturerLimitWarnings.map((warning, index) => (
              <li key={`${warning}-${index}`}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mt-4 rounded-xl border border-success bg-surface p-3 text-xs text-muted">
          Los intervalos están dentro de los límites de fábrica.
        </p>
      )}

      <button
        type="button"
        onClick={onClose}
        className="mt-5 w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2"
      >
        Entendido
      </button>
    </div>
  );
}

function isMaintenanceServiceType(
  value: string,
): value is MaintenanceServiceType {
  return (MAINTENANCE_SERVICE_TYPES as readonly string[]).includes(value);
}

function formatServiceType(value: MaintenanceServiceType): string {
  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    return error.message;
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return 'No se pudo registrar el mantenimiento. Inténtalo nuevamente.';
}
