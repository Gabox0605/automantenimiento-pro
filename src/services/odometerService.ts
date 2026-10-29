/**
 * OdometerService
 * ----------------------------------------------------------------------------
 * Lógica de negocio para el seguimiento de kilometraje de AutoMantenimiento Pro.
 *
 * Requerimientos cubiertos:
 *  - F03: registrar una lectura diaria de odómetro.
 *  - F04: calcular la tasa de uso promedio diario y semanal.
 *
 * La validación de "la lectura no puede ser menor a la última registrada" se
 * hace dentro de una transacción y con un bloqueo de la fila del vehículo
 * (SELECT ... FOR UPDATE) para evitar condiciones de carrera cuando llegan
 * lecturas concurrentes.
 *
 * Ejemplo de uso:
 *   const pool = new Pool({ connectionString: process.env.DATABASE_URL });
 *   const odometerService = new OdometerService(pool);
 *   const reading = await odometerService.registerReading({
 *     vehicleId: 1,
 *     kilometers: 52_500,
 *   });
 */

import type { Pool, PoolClient, QueryResultRow } from 'pg';

/** Milisegundos que tiene un día; se usan para calcular la tasa de uso. */
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Límite de un INTEGER de PostgreSQL, para validar antes de llegar a la BD. */
const MAX_POSTGRES_INTEGER = 2_147_483_647;

// ============================================================================
// Tipos públicos del servicio
// ============================================================================

/** Lectura de odómetro ya persistida. */
export interface OdometerReading {
  id: number;
  vehicleId: number;
  kilometers: number;
  recordedAt: Date;
}

/** Datos de entrada para registrar una lectura (F03). */
export interface RegisterOdometerReadingInput {
  vehicleId: number;
  kilometers: number;
  /** Fecha de la lectura. Si se omite, se usa el momento actual. */
  recordedAt?: Date;
}

/** Resultado del cálculo de la tasa de uso (F04). */
export interface OdometerUsageRate {
  vehicleId: number;
  previousReading: OdometerReading;
  currentReading: OdometerReading;
  /** Kilómetros recorridos entre las dos lecturas. */
  kilometersDriven: number;
  /** Días transcurridos entre las dos lecturas (con decimales). */
  daysElapsed: number;
  /** Promedio de kilómetros por día. */
  dailyAverageKm: number;
  /** Proyección semanal del promedio diario. */
  weeklyAverageKm: number;
}

/** Códigos de error estables para que la capa HTTP/UI pueda reaccionar. */
export type OdometerServiceErrorCode =
  | 'INVALID_INPUT'
  | 'VEHICLE_NOT_FOUND'
  | 'READING_TOO_LOW'
  | 'INSUFFICIENT_READINGS'
  | 'NO_ELAPSED_TIME'
  | 'INCONSISTENT_READINGS'
  | 'DATABASE_ERROR';

/**
 * Error de dominio del servicio de odómetro.
 * Conserva el error original para logging sin exponer detalles técnicos a la UI.
 */
export class OdometerServiceError extends Error {
  public readonly code: OdometerServiceErrorCode;
  public readonly originalError?: unknown;

  constructor(
    code: OdometerServiceErrorCode,
    message: string,
    originalError?: unknown,
  ) {
    super(message);
    this.name = 'OdometerServiceError';
    this.code = code;
    this.originalError = originalError;
    // Necesario para conservar el prototipo al compilar a ES5.
    Object.setPrototypeOf(this, OdometerServiceError.prototype);
  }
}

// ============================================================================
// Filas que devuelve PostgreSQL (snake_case) y su mapeo al dominio
// ============================================================================

interface OdometerLogRow extends QueryResultRow {
  id: number;
  vehiculo_id: number;
  kilometraje: number;
  fecha_registro: Date;
}

interface VehicleRow extends QueryResultRow {
  id: number;
  kilometraje_inicial: number;
}

interface VehicleIdRow extends QueryResultRow {
  id: number;
}

function mapReading(row: OdometerLogRow): OdometerReading {
  return {
    id: row.id,
    vehicleId: row.vehiculo_id,
    kilometers: row.kilometraje,
    recordedAt: row.fecha_registro,
  };
}

// ============================================================================
// Consultas SQL
// ============================================================================

const SELECT_VEHICLE_FOR_UPDATE = `
  SELECT id, kilometraje_inicial
    FROM vehiculos
   WHERE id = $1
   FOR UPDATE
`;

const SELECT_LATEST_READING = `
  SELECT id, vehiculo_id, kilometraje, fecha_registro
    FROM odometro_logs
   WHERE vehiculo_id = $1
   ORDER BY fecha_registro DESC, id DESC
   LIMIT 1
`;

const SELECT_LAST_TWO_READINGS = `
  SELECT id, vehiculo_id, kilometraje, fecha_registro
    FROM odometro_logs
   WHERE vehiculo_id = $1
   ORDER BY fecha_registro DESC, id DESC
   LIMIT 2
`;

const INSERT_READING = `
  INSERT INTO odometro_logs (vehiculo_id, kilometraje, fecha_registro)
  VALUES ($1, $2, $3)
  RETURNING id, vehiculo_id, kilometraje, fecha_registro
`;

// ============================================================================
// Servicio
// ============================================================================

export class OdometerService {
  constructor(private readonly pool: Pool) {}

  /**
   * Registra una nueva lectura de odómetro para un vehículo (F03).
   *
   * Reglas:
   *  1. La lectura debe ser un entero >= 0.
   *  2. Debe ser mayor o igual a la última lectura registrada.
   *  3. Si el vehículo no tiene lecturas, debe ser >= su kilometraje inicial.
   *
   * El trigger `trg_odometro_actualiza_vehiculo` del esquema se encarga de
   * actualizar `vehiculos.kilometraje_actual`; este servicio además bloquea la
   * fila del vehículo para serializar registros concurrentes.
   *
   * @throws {OdometerServiceError} INVALID_INPUT, VEHICLE_NOT_FOUND,
   *         READING_TOO_LOW o DATABASE_ERROR.
   */
  async registerReading(input: RegisterOdometerReadingInput): Promise<OdometerReading> {
    assertPositiveInteger(input.vehicleId, 'vehicleId');
    assertOdometerValue(input.kilometers, 'kilometers');

    const recordedAt = input.recordedAt ?? new Date();
    assertValidDate(recordedAt, 'recordedAt');

    let client: PoolClient | undefined;

    try {
      client = await this.pool.connect();
      await client.query('BEGIN');

      // Bloquea el vehículo para que dos lecturas simultáneas del mismo
      // vehículo no validen contra el mismo registro anterior.
      const vehicleResult = await client.query<VehicleRow>(
        SELECT_VEHICLE_FOR_UPDATE,
        [input.vehicleId],
      );
      const vehicle = vehicleResult.rows[0];

      if (!vehicle) {
        throw new OdometerServiceError(
          'VEHICLE_NOT_FOUND',
          `No existe un vehículo con id ${input.vehicleId}.`,
        );
      }

      const lastReadingResult = await client.query<OdometerLogRow>(
        SELECT_LATEST_READING,
        [input.vehicleId],
      );
      const lastReading = lastReadingResult.rows[0]
        ? mapReading(lastReadingResult.rows[0])
        : undefined;

      // La lectura nunca puede retroceder por debajo de la última registrada
      // ni del kilometraje con el que se dio de alta el vehículo.
      const minimumAllowed = Math.max(
        vehicle.kilometraje_inicial,
        lastReading?.kilometers ?? 0,
      );

      if (input.kilometers < minimumAllowed) {
        const reference = lastReading
          ? `la última lectura registrada (${lastReading.kilometers} km)`
          : `el kilometraje inicial del vehículo (${minimumAllowed} km)`;

        throw new OdometerServiceError(
          'READING_TOO_LOW',
          `La lectura de ${input.kilometers} km no puede ser menor a ${reference}.`,
        );
      }

      const insertResult = await client.query<OdometerLogRow>(INSERT_READING, [
        input.vehicleId,
        input.kilometers,
        recordedAt,
      ]);
      const inserted = insertResult.rows[0];

      if (!inserted) {
        throw new OdometerServiceError(
          'DATABASE_ERROR',
          'La base de datos no devolvió la lectura insertada.',
        );
      }

      await client.query('COMMIT');
      return mapReading(inserted);
    } catch (error) {
      if (client) {
        try {
          await client.query('ROLLBACK');
        } catch {
          // Si la conexión ya se perdió, no hay nada que revertir.
        }
      }

      throw OdometerService.toServiceError(
        error,
        'No se pudo registrar la lectura de odómetro',
      );
    } finally {
      client?.release();
    }
  }

  /**
   * Calcula la tasa de uso promedio (F04) comparando las dos últimas lecturas
   * del vehículo.
   *
   * Fórmula:
   *   tasa_diaria = (km_actual - km_anterior) / días_transcurridos
   *   tasa_semanal = tasa_diaria * 7
   *
   * Se usan las lecturas ordenadas por fecha (y por id como desempate) para
   * que el cálculo sea determinista ante registros con la misma fecha.
   *
   * @throws {OdometerServiceError} INVALID_INPUT, VEHICLE_NOT_FOUND,
   *         INSUFFICIENT_READINGS, NO_ELAPSED_TIME, INCONSISTENT_READINGS
   *         o DATABASE_ERROR.
   */
  async calculateDailyUsageRate(vehicleId: number): Promise<OdometerUsageRate> {
    assertPositiveInteger(vehicleId, 'vehicleId');

    const readings = await this.fetchLastTwoReadings(vehicleId);
    const [currentRow, previousRow] = readings;

    if (currentRow === undefined || previousRow === undefined) {
      // Distingue entre "vehículo inexistente" y "aún no hay suficientes
      // lecturas", para que la UI muestre el mensaje correcto.
      await this.assertVehicleExists(vehicleId);

      throw new OdometerServiceError(
        'INSUFFICIENT_READINGS',
        `El vehículo ${vehicleId} necesita al menos dos lecturas de odómetro para calcular la tasa de uso.`,
      );
    }

    const currentReading = mapReading(currentRow);
    const previousReading = mapReading(previousRow);

    return computeUsageRate(vehicleId, previousReading, currentReading);
  }

  /** Obtiene las dos lecturas más recientes del vehículo. */
  private async fetchLastTwoReadings(
    vehicleId: number,
  ): Promise<OdometerLogRow[]> {
    try {
      const result = await this.pool.query<OdometerLogRow>(
        SELECT_LAST_TWO_READINGS,
        [vehicleId],
      );
      return result.rows;
    } catch (error) {
      throw OdometerService.toServiceError(
        error,
        'No se pudo consultar el historial de odómetro',
      );
    }
  }

  /** Verifica la existencia del vehículo solo cuando hace falta reportarlo. */
  private async assertVehicleExists(vehicleId: number): Promise<void> {
    try {
      const result = await this.pool.query<VehicleIdRow>(
        'SELECT id FROM vehiculos WHERE id = $1',
        [vehicleId],
      );

      if (result.rows.length === 0) {
        throw new OdometerServiceError(
          'VEHICLE_NOT_FOUND',
          `No existe un vehículo con id ${vehicleId}.`,
        );
      }
    } catch (error) {
      throw OdometerService.toServiceError(
        error,
        'No se pudo verificar el vehículo',
      );
    }
  }

  /** Normaliza cualquier excepción a un error de dominio del servicio. */
  private static toServiceError(
    error: unknown,
    context: string,
  ): OdometerServiceError {
    if (error instanceof OdometerServiceError) {
      return error;
    }

    const detail = error instanceof Error ? `: ${error.message}` : '';
    return new OdometerServiceError(
      'DATABASE_ERROR',
      `${context}${detail}`,
      error,
    );
  }
}

// ============================================================================
// Cálculo puro (exportado para poder probarlo sin base de datos)
// ============================================================================

/**
 * Calcula la tasa de uso a partir de dos lecturas ya obtenidas.
 *
 * @throws {OdometerServiceError} NO_ELAPSED_TIME si las fechas no permiten
 *         calcular una tasa, o INCONSISTENT_READINGS si el odómetro retrocede.
 */
export function computeUsageRate(
  vehicleId: number,
  previousReading: OdometerReading,
  currentReading: OdometerReading,
): OdometerUsageRate {
  const millisecondsElapsed =
    currentReading.recordedAt.getTime() - previousReading.recordedAt.getTime();
  const daysElapsed = millisecondsElapsed / MS_PER_DAY;

  if (!Number.isFinite(daysElapsed) || daysElapsed <= 0) {
    throw new OdometerServiceError(
      'NO_ELAPSED_TIME',
      'Las dos últimas lecturas deben tener fechas distintas y crecientes para calcular la tasa de uso.',
    );
  }

  const kilometersDriven =
    currentReading.kilometers - previousReading.kilometers;

  if (kilometersDriven < 0) {
    throw new OdometerServiceError(
      'INCONSISTENT_READINGS',
      `El odómetro retrocedió: la lectura actual (${currentReading.kilometers} km) es menor a la anterior (${previousReading.kilometers} km).`,
    );
  }

  const dailyAverage = kilometersDriven / daysElapsed;

  return {
    vehicleId,
    previousReading,
    currentReading,
    kilometersDriven,
    daysElapsed: roundToTwoDecimals(daysElapsed),
    dailyAverageKm: roundToTwoDecimals(dailyAverage),
    weeklyAverageKm: roundToTwoDecimals(dailyAverage * 7),
  };
}

// ============================================================================
// Helpers de validación y formato
// ============================================================================

function assertPositiveInteger(value: number, fieldName: string): void {
  if (
    !Number.isInteger(value) ||
    value <= 0 ||
    value > MAX_POSTGRES_INTEGER
  ) {
    throw new OdometerServiceError(
      'INVALID_INPUT',
      `${fieldName} debe ser un entero mayor a cero.`,
    );
  }
}

function assertOdometerValue(value: number, fieldName: string): void {
  if (
    !Number.isInteger(value) ||
    value < 0 ||
    value > MAX_POSTGRES_INTEGER
  ) {
    throw new OdometerServiceError(
      'INVALID_INPUT',
      `${fieldName} debe ser un entero mayor o igual a cero.`,
    );
  }
}

function assertValidDate(value: Date, fieldName: string): void {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new OdometerServiceError(
      'INVALID_INPUT',
      `${fieldName} debe ser una fecha válida.`,
    );
  }
}

function roundToTwoDecimals(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
