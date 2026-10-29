/**
 * MaintenanceService
 * ----------------------------------------------------------------------------
 * Lógica de negocio para el registro de mantenimientos de AutoMantenimiento Pro.
 *
 * Requerimientos cubiertos:
 *  - F05: registrar un mantenimiento con los intervalos elegidos por el usuario.
 *  - Validar los intervalos contra el catálogo de especificaciones de fábrica
 *    (F02) y marcar `excede_specs_fabricante` cuando corresponda.
 *  - Calcular la proyección del próximo servicio (F07).
 *
 * Nota sobre la bandera:
 *   La columna del esquema se llama `excede_specs_fabricante` y es la que se
 *   persiste. En el dominio se expone como `exceedsManufacturerSpecs`
 *   (equivalente a la "advertencia de exceso de fábrica").
 *
 * Ejemplo de uso:
 *   const pool = new Pool({ connectionString: process.env.DATABASE_URL });
 *   const maintenanceService = new MaintenanceService(pool);
 *   const record = await maintenanceService.registerMaintenance({
 *     vehicleId: 1,
 *     serviceType: 'CAMBIO_ACEITE',
 *     serviceKilometers: 52_300,
 *     kilometerInterval: 10_000,
 *     monthInterval: 12,
 *     cost: 185_000,
 *     shop: 'Taller Central',
 *   });
 */

import type { Pool, QueryResultRow } from 'pg';

/** Valor máximo de un INTEGER de PostgreSQL. */
const MAX_POSTGRES_INTEGER = 2_147_483_647;

/** Valor máximo de un NUMERIC(10, 2). */
const MAX_COST = 99_999_999.99;

/** Longitud máxima de `mantenimientos.taller`. */
const MAX_SHOP_LENGTH = 100;

/**
 * Tipos de servicio soportados, en el mismo orden y con los mismos valores que
 * el ENUM `tipo_servicio` de specs/database-schema.sql.
 */
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

// ============================================================================
// Tipos públicos del servicio
// ============================================================================

/** Datos necesarios para registrar un mantenimiento (F05). */
export interface RegisterMaintenanceInput {
  vehicleId: number;
  serviceType: MaintenanceServiceType;
  /** Fecha del servicio. Si se omite, se usa el momento actual. */
  serviceDate?: Date;
  /** Kilometraje del vehículo al momento del servicio. */
  serviceKilometers: number;
  /** Intervalo en kilómetros elegido por el usuario para el próximo servicio. */
  kilometerInterval: number;
  /** Intervalo en meses elegido por el usuario para el próximo servicio. */
  monthInterval: number;
  /** Costo del servicio. Por defecto 0. */
  cost?: number;
  /** Taller donde se realizó el servicio. */
  shop?: string | null;
  /** Notas libres del servicio. */
  notes?: string | null;
}

/** Límites máximos de fábrica aplicables al tipo de servicio. */
export interface ManufacturerLimits {
  /** Límite en kilómetros, o null si el fabricante no define uno. */
  maxKilometers: number | null;
  /** Límite en meses, o null si el fabricante no define uno. */
  maxMonths: number | null;
}

/** Resultado de comparar los intervalos del usuario contra el catálogo. */
export interface ManufacturerCompliance {
  exceedsLimits: boolean;
  limits: ManufacturerLimits;
  warnings: string[];
}

/** Mantenimiento ya persistido y listo para la capa de presentación. */
export interface MaintenanceRecord {
  id: number;
  vehicleId: number;
  serviceType: MaintenanceServiceType;
  serviceDate: Date;
  serviceKilometers: number;
  kilometerInterval: number;
  monthInterval: number;
  /** Km del próximo servicio, calculado por la columna generada de PostgreSQL. */
  nextServiceKilometers: number;
  cost: number;
  shop: string | null;
  notes: string | null;
  /** Bandera persistida en `mantenimientos.excede_specs_fabricante`. */
  exceedsManufacturerSpecs: boolean;
  /** Detalle de los límites excedidos; es derivado y no se persiste. */
  manufacturerLimitWarnings: string[];
  createdAt: Date;
}

/** Códigos de error estables para la capa HTTP/UI. */
export type MaintenanceServiceErrorCode =
  | 'INVALID_INPUT'
  | 'VEHICLE_NOT_FOUND'
  | 'CATALOG_NOT_FOUND'
  | 'DATABASE_ERROR';

/** Error de dominio del servicio de mantenimientos. */
export class MaintenanceServiceError extends Error {
  public readonly code: MaintenanceServiceErrorCode;
  public readonly originalError?: unknown;

  constructor(
    code: MaintenanceServiceErrorCode,
    message: string,
    originalError?: unknown,
  ) {
    super(message);
    this.name = 'MaintenanceServiceError';
    this.code = code;
    this.originalError = originalError;
    // Conserva el prototipo al compilar a versiones anteriores de ES.
    Object.setPrototypeOf(this, MaintenanceServiceError.prototype);
  }
}

// ============================================================================
// Filas de PostgreSQL (snake_case) y su mapeo al dominio
// ============================================================================

interface VehicleCatalogRow extends QueryResultRow {
  vehicle_id: number;
  catalog_id: number | null;
  brand: string | null;
  model: string | null;
  year_start: number | null;
  year_end: number | null;
  engine_type: string | null;
  oil_max_km: number | null;
  oil_max_months: number | null;
  timing_belt_km: number | null;
}

interface MaintenanceRow extends QueryResultRow {
  id: number;
  vehiculo_id: number;
  tipo_servicio: string;
  fecha_servicio: Date;
  kilometraje_servicio: number;
  intervalo_km_elegido: number;
  intervalo_meses_elegido: number;
  proximo_kilometraje: number;
  costo: string;
  taller: string | null;
  notas: string | null;
  excede_specs_fabricante: boolean;
  created_at: Date;
}

// ============================================================================
// Consultas SQL
// ============================================================================

const SELECT_VEHICLE_AND_CATALOG = `
  SELECT
      v.id                      AS vehicle_id,
      c.id                      AS catalog_id,
      c.marca                   AS brand,
      c.modelo                  AS model,
      c.anio_inicio             AS year_start,
      c.anio_fin                AS year_end,
      c.tipo_motor              AS engine_type,
      c.aceite_km_maximo        AS oil_max_km,
      c.aceite_meses_maximo     AS oil_max_months,
      c.faja_distribucion_km    AS timing_belt_km
    FROM vehiculos v
    LEFT JOIN catalogo_especificaciones c
      ON c.id = v.catalogo_id
   WHERE v.id = $1
`;

const INSERT_MAINTENANCE = `
  INSERT INTO mantenimientos (
      vehiculo_id,
      tipo_servicio,
      fecha_servicio,
      kilometraje_servicio,
      intervalo_km_elegido,
      intervalo_meses_elegido,
      costo,
      taller,
      excede_specs_fabricante,
      notas
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
  RETURNING
      id,
      vehiculo_id,
      tipo_servicio,
      fecha_servicio,
      kilometraje_servicio,
      intervalo_km_elegido,
      intervalo_meses_elegido,
      proximo_kilometraje,
      costo,
      taller,
      notas,
      excede_specs_fabricante,
      created_at
`;

// ============================================================================
// Servicio
// ============================================================================

export class MaintenanceService {
  constructor(private readonly pool: Pool) {}

  /**
   * Registra un mantenimiento realizado (F05).
   *
   * Flujo:
   *  1. Valida los datos de entrada.
   *  2. Consulta el vehículo y su especificación de fábrica.
   *  3. Compara los intervalos elegidos contra los límites del catálogo.
   *  4. Persiste el registro con la bandera `excede_specs_fabricante`.
   *  5. Devuelve el registro con el `proximo_kilometraje` generado por la BD.
   *
   * El próximo kilometraje se calcula como:
   *   proximo_kilometraje = kilometraje_servicio + intervalo_km_elegido
   * PostgreSQL lo almacena mediante la columna generada del esquema; el
   * servicio nunca lo inserta manualmente.
   *
   * @throws {MaintenanceServiceError} INVALID_INPUT, VEHICLE_NOT_FOUND,
   *         CATALOG_NOT_FOUND o DATABASE_ERROR.
   */
  async registerMaintenance(
    input: RegisterMaintenanceInput,
  ): Promise<MaintenanceRecord> {
    const normalized = normalizeInput(input);

    // ------------------------------------------------------------------
    // 1. Vehículo + especificaciones de fábrica
    // ------------------------------------------------------------------
    const { catalog, description } = await this.fetchVehicleAndCatalog(
      normalized.vehicleId,
    );

    // ------------------------------------------------------------------
    // 2. Comparación contra los límites del fabricante
    // ------------------------------------------------------------------
    const limits = getManufacturerLimits(normalized.serviceType, catalog);
    const compliance = evaluateManufacturerCompliance(
      normalized.serviceType,
      limits,
      normalized.kilometerInterval,
      normalized.monthInterval,
      description,
    );

    // ------------------------------------------------------------------
    // 3. Persistencia (proximo_kilometraje es una columna generada)
    // ------------------------------------------------------------------
    const inserted = await this.insertMaintenance(
      normalized,
      compliance.exceedsLimits,
    );

    return mapMaintenance(inserted, compliance.warnings);
  }

  /**
   * Consulta el vehículo y su catálogo. Lanza VEHICLE_NOT_FOUND si el
   * vehículo no existe y CATALOG_NOT_FOUND si no tiene especificaciones
   * asociadas (sin catálogo no es posible validar F05).
   */
  private async fetchVehicleAndCatalog(vehicleId: number): Promise<{
    catalog: {
      oilMaxKilometers: number | null;
      oilMaxMonths: number | null;
      timingBeltKilometers: number | null;
    };
    description: string;
  }> {
    const row = await this.queryVehicleAndCatalog(vehicleId);

    if (!row) {
      throw new MaintenanceServiceError(
        'VEHICLE_NOT_FOUND',
        `No existe un vehículo con id ${vehicleId}.`,
      );
    }

    if (row.catalog_id === null) {
      throw new MaintenanceServiceError(
        'CATALOG_NOT_FOUND',
        `El vehículo ${vehicleId} no tiene especificaciones de fábrica asociadas; no es posible validar los intervalos.`,
      );
    }

    return {
      catalog: {
        oilMaxKilometers: row.oil_max_km,
        oilMaxMonths: row.oil_max_months,
        timingBeltKilometers: row.timing_belt_km,
      },
      description: buildVehicleDescription(row),
    };
  }

  /** Ejecuta la consulta del vehículo y su catálogo, traduciendo errores de BD. */
  private async queryVehicleAndCatalog(
    vehicleId: number,
  ): Promise<VehicleCatalogRow | undefined> {
    try {
      const result = await this.pool.query<VehicleCatalogRow>(
        SELECT_VEHICLE_AND_CATALOG,
        [vehicleId],
      );
      return result.rows[0];
    } catch (error) {
      throw MaintenanceService.toServiceError(
        error,
        'No se pudo consultar el vehículo y su catálogo',
      );
    }
  }

  /** Inserta el mantenimiento y devuelve la fila persistida. */
  private async insertMaintenance(
    input: NormalizedMaintenanceInput,
    exceedsManufacturerSpecs: boolean,
  ): Promise<MaintenanceRow> {
    try {
      const result = await this.pool.query<MaintenanceRow>(
        INSERT_MAINTENANCE,
        [
          input.vehicleId,
          input.serviceType,
          input.serviceDate,
          input.serviceKilometers,
          input.kilometerInterval,
          input.monthInterval,
          input.cost,
          input.shop,
          exceedsManufacturerSpecs,
          input.notes,
        ],
      );

      const row = result.rows[0];

      if (!row) {
        throw new MaintenanceServiceError(
          'DATABASE_ERROR',
          'La base de datos no devolvió el mantenimiento insertado.',
        );
      }

      return row;
    } catch (error) {
      throw MaintenanceService.toServiceError(
        error,
        'No se pudo registrar el mantenimiento',
      );
    }
  }

  /** Normaliza cualquier excepción a un error de dominio del servicio. */
  private static toServiceError(
    error: unknown,
    context: string,
  ): MaintenanceServiceError {
    if (error instanceof MaintenanceServiceError) {
      return error;
    }

    const detail = error instanceof Error ? `: ${error.message}` : '';
    return new MaintenanceServiceError(
      'DATABASE_ERROR',
      `${context}${detail}`,
      error,
    );
  }
}

// ============================================================================
// Validación y cálculo (funciones puras y exportadas para pruebas)
// ============================================================================

interface NormalizedMaintenanceInput {
  vehicleId: number;
  serviceType: MaintenanceServiceType;
  serviceDate: Date;
  serviceKilometers: number;
  kilometerInterval: number;
  monthInterval: number;
  cost: number;
  shop: string | null;
  notes: string | null;
}

function normalizeInput(
  input: RegisterMaintenanceInput,
): NormalizedMaintenanceInput {
  assertPositiveInteger(input.vehicleId, 'vehicleId');
  assertServiceType(input.serviceType);
  assertNonNegativeInteger(input.serviceKilometers, 'serviceKilometers');
  assertPositiveInteger(input.kilometerInterval, 'kilometerInterval');
  assertPositiveInteger(input.monthInterval, 'monthInterval');

  const serviceDate = input.serviceDate ?? new Date();
  assertValidDate(serviceDate, 'serviceDate');

  const cost = input.cost ?? 0;
  assertValidCost(cost);

  const shop = normalizeOptionalText(input.shop, 'shop');
  if (shop !== null && shop.length > MAX_SHOP_LENGTH) {
    throw new MaintenanceServiceError(
      'INVALID_INPUT',
      `shop no puede superar los ${MAX_SHOP_LENGTH} caracteres.`,
    );
  }

  const notes = normalizeOptionalText(input.notes, 'notes');

  // La suma se guarda en un INTEGER de PostgreSQL (columna generada).
  const nextServiceKilometers = calculateNextServiceKilometers(
    input.serviceKilometers,
    input.kilometerInterval,
  );

  if (nextServiceKilometers > MAX_POSTGRES_INTEGER) {
    throw new MaintenanceServiceError(
      'INVALID_INPUT',
      'serviceKilometers + kilometerInterval supera el rango permitido por la base de datos.',
    );
  }

  return {
    vehicleId: input.vehicleId,
    serviceType: input.serviceType,
    serviceDate,
    serviceKilometers: input.serviceKilometers,
    kilometerInterval: input.kilometerInterval,
    monthInterval: input.monthInterval,
    cost: roundToTwoDecimals(cost),
    shop,
    notes,
  };
}

/**
 * Compara los intervalos elegidos contra los límites de fábrica.
 *
 * Límites aplicables según el tipo de servicio:
 *  - CAMBIO_ACEITE / FILTRO_ACEITE: `aceite_km_maximo` y `aceite_meses_maximo`.
 *  - FAJA_DISTRIBUCION: `faja_distribucion_km` (NULL = cadena o no aplica).
 *  - Resto de servicios: el catálogo no define límites específicos.
 *
 * La comparación es inclusiva: igualar el máximo de fábrica NO se considera
 * exceso; superarlo sí.
 */
export function evaluateManufacturerCompliance(
  serviceType: MaintenanceServiceType,
  limits: ManufacturerLimits,
  kilometerInterval: number,
  monthInterval: number,
  vehicleDescription = 'el vehículo',
): ManufacturerCompliance {
  const warnings: string[] = [];

  if (
    limits.maxKilometers !== null &&
    kilometerInterval > limits.maxKilometers
  ) {
    warnings.push(
      `El intervalo de ${kilometerInterval} km para ${serviceType} excede el máximo de fábrica de ${limits.maxKilometers} km (${vehicleDescription}).`,
    );
  }

  if (limits.maxMonths !== null && monthInterval > limits.maxMonths) {
    warnings.push(
      `El intervalo de ${monthInterval} meses para ${serviceType} excede el máximo de fábrica de ${limits.maxMonths} meses (${vehicleDescription}).`,
    );
  }

  return {
    exceedsLimits: warnings.length > 0,
    limits,
    warnings,
  };
}

/**
 * Obtiene los límites de fábrica aplicables a un tipo de servicio.
 * Exportada para que la UI pueda previsualizar la validación si lo necesita.
 */
export function getManufacturerLimits(
  serviceType: MaintenanceServiceType,
  catalog: {
    oilMaxKilometers: number | null;
    oilMaxMonths: number | null;
    timingBeltKilometers: number | null;
  },
): ManufacturerLimits {
  switch (serviceType) {
    case 'CAMBIO_ACEITE':
    case 'FILTRO_ACEITE':
      return {
        maxKilometers: catalog.oilMaxKilometers,
        maxMonths: catalog.oilMaxMonths,
      };

    case 'FAJA_DISTRIBUCION':
      return {
        maxKilometers: catalog.timingBeltKilometers,
        maxMonths: null,
      };

    default:
      return { maxKilometers: null, maxMonths: null };
  }
}

/** Calcula la proyección del próximo servicio (F07). */
export function calculateNextServiceKilometers(
  serviceKilometers: number,
  kilometerInterval: number,
): number {
  return serviceKilometers + kilometerInterval;
}

// ============================================================================
// Helpers internos
// ============================================================================

function mapMaintenance(
  row: MaintenanceRow,
  warnings: string[],
): MaintenanceRecord {
  if (!isMaintenanceServiceType(row.tipo_servicio)) {
    throw new MaintenanceServiceError(
      'DATABASE_ERROR',
      `La base de datos devolvió un tipo de servicio desconocido: ${row.tipo_servicio}.`,
    );
  }

  const cost = Number.parseFloat(row.costo);

  if (!Number.isFinite(cost)) {
    throw new MaintenanceServiceError(
      'DATABASE_ERROR',
      `La base de datos devolvió un costo inválido: ${row.costo}.`,
    );
  }

  return {
    id: row.id,
    vehicleId: row.vehiculo_id,
    serviceType: row.tipo_servicio,
    serviceDate: row.fecha_servicio,
    serviceKilometers: row.kilometraje_servicio,
    kilometerInterval: row.intervalo_km_elegido,
    monthInterval: row.intervalo_meses_elegido,
    nextServiceKilometers: row.proximo_kilometraje,
    cost,
    shop: row.taller,
    notes: row.notas,
    exceedsManufacturerSpecs: row.excede_specs_fabricante,
    manufacturerLimitWarnings: warnings,
    createdAt: row.created_at,
  };
}

function buildVehicleDescription(row: VehicleCatalogRow): string {
  const brand = row.brand ?? 'Vehículo';
  const model = row.model ?? '';
  const years =
    row.year_start === null
      ? ''
      : ` ${row.year_start}-${row.year_end ?? 'actualidad'}`;
  const engine = row.engine_type ? ` ${row.engine_type}` : '';

  return `${brand} ${model}${years}${engine}`.trim().replace(/\s+/g, ' ');
}

function assertPositiveInteger(value: number, fieldName: string): void {
  if (
    !Number.isInteger(value) ||
    value <= 0 ||
    value > MAX_POSTGRES_INTEGER
  ) {
    throw new MaintenanceServiceError(
      'INVALID_INPUT',
      `${fieldName} debe ser un entero mayor a cero.`,
    );
  }
}

function assertNonNegativeInteger(value: number, fieldName: string): void {
  if (
    !Number.isInteger(value) ||
    value < 0 ||
    value > MAX_POSTGRES_INTEGER
  ) {
    throw new MaintenanceServiceError(
      'INVALID_INPUT',
      `${fieldName} debe ser un entero mayor o igual a cero.`,
    );
  }
}

function assertValidCost(value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > MAX_COST) {
    throw new MaintenanceServiceError(
      'INVALID_INPUT',
      `cost debe ser un número entre 0 y ${MAX_COST}.`,
    );
  }
}

function assertValidDate(value: Date, fieldName: string): void {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new MaintenanceServiceError(
      'INVALID_INPUT',
      `${fieldName} debe ser una fecha válida.`,
    );
  }
}

function assertServiceType(
  value: string,
): asserts value is MaintenanceServiceType {
  if (!isMaintenanceServiceType(value)) {
    throw new MaintenanceServiceError(
      'INVALID_INPUT',
      `serviceType no es válido. Valores permitidos: ${MAINTENANCE_SERVICE_TYPES.join(', ')}.`,
    );
  }
}

function isMaintenanceServiceType(
  value: string,
): value is MaintenanceServiceType {
  return (MAINTENANCE_SERVICE_TYPES as readonly string[]).includes(value);
}

function normalizeOptionalText(
  value: string | null | undefined,
  fieldName: string,
): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    throw new MaintenanceServiceError(
      'INVALID_INPUT',
      `${fieldName} debe ser texto.`,
    );
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function roundToTwoDecimals(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
