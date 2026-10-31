import { useState } from 'react';
import type { FormEvent } from 'react';

import { ApiClientError, registerOdometerReading } from '../services/api.js';
import type { DistanceUnit, OdometerReading } from '../services/api.js';
import { toKilometers, UNIT_LABELS } from '../utils/units.js';
import { Modal } from './Modal.js';

interface OdometerModalProps {
  vehicleId: number;
  currentKilometers: number | null;
  /**
   * Unidad en la que escribe el usuario. La lectura se convierte a km antes
   * de compararla con `currentKilometers` (almacenado en km) y antes de
   * enviarse, de modo que la validación y la API siempre trabajan en km.
   */
  unit: DistanceUnit;
  onClose: () => void;
  onSuccess: (reading: OdometerReading) => void;
}

interface OdometerFieldErrors {
  kilometers?: string;
  recordedAt?: string;
}

const inputClass =
  'mt-1.5 w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted focus:border-secondary focus:ring-2 focus:ring-secondary disabled:cursor-not-allowed disabled:bg-background';
const labelClass = 'block text-sm font-semibold text-foreground';
const hintClass = 'mt-1 text-xs text-muted';
const fieldErrorClass = 'mt-1 text-xs font-medium text-danger';

const numberFormatter = new Intl.NumberFormat('es-CO');

/** Formulario para registrar una nueva lectura de odómetro (F03). */
export function OdometerModal({
  vehicleId,
  currentKilometers,
  unit,
  onClose,
  onSuccess,
}: OdometerModalProps) {
  const [kilometers, setKilometers] = useState('');
  const [recordedAt, setRecordedAt] = useState('');
  const [fieldErrors, setFieldErrors] = useState<OdometerFieldErrors>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Equivalente en km de lo que el usuario está escribiendo (solo informativo,
  // para que no tenga que convertir mentalmente). La BD guarda km.
  const lecturaEscrita = Number(kilometers);
  const equivalenteKm =
    unit === 'MI' &&
    kilometers.trim().length > 0 &&
    Number.isInteger(lecturaEscrita) &&
    lecturaEscrita >= 0
      ? toKilometers(lecturaEscrita, 'MI')
      : null;

  const handleSubmit = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();

    const parsedReading = Number(kilometers);
    // Conversión a km ANTES de validar: `currentKilometers` está almacenado
    // en km y la API también recibe km. Así la comparación es km vs km y no
    // se rechazan lecturas válidas de vehículos en millas.
    const readingInKilometers = toKilometers(parsedReading, unit);
    const nextErrors: OdometerFieldErrors = {};

    if (kilometers.trim().length === 0) {
      nextErrors.kilometers = 'Ingresa la lectura del odómetro.';
    } else if (
      !Number.isInteger(parsedReading) ||
      parsedReading < 0
    ) {
      nextErrors.kilometers =
        'La lectura debe ser un número entero mayor o igual a cero.';
    } else if (
      currentKilometers !== null &&
      readingInKilometers < currentKilometers
    ) {
      nextErrors.kilometers = `La lectura no puede ser menor al odómetro actual (${numberFormatter.format(currentKilometers)} km).`;
    }

    let recordedAtIso: string | undefined;

    if (recordedAt.trim().length > 0) {
      const parsedDate = new Date(recordedAt);

      if (Number.isNaN(parsedDate.getTime())) {
        nextErrors.recordedAt = 'Ingresa una fecha y hora válidas.';
      } else {
        recordedAtIso = parsedDate.toISOString();
      }
    }

    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      setApiError(null);
      return;
    }

    setFieldErrors({});
    setApiError(null);
    setIsSubmitting(true);

    try {
      // Siempre se envía en kilómetros (unidad de almacenamiento y de API).
      const reading = await registerOdometerReading(
        vehicleId,
        readingInKilometers,
        recordedAtIso,
      );

      setIsSubmitting(false);
      onSuccess(reading);
    } catch (error) {
      setApiError(getErrorMessage(error));
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      title="Registrar lectura de odómetro"
      description={`Vehículo #${vehicleId} · Guarda el kilometraje actual para calcular tu tasa de uso.`}
      onClose={onClose}
    >
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
          <label htmlFor="odometer-kilometers" className={labelClass}>
            Lectura actual ({UNIT_LABELS[unit]}){' '}
            <span className="text-danger">*</span>
          </label>
          <input
            id="odometer-kilometers"
            data-autofocus
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={kilometers}
            onChange={(event) => {
              setKilometers(event.target.value);
              setFieldErrors({});
              setApiError(null);
            }}
            disabled={isSubmitting}
            required
            aria-invalid={fieldErrors.kilometers !== undefined}
            aria-describedby={
              fieldErrors.kilometers
                ? 'odometer-kilometers-error'
                : 'odometer-kilometers-hint'
            }
            placeholder="Ej. 52400"
            className={inputClass}
          />
          {fieldErrors.kilometers ? (
            <p id="odometer-kilometers-error" className={fieldErrorClass}>
              {fieldErrors.kilometers}
            </p>
          ) : (
            <>
              <p id="odometer-kilometers-hint" className={hintClass}>
                {currentKilometers !== null
                  ? `Odómetro actual: ${numberFormatter.format(currentKilometers)} km. La lectura debe ser igual o mayor.`
                  : 'Ingresa el valor que marca el tablero del vehículo.'}
              </p>
              {/* Vehículo en millas: muestra el equivalente que se guardará. */}
              {equivalenteKm !== null ? (
                <p className="mt-1 text-xs font-medium text-secondary">
                  Se guardará como {numberFormatter.format(equivalenteKm)} km.
                </p>
              ) : null}
            </>
          )}
        </div>

        <div>
          <label htmlFor="odometer-recorded-at" className={labelClass}>
            Fecha y hora de la lectura{' '}
            <span className="font-normal text-muted">(opcional)</span>
          </label>
          <input
            id="odometer-recorded-at"
            type="datetime-local"
            value={recordedAt}
            onChange={(event) => {
              setRecordedAt(event.target.value);
              setFieldErrors({});
              setApiError(null);
            }}
            disabled={isSubmitting}
            aria-invalid={fieldErrors.recordedAt !== undefined}
            aria-describedby={
              fieldErrors.recordedAt
                ? 'odometer-recorded-at-error'
                : 'odometer-recorded-at-hint'
            }
            className={inputClass}
          />
          {fieldErrors.recordedAt ? (
            <p id="odometer-recorded-at-error" className={fieldErrorClass}>
              {fieldErrors.recordedAt}
            </p>
          ) : (
            <p id="odometer-recorded-at-hint" className={hintClass}>
              Si se deja vacía, se usará la fecha y hora actuales.
            </p>
          )}
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
            {isSubmitting ? 'Guardando…' : 'Registrar lectura'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    return error.message;
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return 'No se pudo registrar la lectura. Inténtalo nuevamente.';
}
