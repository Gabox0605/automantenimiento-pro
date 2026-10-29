/**
 * Punto de entrada de AutoMantenimiento Pro.
 * ----------------------------------------------------------------------------
 * Este archivo configura la conexión a PostgreSQL, inyecta el pool en los
 * servicios y ejecuta un flujo de prueba de los requerimientos F03, F04, F05
 * y F10.
 *
 * Uso:
 *   DATABASE_URL=postgres://usuario:clave@localhost:5432/auto_mantenimiento_pro \
 *     npm run dev
 *
 * El vehículo demo es el del seed (id 1). Se puede cambiar con la variable
 * de entorno DEMO_VEHICLE_ID.
 */

import { Pool } from 'pg';
import type { QueryResultRow } from 'pg';

import {
  OdometerService,
  OdometerServiceError,
} from './services/odometerService.js';
import {
  MaintenanceService,
  MaintenanceServiceError,
} from './services/maintenanceService.js';
import {
  Obd2Service,
  Obd2ServiceError,
} from './services/obd2Service.js';

/** Vehículo del seed usado por defecto para el flujo de prueba. */
const DEFAULT_DEMO_VEHICLE_ID = 1;

/** Kilómetros que se suman al odómetro actual para generar la lectura demo. */
const DEMO_ODOMETER_INCREMENT_KM = 100;

/** Intervalo de aceite que supera el límite de fábrica del seed (10 000 km). */
const DEMO_OIL_INTERVAL_KM = 12_000;
const DEMO_OIL_INTERVAL_MONTHS = 12;

interface DemoVehicleRow extends QueryResultRow {
  kilometraje_actual: number;
  placa: string | null;
}

/**
 * Flujo principal de prueba.
 *
 * Crea el pool, ejecuta F03 → F04 → F05 → F10 y garantiza el cierre de la
 * conexión tanto en el camino feliz como ante cualquier error.
 */
export async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL?.trim();

  if (!connectionString) {
    throw new Error(
      'DATABASE_URL no está definida. Ejemplo: postgres://usuario:clave@localhost:5432/auto_mantenimiento_pro',
    );
  }

  const vehicleId = readDemoVehicleId();
  const pool = new Pool({ connectionString });

  // Evita que un error en un cliente inactivo tumbe el proceso sin log.
  pool.on('error', (error) => {
    console.error('Error inesperado en un cliente de PostgreSQL:', error);
  });

  // Inyección de dependencias: los servicios reciben el mismo pool.
  const odometerService = new OdometerService(pool);
  const maintenanceService = new MaintenanceService(pool);
  const obd2Service = new Obd2Service(pool);

  try {
    console.log('AutoMantenimiento Pro — flujo de prueba');
    console.log('-----------------------------------------');

    // ------------------------------------------------------------------
    // Datos del vehículo demo
    // ------------------------------------------------------------------
    const vehicleResult = await pool.query<DemoVehicleRow>(
      `SELECT kilometraje_actual, placa
         FROM vehiculos
        WHERE id = $1`,
      [vehicleId],
    );
    const vehicle = vehicleResult.rows[0];

    if (!vehicle) {
      throw new Error(
        `No existe el vehículo demo con id ${vehicleId}. Ejecuta specs/database-schema.sql para cargar el seed.`,
      );
    }

    console.log(
      `Vehículo: ${vehicle.placa ?? `id ${vehicleId}`} — ${vehicle.kilometraje_actual} km actuales`,
    );

    // ------------------------------------------------------------------
    // F03: registrar una lectura de odómetro
    // ------------------------------------------------------------------
    // Se parte del kilometraje actual para que la lectura sea siempre
    // creciente, incluso si el flujo se ejecuta varias veces.
    const testKilometers =
      vehicle.kilometraje_actual + DEMO_ODOMETER_INCREMENT_KM;

    const reading = await odometerService.registerReading({
      vehicleId,
      kilometers: testKilometers,
    });

    console.log(
      `[F03] Lectura registrada: ${reading.kilometers} km (${formatDate(reading.recordedAt)})`,
    );

    // ------------------------------------------------------------------
    // F04: tasa de uso promedio diario y semanal
    // ------------------------------------------------------------------
    const usage = await odometerService.calculateDailyUsageRate(vehicleId);

    console.log(
      `[F04] Tasa de uso: ${usage.dailyAverageKm} km/día — ${usage.weeklyAverageKm} km/semana`,
    );
    console.log(
      `      (${usage.kilometersDriven} km recorridos en ${usage.daysElapsed} días)`,
    );

    // ------------------------------------------------------------------
    // F05: registrar un cambio de aceite
    // ------------------------------------------------------------------
    // El intervalo de 12 000 km supera el máximo de fábrica del Corolla del
    // seed (10 000 km), por lo que se espera la advertencia.
    const maintenance = await maintenanceService.registerMaintenance({
      vehicleId,
      serviceType: 'CAMBIO_ACEITE',
      serviceKilometers: reading.kilometers,
      kilometerInterval: DEMO_OIL_INTERVAL_KM,
      monthInterval: DEMO_OIL_INTERVAL_MONTHS,
      cost: 185_000,
      shop: 'Taller Demo',
      notes: 'Registro generado por el flujo de prueba de src/index.ts',
    });

    console.log(
      `[F05] Mantenimiento registrado: ${maintenance.serviceType} a los ${maintenance.serviceKilometers} km`,
    );
    console.log(
      `      Próximo kilometraje proyectado: ${maintenance.nextServiceKilometers} km`,
    );

    if (maintenance.exceedsManufacturerSpecs) {
      console.log('      ADVERTENCIA: los intervalos exceden las especificaciones de fábrica:');

      for (const warning of maintenance.manufacturerLimitWarnings) {
        console.log(`      - ${warning}`);
      }
    } else {
      console.log(
        '      Los intervalos están dentro de los límites de fábrica.',
      );
    }

    // ------------------------------------------------------------------
    // F10: consulta del diccionario OBD-II
    // ------------------------------------------------------------------
    const dtc = await obd2Service.getByCode('P0300');

    console.log(`[F10] Código ${dtc.code}: ${dtc.title}`);
    console.log(`      Gravedad: ${dtc.severity}`);
    console.log(`      Descripción: ${dtc.description}`);

    console.log('      Síntomas:');
    if (dtc.symptoms.length === 0) {
      console.log('      - (sin síntomas registrados)');
    } else {
      for (const symptom of dtc.symptoms) {
        console.log(`      - ${symptom}`);
      }
    }

    console.log('      Causas comunes:');
    if (dtc.commonCauses.length === 0) {
      console.log('      - (sin causas registradas)');
    } else {
      for (const cause of dtc.commonCauses) {
        console.log(`      - ${cause}`);
      }
    }

    const highSeverityCodes = await obd2Service.listBySeverity('ALTA');

    console.log(
      `[F10] Códigos con severidad ALTA (${highSeverityCodes.length}):`,
    );

    if (highSeverityCodes.length === 0) {
      console.log('      (ninguno registrado)');
    } else {
      for (const code of highSeverityCodes) {
        console.log(`      - ${code.code}: ${code.title}`);
      }
    }
  } finally {
    // Se cierra el pool tanto si el flujo termina bien como si falla.
    try {
      await pool.end();
      console.log('-----------------------------------------');
      console.log('Conexión a PostgreSQL cerrada.');
    } catch (closeError) {
      console.error('No se pudo cerrar el pool de PostgreSQL:', closeError);
      process.exitCode = 1;
    }
  }
}

/** Lee y valida el id del vehículo demo configurado por entorno. */
function readDemoVehicleId(): number {
  const rawValue = process.env.DEMO_VEHICLE_ID ?? String(DEFAULT_DEMO_VEHICLE_ID);
  const vehicleId = Number(rawValue);

  if (!Number.isInteger(vehicleId) || vehicleId <= 0) {
    throw new Error(
      `DEMO_VEHICLE_ID debe ser un entero positivo; se recibió "${rawValue}".`,
    );
  }

  return vehicleId;
}

function formatDate(date: Date): string {
  return date.toISOString();
}

/** Imprime errores de dominio o inesperados de forma legible. */
function printError(error: unknown): void {
  if (
    error instanceof OdometerServiceError ||
    error instanceof MaintenanceServiceError ||
    error instanceof Obd2ServiceError
  ) {
    console.error(`[${error.code}] ${error.message}`);
    return;
  }

  if (error instanceof Error) {
    console.error(error.stack ?? error.message);
    return;
  }

  console.error(String(error));
}

// Top-level await: Node espera a que main() cierre el pool antes de salir.
try {
  await main();
} catch (error) {
  console.error('El flujo de prueba falló:');
  printError(error);
  process.exitCode = 1;
}
