/**
 * Modal de alta de vehículo (F01).
 *
 * Captura Marca, Modelo, Año, Motorización y Kilometraje Inicial (más alias y
 * placa opcionales). El backend resuelve el catálogo de fábrica (F02): si no
 * hay coincidencia, el vehículo se da de alta igualmente y la validación de
 * límites (F05) queda desactivada para él.
 */

import { useState, type FormEvent } from 'react';

import { Modal } from './Modal.js';
import {
  createVehicle,
  VEHICLE_ENGINE_TYPES,
  type CreateVehicleInput,
  type Vehicle,
  type VehicleEngineType,
} from '../services/api.js';

const MIN_YEAR = 1900;
const MAX_YEAR = 2100;

interface FieldErrors {
  marca?: string;
  modelo?: string;
  anio?: string;
  tipoMotor?: string;
  kilometrajeInicial?: string;
  alias?: string;
  placa?: string;
}

interface VehicleFormModalProps {
  onClose: () => void;
  /** Se invoca con el vehículo creado (para refrescar la lista). */
  onCreated: (vehicle: Vehicle) => void;
}

interface FormState {
  marca: string;
  modelo: string;
  anio: string;
  tipoMotor: VehicleEngineType;
  kilometrajeInicial: string;
  alias: string;
  placa: string;
}

const INITIAL_FORM: FormState = {
  marca: '',
  modelo: '',
  anio: '',
  tipoMotor: 'GASOLINA',
  kilometrajeInicial: '',
  alias: '',
  placa: '',
};

const ENGINE_LABELS: Record<VehicleEngineType, string> = {
  GASOLINA: 'Gasolina',
  DIESEL: 'Diésel',
  HIBRIDO: 'Híbrido',
  ELECTRICO: 'Eléctrico',
};

export function VehicleFormModal({ onClose, onCreated }: VehicleFormModalProps) {
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function update<K extends keyof FormState>(key: K, value: FormState[K]): void {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => ({ ...current, [key]: undefined }));
  }

  function validate(): { input?: CreateVehicleInput; errors: FieldErrors } {
    const errors: FieldErrors = {};

    const marca = form.marca.trim();
    const modelo = form.modelo.trim();

    if (marca.length === 0) errors.marca = 'La marca es obligatoria.';
    else if (marca.length > 50) errors.marca = 'Máximo 50 caracteres.';

    if (modelo.length === 0) errors.modelo = 'El modelo es obligatorio.';
    else if (modelo.length > 50) errors.modelo = 'Máximo 50 caracteres.';

    const anio = Number(form.anio);
    if (!Number.isInteger(anio) || anio < MIN_YEAR || anio > MAX_YEAR) {
      errors.anio = `Introduce un año entre ${MIN_YEAR} y ${MAX_YEAR}.`;
    }

    if (!VEHICLE_ENGINE_TYPES.includes(form.tipoMotor)) {
      errors.tipoMotor = 'Selecciona una motorización válida.';
    }

    const km = Number(form.kilometrajeInicial);
    if (!Number.isInteger(km) || km < 0) {
      errors.kilometrajeInicial = 'Introduce un kilometraje entero mayor o igual a 0.';
    }

    const alias = form.alias.trim();
    if (alias.length > 50) errors.alias = 'Máximo 50 caracteres.';

    const placa = form.placa.trim();
    if (placa.length > 20) errors.placa = 'Máximo 20 caracteres.';

    setFieldErrors(errors);

    if (Object.keys(errors).length > 0) {
      return { errors };
    }

    return {
      errors,
      input: {
        marca,
        modelo,
        anio,
        tipoMotor: form.tipoMotor,
        kilometrajeInicial: km,
        ...(alias.length > 0 ? { alias } : {}),
        ...(placa.length > 0 ? { placa } : {}),
      },
    };
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFormError('');

    const { input } = validate();
    if (!input) return;

    setSubmitting(true);

    try {
      const vehicle = await createVehicle(input);
      onCreated(vehicle);
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : 'No se pudo crear el vehículo.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass = (hasError: boolean): string =>
    `w-full rounded-xl border bg-background px-3.5 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted focus:ring-2 focus:ring-secondary/40 ${
      hasError ? 'border-danger' : 'border-line focus:border-secondary'
    }`;

  return (
    <Modal
      title="Agregar vehículo"
      description="Registra un vehículo de tu propiedad (marca, modelo, año y motorización)."
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {formError ? (
          <div
            role="alert"
            className="rounded-xl border border-danger/40 bg-danger/10 px-3.5 py-2.5 text-sm text-danger"
          >
            {formError}
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="v-marca" className="mb-1.5 block text-sm font-medium text-foreground">
              Marca <span className="text-danger">*</span>
            </label>
            <input
              id="v-marca"
              data-autofocus
              type="text"
              value={form.marca}
              onChange={(event) => update('marca', event.target.value)}
              placeholder="Toyota"
              aria-invalid={Boolean(fieldErrors.marca)}
              className={inputClass(Boolean(fieldErrors.marca))}
            />
            {fieldErrors.marca ? (
              <p role="alert" className="mt-1.5 text-xs text-danger">{fieldErrors.marca}</p>
            ) : null}
          </div>

          <div>
            <label htmlFor="v-modelo" className="mb-1.5 block text-sm font-medium text-foreground">
              Modelo <span className="text-danger">*</span>
            </label>
            <input
              id="v-modelo"
              type="text"
              value={form.modelo}
              onChange={(event) => update('modelo', event.target.value)}
              placeholder="Corolla"
              aria-invalid={Boolean(fieldErrors.modelo)}
              className={inputClass(Boolean(fieldErrors.modelo))}
            />
            {fieldErrors.modelo ? (
              <p role="alert" className="mt-1.5 text-xs text-danger">{fieldErrors.modelo}</p>
            ) : null}
          </div>

          <div>
            <label htmlFor="v-anio" className="mb-1.5 block text-sm font-medium text-foreground">
              Año <span className="text-danger">*</span>
            </label>
            <input
              id="v-anio"
              type="number"
              inputMode="numeric"
              value={form.anio}
              onChange={(event) => update('anio', event.target.value)}
              placeholder="2018"
              min={MIN_YEAR}
              max={MAX_YEAR}
              aria-invalid={Boolean(fieldErrors.anio)}
              className={inputClass(Boolean(fieldErrors.anio))}
            />
            {fieldErrors.anio ? (
              <p role="alert" className="mt-1.5 text-xs text-danger">{fieldErrors.anio}</p>
            ) : null}
          </div>

          <div>
            <label htmlFor="v-motor" className="mb-1.5 block text-sm font-medium text-foreground">
              Motorización <span className="text-danger">*</span>
            </label>
            <select
              id="v-motor"
              value={form.tipoMotor}
              onChange={(event) =>
                update('tipoMotor', event.target.value as VehicleEngineType)
              }
              className={inputClass(Boolean(fieldErrors.tipoMotor))}
            >
              {VEHICLE_ENGINE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {ENGINE_LABELS[type]}
                </option>
              ))}
            </select>
            {fieldErrors.tipoMotor ? (
              <p role="alert" className="mt-1.5 text-xs text-danger">{fieldErrors.tipoMotor}</p>
            ) : null}
          </div>
        </div>

        <div>
          <label htmlFor="v-km" className="mb-1.5 block text-sm font-medium text-foreground">
            Kilometraje inicial <span className="text-danger">*</span>
          </label>
          <input
            id="v-km"
            type="number"
            inputMode="numeric"
            value={form.kilometrajeInicial}
            onChange={(event) => update('kilometrajeInicial', event.target.value)}
            placeholder="45000"
            min={0}
            aria-invalid={Boolean(fieldErrors.kilometrajeInicial)}
            className={inputClass(Boolean(fieldErrors.kilometrajeInicial))}
          />
          {fieldErrors.kilometrajeInicial ? (
            <p role="alert" className="mt-1.5 text-xs text-danger">
              {fieldErrors.kilometrajeInicial}
            </p>
          ) : null}
          <p className="mt-1.5 text-xs text-muted">
            Lectura actual del odómetro al registrar el vehículo.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="v-alias" className="mb-1.5 block text-sm font-medium text-foreground">
              Alias <span className="text-muted font-normal">(opcional)</span>
            </label>
            <input
              id="v-alias"
              type="text"
              value={form.alias}
              onChange={(event) => update('alias', event.target.value)}
              placeholder="Mi Corolla"
              maxLength={50}
              aria-invalid={Boolean(fieldErrors.alias)}
              className={inputClass(Boolean(fieldErrors.alias))}
            />
            {fieldErrors.alias ? (
              <p role="alert" className="mt-1.5 text-xs text-danger">{fieldErrors.alias}</p>
            ) : null}
          </div>

          <div>
            <label htmlFor="v-placa" className="mb-1.5 block text-sm font-medium text-foreground">
              Placa <span className="text-muted font-normal">(opcional)</span>
            </label>
            <input
              id="v-placa"
              type="text"
              value={form.placa}
              onChange={(event) => update('placa', event.target.value.toUpperCase())}
              placeholder="ABC-1234"
              maxLength={20}
              aria-invalid={Boolean(fieldErrors.placa)}
              className={inputClass(Boolean(fieldErrors.placa))}
            />
            {fieldErrors.placa ? (
              <p role="alert" className="mt-1.5 text-xs text-danger">{fieldErrors.placa}</p>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-xl border border-line px-4 py-2.5 text-sm font-medium text-muted transition hover:bg-background hover:text-foreground disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-xl bg-secondary px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Guardando…' : 'Agregar vehículo'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
