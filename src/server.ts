/**
 * Servidor API REST de AutoMantenimiento Pro.
 * ----------------------------------------------------------------------------
 * Expone los servicios de dominio a través de HTTP para que el frontend pueda
 * consumirlos:
 *
 *   GET  /api/vehicles/:id/odometer  → odómetro actual + historial de lecturas
 *   POST /api/vehicles/:id/odometer  → registrar una lectura (F03)
 *   POST /api/maintenance            → registrar un mantenimiento (F05)
 *   GET  /api/obd2/:code             → consultar un código OBD-II (F10)
 *
 * Uso:
 *   DATABASE_URL=postgres://usuario:clave@localhost:5432/auto_mantenimiento_pro \
 *     npm run dev:server
 *
 * El puerto se toma de PORT (inyectado por Render en producción) o, si no
 * está definido, se usa 3001.
 *
 * Variables de entorno relevantes para el despliegue:
 *   PORT         → puerto HTTP escuchado (Render lo inyecta automáticamente).
 *   DATABASE_URL → cadena de conexión de PostgreSQL.
 *   FRONTEND_URL → origen del frontend permitido por CORS (admite una lista
 *                  separada por comas). En producción también se permiten
 *                  los dominios *.vercel.app (ver isOriginAllowed).
 */

import cors from 'cors';
import type { CorsOptions } from 'cors';
import express from 'express';
import type {
  ErrorRequestHandler,
  Express,
  Request,
  RequestHandler,
  Response,
} from 'express';
import { Pool } from 'pg';

import {
  DEFAULT_ODOMETER_HISTORY_LIMIT,
  MAX_ODOMETER_HISTORY_LIMIT,
  OdometerService,
  OdometerServiceError,
} from './services/odometerService.js';
import type { RegisterOdometerReadingInput } from './services/odometerService.js';
import {
  MaintenanceService,
  MaintenanceServiceError,
  MAINTENANCE_SERVICE_TYPES,
} from './services/maintenanceService.js';
import type {
  MaintenanceServiceType,
  RegisterMaintenanceInput,
} from './services/maintenanceService.js';
import { Obd2Service, Obd2ServiceError } from './services/obd2Service.js';
import {
  VehicleService,
  VehicleServiceError,
} from './services/vehicleService.js';
import type {
  CreateVehicleInput,
  DistanceUnit,
  UpdateVehicleInput,
} from './services/vehicleService.js';
import {
  assertAuthConfig,
  requireAuth,
  requireUser,
} from './middleware/auth.js';

/** Puerto por defecto cuando la variable de entorno PORT no está definida. */
const DEFAULT_PORT = 3001;

/** Tamaño máximo aceptado para el cuerpo JSON de una petición. */
const JSON_BODY_LIMIT = '100kb';

/** Orígenes locales de desarrollo (Vite) siempre permitidos. */
const LOCAL_DEV_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
] as const;

/** Patrón de los dominios de despliegue del frontend en Vercel. */
const VERCEL_ORIGIN_PATTERN = /^https:\/\/[\w-]+(\.[\w-]+)*\.vercel\.app$/i;

/**
 * Orígenes permitidos por CORS.
 *
 * - Orígenes locales de desarrollo (Vite: 5173/4173).
 * - Los declarados en FRONTEND_URL (separados por coma), p. ej.
 *   FRONTEND_URL=https://auto-mantenimiento-pro.vercel.app
 * - En producción se añaden los dominios *.vercel.app del proyecto.
 */
export function getAllowedOrigins(): string[] {
  const fromEnv = (process.env.FRONTEND_URL ?? '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter((origin) => origin.length > 0);

  return [...new Set([...LOCAL_DEV_ORIGINS, ...fromEnv])];
}

/**
 * Determina si un origen puede consumir la API.
 *
 * Se permite sin lista explícita cualquier subdominio *.vercel.app cuando
 * NODE_ENV=production (despliegue del frontend en Vercel).
 */
export function isOriginAllowed(origin: string | undefined): boolean {
  // Peticiones sin origen (curl, server-to-server, health checks).
  if (origin === undefined || origin.trim() === '') {
    return true;
  }

  const normalized = origin.trim().replace(/\/+$/, '');

  if (getAllowedOrigins().includes(normalized)) {
    return true;
  }

  return (
    process.env.NODE_ENV === 'production' && VERCEL_ORIGIN_PATTERN.test(normalized)
  );
}

/** Opciones de CORS reutilizables por la aplicación. */
export function buildCorsOptions(): CorsOptions {
  return {
    // cors invoca `origin` con la firma asíncrona (origin, callback); devolver
    // un booleano sincrónico dejaría cada petición colgada sin llamar next().
    origin: (origin, callback) => {
      callback(null, isOriginAllowed(origin));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86_400,
  };
}

// ============================================================================
// Errores de la capa HTTP
// ============================================================================

/** Error controlado de la API (petición inválida, ruta inexistente, etc.). */
class ApiError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

type DomainError =
  | OdometerServiceError
  | MaintenanceServiceError
  | Obd2ServiceError
  | VehicleServiceError;

function isDomainError(error: unknown): error is DomainError {
  return (
    error instanceof OdometerServiceError ||
    error instanceof MaintenanceServiceError ||
    error instanceof Obd2ServiceError ||
    error instanceof VehicleServiceError
  );
}

// ============================================================================
// Utilidades de Express
// ============================================================================

type AsyncRouteHandler = (
  request: Request,
  response: Response,
) => Promise<void>;

/**
 * Envuelve un handler asíncrono para que cualquier rechazo llegue al
 * middleware centralizado de errores.
 */
function asyncHandler(handler: AsyncRouteHandler): RequestHandler {
  return (request, response, next) => {
    void handler(request, response).catch(next);
  };
}

/**
 * Middleware centralizado de errores.
 *
 * Traduce los errores de dominio a códigos HTTP adecuados y evita exponer
 * detalles internos de PostgreSQL en las respuestas 500.
 */
const errorHandler: ErrorRequestHandler = (error, _request, response, next) => {
  if (response.headersSent) {
    next(error);
    return;
  }

  const mapped = mapError(error);

  if (mapped.statusCode >= 500) {
    const detail =
      isDomainError(error) && error.originalError !== undefined
        ? error.originalError
        : error;

    console.error(`[API] ${mapped.code}:`, detail);
  }

  response.status(mapped.statusCode).json({
    error: {
      code: mapped.code,
      message: mapped.message,
    },
  });
};

interface MappedError {
  statusCode: number;
  code: string;
  message: string;
}

function mapError(error: unknown): MappedError {
  if (error instanceof ApiError) {
    return {
      statusCode: error.statusCode,
      code: error.code,
      message: error.message,
    };
  }

  if (isDomainError(error)) {
    const statusCode = statusForDomainCode(error.code);

    // Los fallos de base de datos se registran completos, pero al cliente solo
    // se le devuelve un mensaje genérico.
    if (statusCode >= 500) {
      return {
        statusCode,
        code: error.code,
        message: 'Error interno del servidor.',
      };
    }

    return {
      statusCode,
      code: error.code,
      message: error.message,
    };
  }

  if (isJsonParseError(error)) {
    return {
      statusCode: 400,
      code: 'INVALID_JSON',
      message: 'El cuerpo de la petición no contiene JSON válido.',
    };
  }

  return {
    statusCode: 500,
    code: 'INTERNAL_ERROR',
    message: 'Error interno del servidor.',
  };
}

function statusForDomainCode(code: string): number {
  switch (code) {
    case 'VEHICLE_NOT_FOUND':
    case 'CODE_NOT_FOUND':
    case 'CATALOG_NOT_FOUND':
      return 404;

    // La placa ya registrada por ese mismo usuario: conflicto con un
    // recurso existente (constraint UNIQUE usuario_id + placa).
    case 'PLACA_DUPLICADA':
      return 409;

    case 'DATABASE_ERROR':
      return 500;

    // INVALID_INPUT, INVALID_CODE, INVALID_SEVERITY, READING_TOO_LOW,
    // INSUFFICIENT_READINGS, NO_ELAPSED_TIME e INCONSISTENT_READINGS son
    // errores de la petición o del estado del recurso.
    default:
      return 400;
  }
}

function isJsonParseError(error: unknown): boolean {
  return (
    error instanceof SyntaxError &&
    typeof error === 'object' &&
    error !== null &&
    'type' in error &&
    (error as { type?: unknown }).type === 'entity.parse.failed'
  );
}

// ============================================================================
// Validación y normalización de la entrada HTTP
// ============================================================================

function asObject(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ApiError(
      400,
      'INVALID_BODY',
      'El cuerpo de la petición debe ser un objeto JSON.',
    );
  }

  return value as Record<string, unknown>;
}

function parseVehicleId(raw: string | string[] | undefined): number {
  if (raw === undefined || Array.isArray(raw)) {
    throw new ApiError(
      400,
      'INVALID_VEHICLE_ID',
      'El id del vehículo es obligatorio.',
    );
  }

  const vehicleId = Number(raw);

  if (!Number.isInteger(vehicleId) || vehicleId <= 0) {
    throw new ApiError(
      400,
      'INVALID_VEHICLE_ID',
      'El id del vehículo debe ser un entero mayor a cero.',
    );
  }

  return vehicleId;
}

function parseHistoryLimit(raw: unknown): number {
  if (raw === undefined) {
    return DEFAULT_ODOMETER_HISTORY_LIMIT;
  }

  if (typeof raw !== 'string') {
    throw new ApiError(
      400,
      'INVALID_HISTORY_LIMIT',
      'El parámetro limit debe ser un número entero.',
    );
  }

  const limit = Number(raw);

  if (
    !Number.isInteger(limit) ||
    limit <= 0 ||
    limit > MAX_ODOMETER_HISTORY_LIMIT
  ) {
    throw new ApiError(
      400,
      'INVALID_HISTORY_LIMIT',
      `El parámetro limit debe ser un entero entre 1 y ${MAX_ODOMETER_HISTORY_LIMIT}.`,
    );
  }

  return limit;
}

function readNumber(
  body: Record<string, unknown>,
  field: string,
): number {
  const value = body[field];

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ApiError(
      400,
      'INVALID_INPUT',
      `El campo "${field}" debe ser un número.`,
    );
  }

  return value;
}

function readOptionalNumber(
  body: Record<string, unknown>,
  field: string,
): number | undefined {
  const value = body[field];

  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ApiError(
      400,
      'INVALID_INPUT',
      `El campo "${field}" debe ser un número.`,
    );
  }

  return value;
}

function readOptionalText(
  body: Record<string, unknown>,
  field: string,
): string | null | undefined {
  const value = body[field];

  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    throw new ApiError(
      400,
      'INVALID_INPUT',
      `El campo "${field}" debe ser texto.`,
    );
  }

  return value;
}

function readOptionalDate(
  body: Record<string, unknown>,
  field: string,
): Date | undefined {
  const value = body[field];

  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new ApiError(
      400,
      'INVALID_INPUT',
      `El campo "${field}" debe ser una fecha válida.`,
    );
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new ApiError(
      400,
      'INVALID_INPUT',
      `El campo "${field}" debe ser una fecha válida.`,
    );
  }

  return date;
}

function readServiceType(
  body: Record<string, unknown>,
): MaintenanceServiceType {
  const value = body['serviceType'];

  if (typeof value !== 'string') {
    throw new ApiError(
      400,
      'INVALID_INPUT',
      'El campo "serviceType" es obligatorio.',
    );
  }

  const normalized = value.trim().toUpperCase();
  const allowedTypes: readonly string[] = MAINTENANCE_SERVICE_TYPES;

  if (!allowedTypes.includes(normalized)) {
    throw new ApiError(
      400,
      'INVALID_INPUT',
      `serviceType no es válido. Valores permitidos: ${MAINTENANCE_SERVICE_TYPES.join(', ')}.`,
    );
  }

  return normalized as MaintenanceServiceType;
}

// ============================================================================
// Construcción de la aplicación
// ============================================================================

/** Categorías de fallo de base de datos expuestas por el diagnóstico. */
type DbFailureKind =
  | 'connection_refused'
  | 'host_unreachable'
  | 'timeout'
  | 'invalid_credentials'
  | 'database_not_found'
  | 'ssl_required'
  | 'too_many_connections'
  | 'schema_incomplete'
  | 'query_failed'
  | 'unknown';

/**
 * Traduce un error de `pg` a una categoría segura.
 *
 * Nunca expone mensajes crudos (pueden contener host, usuario o parte de la
 * cadena de conexión): solo el código SQLSTATE o de sistema del error.
 */
function classifyDatabaseError(error: unknown): DbFailureKind {
  if (!(error instanceof Error)) {
    return 'unknown';
  }

  const code = 'code' in error ? String(error.code ?? '') : '';
  const message = error.message.toLowerCase();

  if (code === 'ECONNREFUSED') {
    return 'connection_refused';
  }
  if (code === 'ENOTFOUND' || code === 'EHOSTUNREACH' || code === 'EAI_AGAIN') {
    return 'host_unreachable';
  }
  if (
    code === 'ETIMEDOUT' ||
    code === 'ECONNRESET' ||
    code === '57P03' /* cannot_connect_now */ ||
    message.includes('timeout exceeded when trying to connect') ||
    message.includes('connection terminated') ||
    message.includes('connection ended unexpectedly')
  ) {
    return 'timeout';
  }
  if (code === '28P01' || code === '28000') {
    return 'invalid_credentials';
  }
  if (code === '3D000') {
    return 'database_not_found';
  }
  if (code === '53300') {
    return 'too_many_connections';
  }
  if (message.includes('ssl') || message.includes('certificate')) {
    return 'ssl_required';
  }
  if (code === '42P01') {
    return 'schema_incomplete';
  }

  return 'unknown';
}

/**
 * Extrae el código de error y un extracto seguro del mensaje.
 *
 * Enmascara cualquier cadena tipo conexión (`postgres://user:pass@host/db`)
 * y credenciales para poder diagnosticar sin filtrar secretos.
 */
function describeDatabaseError(error: unknown): {
  kind: DbFailureKind;
  code: string;
  hint: string;
} {
  const kind = classifyDatabaseError(error);

  if (!(error instanceof Error)) {
    return { kind, code: '', hint: '' };
  }

  const code = 'code' in error ? String(error.code ?? '') : '';
  const hint = error.message
    .replace(/postgres(ql)?:\/\/[^\s'"]+/gi, 'postgres://***')
    .replace(/(password|passwd|pwd)\s*[=:]\s*[^\s'"]+/gi, '$1=***')
    .slice(0, 160);

  return { kind, code, hint };
}

/** Tablas mínimas que debe existir según specs/database-schema.sql. */
const REQUIRED_TABLES = [
  'vehiculos',
  'odometro_logs',
  'mantenimientos',
  'codigos_obd2',
  'catalogo_especificaciones',
] as const;

/**
 * Diagnóstico profundo de la base de datos (solo con `?db=1`).
 *
 * Devuelve una categoría acotada del fallo (o el detalle de tablas
 * faltantes) sin filtrar credenciales ni mensajes internos de PostgreSQL.
 */
async function diagnoseDatabase(pool: Pool): Promise<{
  connection: 'ok' | 'error';
  kind?: DbFailureKind;
  code?: string;
  hint?: string;
  schema?: 'ok' | 'missing_tables';
  missingTables?: string[];
}> {
  try {
    await pool.query('SELECT 1');
  } catch (error) {
    const detail = describeDatabaseError(error);
    console.error(`[HEALTH] Diagnóstico de BD -> ${detail.kind}:`, error);
    return { connection: 'error', ...detail };
  }

  try {
    const result = await pool.query<{
      table_name: string;
    }>(
      `SELECT table_name
         FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = ANY($1::text[])`,
      [REQUIRED_TABLES],
    );

    const found = new Set(result.rows.map((row) => row.table_name));
    const missingTables = REQUIRED_TABLES.filter(
      (table) => !found.has(table),
    );

    if (missingTables.length > 0) {
      return {
        connection: 'ok',
        schema: 'missing_tables',
        missingTables,
      };
    }

    return { connection: 'ok', schema: 'ok' };
  } catch (error) {
    const detail = describeDatabaseError(error);
    console.error(`[HEALTH] Diagnóstico de esquema -> ${detail.kind}:`, error);
    return { connection: 'ok', ...detail };
  }
}

/**
 * Crea la aplicación Express con los servicios inyectados a partir del pool.
 * Se exporta para poder probarla sin abrir un puerto.
 */
export function createApp(pool: Pool): Express {
  const app = express();

  // Inyección de dependencias: un único pool compartido por los servicios.
  const odometerService = new OdometerService(pool);
  const maintenanceService = new MaintenanceService(pool);
  const obd2Service = new Obd2Service(pool);
  const vehicleService = new VehicleService(pool);

  app.disable('x-powered-by');
  // Render (y cualquier proxy) termina el TLS: confiar en el primer proxy para
  // que req.protocol/req.ip reflejen el origen real del cliente.
  app.set('trust proxy', 1);
  app.use(cors(buildCorsOptions()));
  app.use(express.json({ limit: JSON_BODY_LIMIT }));

  // --------------------------------------------------------------------------
  // GET /api/health  → sonda de salud para Render / load balancers
  //   Con ?db=1 añade un diagnóstico profundo (seguro: sin credenciales ni
  //   mensajes crudos) que distingue fallos de conexión, autenticación,
  //   disponibilidad y tablas faltantes del esquema.
  // --------------------------------------------------------------------------
  app.get(
    '/api/health',
    asyncHandler(async (request, response) => {
      const base = {
        status: 'ok',
        service: 'auto-mantenimiento-pro-api',
        timestamp: new Date().toISOString(),
      };

      if (request.query.db !== '1') {
        response.status(200).json(base);
        return;
      }

      const database = await diagnoseDatabase(pool);
      response.status(200).json({ ...base, database });
    }),
  );

  // --------------------------------------------------------------------------
  // Autenticación (Supabase Auth)
  //   A partir de aquí TODA ruta exige un JWT válido en Authorization.
  //   /api/health (registrada arriba) queda pública para Render y health
  //   checkers. El middleware inyecta request.user = { sub, email }.
  // --------------------------------------------------------------------------
  app.use('/api', requireAuth);

  // --------------------------------------------------------------------------
  // GET /api/vehicles  (F01: listado de MIS vehículos)
  // --------------------------------------------------------------------------
  app.get(
    '/api/vehicles',
    asyncHandler(async (request, response) => {
      const user = requireUser(request);
      const vehicles = await vehicleService.list(user.sub);

      response.status(200).json(vehicles);
    }),
  );

  // --------------------------------------------------------------------------
  // POST /api/vehicles  (F01: alta de vehículo)
  // --------------------------------------------------------------------------
  app.post(
    '/api/vehicles',
    asyncHandler(async (request, response) => {
      const user = requireUser(request);
      const body = asObject(request.body as unknown);

      const input: CreateVehicleInput = {
        marca: body.marca as string,
        modelo: body.modelo as string,
        anio: body.anio as number,
        tipoMotor: body.tipoMotor as CreateVehicleInput['tipoMotor'],
        kilometrajeInicial: body.kilometrajeInicial as number,
        ...(body.alias === undefined ? {} : { alias: body.alias as string }),
        ...(body.placa === undefined ? {} : { placa: body.placa as string }),
        // Estado de RTV al alta (se valida como booleano en el servicio).
        ...(body.rtvAlDia === undefined
          ? {}
          : { rtvAlDia: body.rtvAlDia as boolean }),
        // Unidad en la que el cliente escribe las distancias (KM por defecto).
        ...(body.unidadDistancia === undefined
          ? {}
          : { unidadDistancia: body.unidadDistancia as DistanceUnit }),
      };

      const vehicle = await vehicleService.create(user.sub, input);

      response.status(201).json(vehicle);
    }),
  );

  // --------------------------------------------------------------------------
  // GET /api/vehicles/:id
  // --------------------------------------------------------------------------
  app.get(
    '/api/vehicles/:id',
    asyncHandler(async (request, response) => {
      const user = requireUser(request);
      const vehicleId = parseVehicleId(request.params.id);

      const vehicle = await vehicleService.get(user.sub, vehicleId);

      response.status(200).json(vehicle);
    }),
  );

  // --------------------------------------------------------------------------
  // PATCH /api/vehicles/:id  (alias / placa)
  // --------------------------------------------------------------------------
  app.patch(
    '/api/vehicles/:id',
    asyncHandler(async (request, response) => {
      const user = requireUser(request);
      const vehicleId = parseVehicleId(request.params.id);
      const body = asObject(request.body as unknown);

      const input: UpdateVehicleInput = {
        ...(body.alias === undefined ? {} : { alias: body.alias as string }),
        ...(body.placa === undefined ? {} : { placa: body.placa as string }),
      };

      const vehicle = await vehicleService.update(user.sub, vehicleId, input);

      response.status(200).json(vehicle);
    }),
  );

  // --------------------------------------------------------------------------
  // DELETE /api/vehicles/:id  (cascada a odómetro y mantenimientos)
  // --------------------------------------------------------------------------
  app.delete(
    '/api/vehicles/:id',
    asyncHandler(async (request, response) => {
      const user = requireUser(request);
      const vehicleId = parseVehicleId(request.params.id);

      await vehicleService.remove(user.sub, vehicleId);

      response.status(204).end();
    }),
  );

  // --------------------------------------------------------------------------
  // GET /api/vehicles/:id/odometer
  // --------------------------------------------------------------------------
  app.get(
    '/api/vehicles/:id/odometer',
    asyncHandler(async (request, response) => {
      const user = requireUser(request);
      const vehicleId = parseVehicleId(request.params.id);
      const historyLimit = parseHistoryLimit(request.query.limit);

      // El vehículo debe pertenecer al usuario autenticado (anti-BOLA).
      await vehicleService.assertOwnership(user.sub, vehicleId);

      const snapshot = await odometerService.getOdometerSnapshot(
        vehicleId,
        historyLimit,
      );

      response.status(200).json(snapshot);
    }),
  );

  // --------------------------------------------------------------------------
  // POST /api/vehicles/:id/odometer  (F03)
  // --------------------------------------------------------------------------
  app.post(
    '/api/vehicles/:id/odometer',
    asyncHandler(async (request, response) => {
      const user = requireUser(request);
      const vehicleId = parseVehicleId(request.params.id);
      const body = asObject(request.body as unknown);
      const recordedAt = readOptionalDate(body, 'recordedAt');

      // El vehículo debe pertenecer al usuario autenticado (anti-BOLA).
      await vehicleService.assertOwnership(user.sub, vehicleId);

      const input: RegisterOdometerReadingInput = {
        vehicleId,
        kilometers: readNumber(body, 'kilometers'),
        ...(recordedAt === undefined ? {} : { recordedAt }),
      };

      const reading = await odometerService.registerReading(input);

      response.status(201).json(reading);
    }),
  );

  // --------------------------------------------------------------------------
  // POST /api/maintenance  (F05)
  // --------------------------------------------------------------------------
  app.post(
    '/api/maintenance',
    asyncHandler(async (request, response) => {
      const user = requireUser(request);
      const body = asObject(request.body as unknown);

      const serviceDate = readOptionalDate(body, 'serviceDate');
      const cost = readOptionalNumber(body, 'cost');
      const shop = readOptionalText(body, 'shop');
      const notes = readOptionalText(body, 'notes');
      const vehicleId = readNumber(body, 'vehicleId');

      // El vehículo debe pertenecer al usuario autenticado (anti-BOLA).
      await vehicleService.assertOwnership(user.sub, vehicleId);

      const input: RegisterMaintenanceInput = {
        vehicleId,
        serviceType: readServiceType(body),
        serviceKilometers: readNumber(body, 'serviceKilometers'),
        kilometerInterval: readNumber(body, 'kilometerInterval'),
        monthInterval: readNumber(body, 'monthInterval'),
        ...(serviceDate === undefined ? {} : { serviceDate }),
        ...(cost === undefined ? {} : { cost }),
        ...(shop === undefined ? {} : { shop }),
        ...(notes === undefined ? {} : { notes }),
      };

      const maintenance =
        await maintenanceService.registerMaintenance(input);

      response.status(201).json(maintenance);
    }),
  );

  // --------------------------------------------------------------------------
  // GET /api/obd2/:code  (F10)
  // --------------------------------------------------------------------------
  app.get(
    '/api/obd2/:code',
    asyncHandler(async (request, response) => {
      const code = request.params.code;

      if (code === undefined || Array.isArray(code)) {
        throw new ApiError(
          400,
          'INVALID_CODE',
          'El código OBD-II es obligatorio.',
        );
      }

      const obd2Code = await obd2Service.getByCode(code);

      response.status(200).json(obd2Code);
    }),
  );

  // --------------------------------------------------------------------------
  // Rutas no encontradas
  // --------------------------------------------------------------------------
  app.use((request, response) => {
    response.status(404).json({
      error: {
        code: 'ROUTE_NOT_FOUND',
        message: `No existe la ruta ${request.method} ${request.originalUrl}.`,
      },
    });
  });

  app.use(errorHandler);

  return app;
}

// ============================================================================
// Arranque del servidor
// ============================================================================

function readPort(): number {
  const rawPort = process.env.PORT?.trim();

  if (!rawPort) {
    return DEFAULT_PORT;
  }

  const port = Number(rawPort);

  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw new Error(
      `PORT debe ser un entero entre 1 y 65535; se recibió "${rawPort}".`,
    );
  }

  return port;
}

function readDatabaseUrl(): string {
  const connectionString = process.env.DATABASE_URL?.trim();

  if (!connectionString) {
    throw new Error(
      'DATABASE_URL no está definida. Ejemplo: postgres://usuario:clave@localhost:5432/auto_mantenimiento_pro',
    );
  }

  // Validación temprana: si la URL no es parseable, el error debe aparecer en
  // los logs del arranque (Render → Logs), no como un 500 genérico en cada
  // petición. Se enmascara cualquier credential en la salida.
  let parsed: URL;
  try {
    parsed = new URL(connectionString);
  } catch {
    throw new Error(
      'DATABASE_URL no es una URL válida de PostgreSQL. Se espera el formato ' +
        'postgres://usuario:clave@host:5432/base, sin comillas, saltos de línea ni espacios. ' +
        'Copia la "Database URL" con el botón de copiar desde Render → PostgreSQL → Connections ' +
        'y pégala en Environment del servicio web (evita escribirla a mano).',
    );
  }

  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
    throw new Error(
      `DATABASE_URL usa un esquema no soportado ("${parsed.protocol}"). Debe empezar por postgres:// o postgresql://.`,
    );
  }

  return connectionString;
}

/** Crea el pool, monta la API y deja el proceso escuchando en el puerto. */
export async function startServer(): Promise<void> {
  // Fail-fast: si SUPABASE_URL falta o es inválida, el error aparece en los
  // logs de arranque en vez de como un 401 en cada petición autenticada.
  const jwksUrl = assertAuthConfig();

  const pool = new Pool({ connectionString: readDatabaseUrl() });

  // Evita que un error en un cliente inactivo tumbe el proceso sin log.
  pool.on('error', (error) => {
    console.error('Error inesperado en un cliente de PostgreSQL:', error);
  });

  const app = createApp(pool);
  const port = readPort();
  // Render exige escuchar en 0.0.0.0 (todas las interfaces).
  const host = process.env.HOST?.trim() || '0.0.0.0';

  console.log(`Orígenes CORS permitidos: ${getAllowedOrigins().join(', ')}`);
  console.log(`Auth Supabase (JWKS): ${jwksUrl}`);

  const server = app.listen(port, host, () => {
    console.log(`API REST de AutoMantenimiento Pro escuchando en http://${host}:${port}`);
  });

  server.on('error', (error) => {
    console.error('No se pudo iniciar el servidor HTTP:', error);
    void pool.end();
    process.exitCode = 1;
  });

  let shuttingDown = false;

  const shutdown = (signal: NodeJS.Signals): void => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    console.log(`\nSeñal ${signal} recibida. Cerrando el servidor...`);

    server.close((closeError) => {
      void pool
        .end()
        .catch((poolError: unknown) => {
          console.error('No se pudo cerrar el pool de PostgreSQL:', poolError);
          process.exitCode = 1;
        })
        .finally(() => {
          if (closeError) {
            console.error('No se pudo cerrar el servidor HTTP:', closeError);
            process.exitCode = 1;
          }
        });
    });
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

// Top-level await: el proceso se mantiene vivo mientras el servidor escucha.
try {
  await startServer();
} catch (error) {
  console.error('No se pudo arrancar la API REST:', error);
  process.exitCode = 1;
}
