/**
 * Servicio de vehículos (F01 — Registro y Selección de Vehículo).
 * ----------------------------------------------------------------------------
 * Multitenant: TODAS las operaciones filtran por `usuario_id` (= claim `sub`
 * del JWT de Supabase Auth). Esto es lo que cierra BOLA/IDOR: un usuario solo
 * puede leer, modificar o borrar sus propios vehículos, y ante un id ajeno se
 * responde VEHICLE_NOT_FOUND (no se revela si el recurso existe).
 *
 * Al crear, se intenta resolver `catalogo_id` contra el catálogo de fábrica
 * (F02). Si no hay coincidencia, el vehículo se da de alta igualmente con
 * `catalogo_id = NULL`: podrá registrar odometro y mantenimientos, y la
 * validación de límites de fábrica (F05) queda desactivada para él.
 */

import { Pool, type QueryResultRow } from 'pg';

// ============================================================================
// Dominio
// ============================================================================

/** Motorizaciones soportadas (esquema ENUM `tipo_motor`). */
export const VEHICLE_ENGINE_TYPES = [
  'GASOLINA',
  'DIESEL',
  'HIBRIDO',
  'ELECTRICO',
] as const;

export type VehicleEngineType = (typeof VEHICLE_ENGINE_TYPES)[number];

/**
 * Unidades en las que el tablero del vehículo registra distancia
 * (esquema ENUM `unidad_distancia`).
 *
 * Solo gobierna la interpretación de la ENTRADA del usuario: en la base de
 * datos se almacena SIEMPRE kilómetros, de modo que la validación de límites
 * de fábrica (F05) y los mensajes del backend nunca requieren conversiones.
 */
export const DISTANCE_UNITS = ['KM', 'MI'] as const;

export type DistanceUnit = (typeof DISTANCE_UNITS)[number];

export type VehicleServiceErrorCode =
  | 'INVALID_INPUT'
  | 'VEHICLE_NOT_FOUND'
  | 'PLACA_DUPLICADA'
  | 'DATABASE_ERROR';

/** Error de dominio del servicio de vehículos. */
export class VehicleServiceError extends Error {
  public readonly code: VehicleServiceErrorCode;
  public readonly originalError?: unknown;

  constructor(
    code: VehicleServiceErrorCode,
    message: string,
    originalError?: unknown,
  ) {
    super(message);
    this.name = 'VehicleServiceError';
    this.code = code;
    this.originalError = originalError;
    Object.setPrototypeOf(this, VehicleServiceError.prototype);
  }
}

export interface CreateVehicleInput {
  marca: string;
  modelo: string;
  anio: number;
  tipoMotor: VehicleEngineType;
  kilometrajeInicial: number;
  /**
   * Unidad en la que el usuario ESCRIBE las distancias de este vehículo.
   * `MI` implica que el cliente convierte a kilómetros antes de enviar; este
   * servicio siempre recibe y guarda kilómetros. Por defecto `KM`.
   */
  unidadDistancia?: DistanceUnit;
  /** Nombre amigable, opcional (ej. "Mi Corolla"). */
  alias?: string | null;
  /** Patente, opcional. Debe ser única por usuario. */
  placa?: string | null;
  /**
   * Declaración de que el vehículo está al día con la RTV (Revisión Técnica
   * Vehicular). Por defecto false: sin declararlo, un mes de RTV ya pasado se
   * alerta como vencido (comportamiento histórico).
   */
  rtvAlDia?: boolean;
}

export interface UpdateVehicleInput {
  alias?: string | null;
  placa?: string | null;
}

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
  /** true si el vehículo tiene especificaciones de fábrica (F02) asociadas. */
  hasFactorySpecs: boolean;
  /** Unidad en la que el tablero del vehículo registra (KM o MI). */
  unidadDistancia: DistanceUnit;
  /** Declaración del usuario: al día con la RTV al dar de alta. */
  rtvAlDia: boolean;
  createdAt: Date;
}

// ============================================================================
// Filas PostgreSQL
// ============================================================================

interface VehicleRow extends QueryResultRow {
  id: number;
  marca: string;
  modelo: string;
  anio: number;
  tipo_motor: string;
  alias: string | null;
  placa: string | null;
  kilometraje_inicial: number;
  kilometraje_actual: number;
  catalogo_id: number | null;
  unidad_distancia: string;
  rtv_al_dia: boolean;
  created_at: Date;
}

function mapVehicle(row: VehicleRow): Vehicle {
  return {
    id: row.id,
    marca: row.marca,
    modelo: row.modelo,
    anio: row.anio,
    tipoMotor: row.tipo_motor as VehicleEngineType,
    alias: row.alias,
    placa: row.placa,
    kilometrajeInicial: row.kilometraje_inicial,
    kilometrajeActual: row.kilometraje_actual,
    hasFactorySpecs: row.catalogo_id !== null,
    unidadDistancia: row.unidad_distancia as DistanceUnit,
    rtvAlDia: row.rtv_al_dia,
    createdAt: row.created_at,
  };
}

// ============================================================================
// Consultas SQL (prepared statements; nunca interpolación de strings)
// ============================================================================

const VEHICLE_COLUMNS = `
      id,
      marca,
      modelo,
      anio,
      tipo_motor,
      alias,
      placa,
      kilometraje_inicial,
      kilometraje_actual,
      catalogo_id,
      unidad_distancia,
      rtv_al_dia,
      created_at`;

/** Alta: resuelve el catálogo de fábrica (F02) en la misma sentencia. */
const INSERT_VEHICLE = `
  INSERT INTO vehiculos (
      usuario_id,
      catalogo_id,
      marca,
      modelo,
      anio,
      tipo_motor,
      alias,
      placa,
      kilometraje_inicial,
      kilometraje_actual,
      rtv_al_dia,
      unidad_distancia
  )
  VALUES (
      $1,
      (
          SELECT id
            FROM catalogo_especificaciones
           WHERE upper(marca)  = upper($2)
             AND upper(modelo) = upper($3)
             AND tipo_motor    = $4::tipo_motor
             AND $5::integer BETWEEN anio_inicio AND COALESCE(anio_fin, 2100)
           LIMIT 1
      ),
      $2, $3, $5, $4, $6, $7, $8, $8, $9, $10::unidad_distancia
  )
  RETURNING${VEHICLE_COLUMNS}
`;

const SELECT_OWNED_VEHICLE = `
  SELECT${VEHICLE_COLUMNS}
    FROM vehiculos
   WHERE id = $1 AND usuario_id = $2
`;

const LIST_OWNED_VEHICLES = `
  SELECT${VEHICLE_COLUMNS}
    FROM vehiculos
   WHERE usuario_id = $1
   ORDER BY created_at DESC, id DESC
`;

const UPDATE_OWNED_VEHICLE = `
  UPDATE vehiculos
     SET alias = $3,
         placa = $4
   WHERE id = $1 AND usuario_id = $2
  RETURNING${VEHICLE_COLUMNS}
`;

const DELETE_OWNED_VEHICLE = `
  DELETE FROM vehiculos
   WHERE id = $1 AND usuario_id = $2
  RETURNING id
`;

// ============================================================================
// Validación
// ============================================================================

const MAX_POSTGRES_INTEGER = 2_147_483_647;
const MIN_VEHICLE_YEAR = 1900;
const MAX_VEHICLE_YEAR = 2100;

function invalid(message: string): never {
  throw new VehicleServiceError('INVALID_INPUT', message);
}

/** Cadena obligatoria, recortada y sin exceder el máximo de la columna. */
function assertRequiredText(
  value: unknown,
  field: string,
  maxLength: number,
): string {
  if (typeof value !== 'string') {
    invalid(`El campo "${field}" debe ser una cadena de texto.`);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    invalid(`El campo "${field}" no puede estar vacío.`);
  }
  if (trimmed.length > maxLength) {
    invalid(`El campo "${field}" no puede superar ${maxLength} caracteres.`);
  }
  return trimmed;
}

/** Cadena opcional: `null`/vacío → null. */
function optionalText(
  value: unknown,
  field: string,
  maxLength: number,
): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    invalid(`El campo "${field}" debe ser una cadena de texto.`);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > maxLength) {
    invalid(`El campo "${field}" no puede superar ${maxLength} caracteres.`);
  }
  return trimmed;
}

function assertYear(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    invalid('El campo "anio" debe ser un número entero (ej. 2018).');
  }
  if (value < MIN_VEHICLE_YEAR || value > MAX_VEHICLE_YEAR) {
    invalid(
      `El campo "anio" debe estar entre ${MIN_VEHICLE_YEAR} y ${MAX_VEHICLE_YEAR}.`,
    );
  }
  return value;
}

function assertNonNegativeInteger(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    invalid(`El campo "${field}" debe ser un número entero.`);
  }
  if (value < 0 || value > MAX_POSTGRES_INTEGER) {
    invalid(`El campo "${field}" debe estar entre 0 y ${MAX_POSTGRES_INTEGER}.`);
  }
  return value;
}

function assertEngineType(value: unknown): VehicleEngineType {
  if (
    typeof value !== 'string' ||
    !(VEHICLE_ENGINE_TYPES as readonly string[]).includes(value)
  ) {
    invalid(
      `El campo "tipoMotor" debe ser uno de: ${VEHICLE_ENGINE_TYPES.join(', ')}.`,
    );
  }
  return value as VehicleEngineType;
}

/**
 * Booleano opcional con valor por defecto `false`.
 *
 * `false` conserva el comportamiento histórico de la RTV: un mes de RTV ya
 * pasado se alerta como vencido.
 */
function assertOptionalBoolean(value: unknown, field: string): boolean {
  if (value === undefined || value === null) {
    return false;
  }
  if (typeof value !== 'boolean') {
    invalid(`El campo "${field}" debe ser verdadero o falso.`);
  }
  return value;
}

/** Unidad de distancia opcional con valor por defecto `KM`. */
function assertDistanceUnit(value: unknown): DistanceUnit {
  if (value === undefined || value === null) {
    return 'KM';
  }
  if (
    typeof value !== 'string' ||
    !(DISTANCE_UNITS as readonly string[]).includes(value)
  ) {
    invalid(
      `El campo "unidadDistancia" debe ser uno de: ${DISTANCE_UNITS.join(', ')}.`,
    );
  }
  return value as DistanceUnit;
}

/** Traduce la violación de UNIQUE de placa a un error de dominio amigable. */
function translateDatabaseError(error: unknown, context: string): never {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code: unknown }).code)
      : undefined;

  if (code === '23505') {
    const constraint =
      typeof error === 'object' && error !== null && 'constraint' in error
        ? String((error as { constraint: unknown }).constraint)
        : '';

    if (constraint.includes('placa')) {
      throw new VehicleServiceError(
        'PLACA_DUPLICADA',
        'Ya registraste un vehículo con esa placa.',
        error,
      );
    }
  }

  throw new VehicleServiceError(
    'DATABASE_ERROR',
    `No se pudo ${context}.`,
    error,
  );
}

// ============================================================================
// Servicio
// ============================================================================

export class VehicleService {
  constructor(private readonly pool: Pool) {}

  /** Lista los vehículos del usuario autenticado. */
  async list(userId: string): Promise<Vehicle[]> {
    const result = await this.pool.query<VehicleRow>(LIST_OWNED_VEHICLES, [
      userId,
    ]);
    return result.rows.map(mapVehicle);
  }

  /** Crea un vehículo para el usuario autenticado (F01). */
  async create(userId: string, input: CreateVehicleInput): Promise<Vehicle> {
    const marca = assertRequiredText(input.marca, 'marca', 50);
    const modelo = assertRequiredText(input.modelo, 'modelo', 50);
    const anio = assertYear(input.anio);
    const tipoMotor = assertEngineType(input.tipoMotor);
    const kilometrajeInicial = assertNonNegativeInteger(
      input.kilometrajeInicial,
      'kilometrajeInicial',
    );
    const alias = optionalText(input.alias, 'alias', 50);
    const placa = optionalText(input.placa, 'placa', 20);
    const rtvAlDia = assertOptionalBoolean(input.rtvAlDia, 'rtvAlDia');
    const unidadDistancia = assertDistanceUnit(input.unidadDistancia);

    try {
      // kilometrajeInicial llega SIEMPRE en kilómetros: si el vehículo
      // registra en millas, el cliente convierte antes de enviar.
      const result = await this.pool.query<VehicleRow>(INSERT_VEHICLE, [
        userId,
        marca,
        modelo,
        tipoMotor,
        anio,
        alias,
        placa,
        kilometrajeInicial,
        rtvAlDia,
        unidadDistancia,
      ]);

      const row = result.rows[0];
      if (!row) {
        throw new VehicleServiceError(
          'DATABASE_ERROR',
          'No se pudo dar de alta el vehículo.',
        );
      }

      return mapVehicle(row);
    } catch (error) {
      translateDatabaseError(error, 'dar de alta el vehículo');
    }
  }

  /** Obtiene un vehículo del usuario; si no le pertenece, VEHICLE_NOT_FOUND. */
  async get(userId: string, vehicleId: number): Promise<Vehicle> {
    const result = await this.pool.query<VehicleRow>(SELECT_OWNED_VEHICLE, [
      vehicleId,
      userId,
    ]);

    const row = result.rows[0];
    if (!row) {
      throw new VehicleServiceError(
        'VEHICLE_NOT_FOUND',
        `No existe un vehículo con id ${vehicleId}.`,
      );
    }

    return mapVehicle(row);
  }

  /** Actualiza datos editables (alias, placa) de un vehículo propio. */
  async update(
    userId: string,
    vehicleId: number,
    input: UpdateVehicleInput,
  ): Promise<Vehicle> {
    // Si el campo no viene en el payload, se conserva el valor actual.
    const current = await this.get(userId, vehicleId);

    const alias =
      input.alias === undefined
        ? current.alias
        : optionalText(input.alias, 'alias', 50);
    const placa =
      input.placa === undefined
        ? current.placa
        : optionalText(input.placa, 'placa', 20);

    try {
      const result = await this.pool.query<VehicleRow>(UPDATE_OWNED_VEHICLE, [
        vehicleId,
        userId,
        alias,
        placa,
      ]);

      const row = result.rows[0];
      if (!row) {
        throw new VehicleServiceError(
          'VEHICLE_NOT_FOUND',
          `No existe un vehículo con id ${vehicleId}.`,
        );
      }

      return mapVehicle(row);
    } catch (error) {
      if (error instanceof VehicleServiceError) throw error;
      translateDatabaseError(error, 'actualizar el vehículo');
    }
  }

  /** Elimina un vehículo propio (cascada a odómetro y mantenimientos). */
  async remove(userId: string, vehicleId: number): Promise<void> {
    const result = await this.pool.query(DELETE_OWNED_VEHICLE, [
      vehicleId,
      userId,
    ]);

    if (result.rowCount === 0) {
      throw new VehicleServiceError(
        'VEHICLE_NOT_FOUND',
        `No existe un vehículo con id ${vehicleId}.`,
      );
    }
  }

  /**
   * Verifica que el vehículo pertenezca al usuario.
   *
   * Se usa en las rutas de odómetro y mantenimiento antes de delegar en sus
   * servicios, para que un id ajeno produzca 404 sin ejecutar ninguna
   * operación (defensa contra BOLA/IDOR).
   */
  async assertOwnership(userId: string, vehicleId: number): Promise<void> {
    const result = await this.pool.query<{ id: number }>(
      'SELECT id FROM vehiculos WHERE id = $1 AND usuario_id = $2',
      [vehicleId, userId],
    );

    if (result.rowCount === 0) {
      throw new VehicleServiceError(
        'VEHICLE_NOT_FOUND',
        `No existe un vehículo con id ${vehicleId}.`,
      );
    }
  }
}
