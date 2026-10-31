/**
 * Cliente de la API REST de AutoMantenimiento Pro.
 * ----------------------------------------------------------------------------
 * Centraliza las llamadas HTTP del frontend y traduce cualquier respuesta de
 * error de la API a un `ApiClientError` legible.
 *
 * La URL base se toma de `VITE_API_URL` o, si no está definida, apunta al
 * backend local en `http://localhost:3001/api`.
 *
 * Autenticación: cada petición adjunta el access token de Supabase Auth como
 * `Authorization: Bearer <jwt>`. El backend lo verifica contra el JWKS del
 * proyecto y lo usa (claim `sub`) para filtrar los recursos del usuario.
 */

import { supabase } from '../lib/supabase.js';

// ============================================================================
// Tipos de la API
// ============================================================================

/** Tipos de servicio aceptados por el backend (F05). */
export const MAINTENANCE_SERVICE_TYPES = [
  'CAMBIO_ACEITE',
  'FILTRO_ACEITE',
  'FILTRO_AIRE',
  'FILTRO_COMBUSTIBLE',
  'FILTRO_HABITACULO',
  'FAJA_DISTRIBUCION',
  'BUJIAS',
  'LIQUIDO_REFRIGERANTE',
  'LIQUIDO_FRENOS',
  'TRANSMISION',
  'FRENOS',
  'LLANTAS',
  'BATERIA',
  'SUSPENSION',
  'ALINEACION',
  'REVISION_GENERAL',
  'OTRO',
] as const;

export type MaintenanceServiceType = (typeof MAINTENANCE_SERVICE_TYPES)[number];

/** Severidades del diccionario OBD-II (F10). */
export const OBD2_SEVERITIES = ['BAJA', 'MEDIA', 'ALTA', 'CRITICA'] as const;

export type Obd2Severity = (typeof OBD2_SEVERITIES)[number];

/** Lectura individual de odómetro (F03). */
export interface OdometerReading {
  id: number;
  vehicleId: number;
  kilometers: number;
  /** Fecha ISO 8601 devuelta por la API. */
  recordedAt: string;
}

/** Odómetro actual y su historial de lecturas. */
export interface OdometerSnapshot {
  vehicleId: number;
  currentKilometers: number;
  initialKilometers: number;
  /** Lecturas ordenadas de la más reciente a la más antigua. */
  readings: OdometerReading[];
}

/** Datos necesarios para registrar un mantenimiento (F05). */
export interface MaintenanceInput {
  vehicleId: number;
  serviceType: MaintenanceServiceType;
  serviceKilometers: number;
  kilometerInterval: number;
  monthInterval: number;
  /** Fecha ISO 8601 del servicio. */
  serviceDate?: string;
  cost?: number;
  shop?: string | null;
  notes?: string | null;
}

/** Mantenimiento registrado devuelto por la API. */
export interface MaintenanceResponse {
  id: number;
  vehicleId: number;
  serviceType: MaintenanceServiceType;
  /** Fecha ISO 8601 del servicio. */
  serviceDate: string;
  serviceKilometers: number;
  kilometerInterval: number;
  monthInterval: number;
  nextServiceKilometers: number;
  cost: number;
  shop: string | null;
  notes: string | null;
  exceedsManufacturerSpecs: boolean;
  manufacturerLimitWarnings: string[];
  /** Fecha ISO 8601 de creación del registro. */
  createdAt: string;
}

/** Información completa de un código OBD-II (F10). */
export interface Obd2Code {
  id: number;
  code: string;
  title: string;
  category: string;
  description: string;
  commonCauses: string[];
  symptoms: string[];
  severity: Obd2Severity;
}

/** Formato de error que devuelve el middleware del backend. */
export interface ErrorResponse {
  error: {
    code: string;
    message: string;
  };
}

// ============================================================================
// Error del cliente
// ============================================================================

/**
 * Error legible lanzado por todas las funciones del cliente.
 *
 * `status` vale 0 cuando no hubo respuesta HTTP (fallo de red o servidor
 * apagado). En el resto de casos conserva el status y el código de la API.
 */
export class ApiClientError extends Error {
  public readonly status: number;
  public readonly code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
    Object.setPrototypeOf(this, ApiClientError.prototype);
  }
}

// ============================================================================
// Configuración
// ============================================================================

const DEFAULT_BASE_URL = 'http://localhost:3001/api';
const configuredBaseUrl = import.meta.env.VITE_API_URL?.trim();

/** URL base de la API, sin barra final. */
export const BASE_URL = (
  configuredBaseUrl && configuredBaseUrl.length > 0
    ? configuredBaseUrl
    : DEFAULT_BASE_URL
).replace(/\/+$/, '');

// ============================================================================
// Cliente HTTP interno
// ============================================================================

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);

  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }

  if (init.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  // Adjunta el JWT de Supabase Auth si hay sesión activa.
  // getSession() lee de forma local (localStorage); supabase-js refresca el
  // token automáticamente si está próximo a expirar.
  if (!headers.has('Authorization')) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;

    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
  }

  let response: Response;

  try {
    response = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers,
    });
  } catch {
    throw new ApiClientError(
      'No se pudo conectar con la API. Verifica que el servidor esté en ejecución.',
      0,
      'NETWORK_ERROR',
    );
  }

  if (!response.ok) {
    const apiError = await buildApiError(response);

    // Sesión inválida o expirada según el backend: cierra la sesión local para
    // que ProtectedRoute redirija a /login en vez de dejar una UI muerta.
    if (
      response.status === 401 &&
      (apiError.code === 'INVALID_TOKEN' || apiError.code === 'UNAUTHENTICATED')
    ) {
      await supabase.auth.signOut().catch(() => undefined);
    }

    throw apiError;
  }

  const text = await response.text();

  if (text.trim().length === 0) {
    // 204 No Content: respuesta vacía esperada (p. ej. DELETE) no es un error.
    if (response.status === 204) {
      return undefined as T;
    }

    throw new ApiClientError(
      'La API devolvió una respuesta vacía.',
      response.status,
      'INVALID_RESPONSE',
    );
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiClientError(
      'La API devolvió una respuesta que no es JSON válido.',
      response.status,
      'INVALID_RESPONSE',
    );
  }
}

/** Convierte una respuesta HTTP no exitosa en un error legible. */
async function buildApiError(response: Response): Promise<ApiClientError> {
  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    payload = undefined;
  }

  if (isErrorResponse(payload)) {
    const message =
      payload.error.message.trim().length > 0
        ? payload.error.message
        : `La API respondió con el estado ${response.status}.`;

    return new ApiClientError(message, response.status, payload.error.code);
  }

  const statusText =
    response.statusText.trim().length > 0 ? ` ${response.statusText}` : '';

  return new ApiClientError(
    `La API respondió con el estado ${response.status}${statusText}.`,
    response.status,
    'HTTP_ERROR',
  );
}

function isErrorResponse(value: unknown): value is ErrorResponse {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const error = (value as { error?: unknown }).error;

  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const candidate = error as { code?: unknown; message?: unknown };

  return (
    typeof candidate.code === 'string' &&
    typeof candidate.message === 'string'
  );
}

// ============================================================================
// Endpoints públicos
// ============================================================================

/**
 * Consulta el odómetro actual y el historial de lecturas de un vehículo.
 *
 * @param vehicleId Id del vehículo.
 * @param limit Cantidad máxima de lecturas (1-500). Si se omite, el backend
 *              devuelve las 100 más recientes.
 */
export async function getOdometerSnapshot(
  vehicleId: number,
  limit?: number,
): Promise<OdometerSnapshot> {
  const query =
    limit === undefined ? '' : `?limit=${encodeURIComponent(String(limit))}`;

  return request<OdometerSnapshot>(
    `/vehicles/${encodeURIComponent(String(vehicleId))}/odometer${query}`,
  );
}

/**
 * Registra una nueva lectura de odómetro (F03).
 *
 * @param recordedAt Fecha ISO 8601 opcional. Si se omite, el backend usa la
 *                   fecha y hora actuales.
 */
export async function registerOdometerReading(
  vehicleId: number,
  kilometers: number,
  recordedAt?: string,
): Promise<OdometerReading> {
  return request<OdometerReading>(
    `/vehicles/${encodeURIComponent(String(vehicleId))}/odometer`,
    {
      method: 'POST',
      body: JSON.stringify({
        kilometers,
        ...(recordedAt === undefined ? {} : { recordedAt }),
      }),
    },
  );
}

/**
 * Registra un mantenimiento realizado y devuelve la proyección del próximo
 * servicio junto con las advertencias de fábrica (F05).
 */
export async function registerMaintenance(
  data: MaintenanceInput,
): Promise<MaintenanceResponse> {
  return request<MaintenanceResponse>('/maintenance', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/** Consulta el diccionario OBD-II por código DTC (F10). */
export async function getObd2Code(code: string): Promise<Obd2Code> {
  return request<Obd2Code>(`/obd2/${encodeURIComponent(code.trim())}`);
}

// ============================================================================
// Vehículos (F01)
// ============================================================================

/** Motorizaciones aceptadas por el backend. */
export const VEHICLE_ENGINE_TYPES = [
  'GASOLINA',
  'DIESEL',
  'HIBRIDO',
  'ELECTRICO',
] as const;

export type VehicleEngineType = (typeof VEHICLE_ENGINE_TYPES)[number];

export interface Vehicle {
  id: number;
  marca: string;
  modelo: string;
  anio: number;
  tipoMotor: VehicleEngineType;
  alias: string | null;
  placa: string | null;
  kilometrajeInicial: number;
  kilometrajeActual: number;
  /** true si existe especificación de fábrica (F02); si es false, F05 no valida límites. */
  hasFactorySpecs: boolean;
  /** Declaración al alta: al día con la RTV (si es true nunca se alerta como vencido). */
  rtvAlDia: boolean;
  createdAt: string;
}

export interface CreateVehicleInput {
  marca: string;
  modelo: string;
  anio: number;
  tipoMotor: VehicleEngineType;
  kilometrajeInicial: number;
  alias?: string;
  placa?: string;
  /** true = el usuario declara el vehículo al día con la RTV al registrarlo. */
  rtvAlDia?: boolean;
}

/** Lista los vehículos del usuario autenticado. */
export async function listVehicles(): Promise<Vehicle[]> {
  return request<Vehicle[]>('/vehicles');
}

/** Crea un vehículo para el usuario autenticado (F01). */
export async function createVehicle(input: CreateVehicleInput): Promise<Vehicle> {
  return request<Vehicle>('/vehicles', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/** Obtiene un vehículo propio por id. */
export async function getVehicle(vehicleId: number): Promise<Vehicle> {
  return request<Vehicle>(
    `/vehicles/${encodeURIComponent(String(vehicleId))}`,
  );
}

/** Actualiza alias y/o placa de un vehículo propio. */
export async function updateVehicle(
  vehicleId: number,
  input: { alias?: string; placa?: string },
): Promise<Vehicle> {
  return request<Vehicle>(
    `/vehicles/${encodeURIComponent(String(vehicleId))}`,
    { method: 'PATCH', body: JSON.stringify(input) },
  );
}

/** Elimina un vehículo propio (y su historial, por cascada). */
export async function deleteVehicle(vehicleId: number): Promise<void> {
  await request<void>(
    `/vehicles/${encodeURIComponent(String(vehicleId))}`,
    { method: 'DELETE' },
  );
}
