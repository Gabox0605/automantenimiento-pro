/**
 * Obd2Service
 * ----------------------------------------------------------------------------
 * Diccionario de códigos de diagnóstico OBD-II (F10).
 *
 * Funcionalidades:
 *  - Buscar un DTC por su identificador (por ejemplo, P0300 o P0420).
 *  - Devolver título, descripción, causas, síntomas y severidad.
 *  - Listar todos los códigos o filtrarlos por severidad.
 *
 * El servicio normaliza el código de entrada (trim + mayúsculas), por lo que
 * acepta valores como "p0300" o " P0300 ".
 *
 * Ejemplo de uso:
 *   const pool = new Pool({ connectionString: process.env.DATABASE_URL });
 *   const obd2Service = new Obd2Service(pool);
 *   const code = await obd2Service.getByCode('P0300');
 *   const critical = await obd2Service.listBySeverity('ALTA');
 */

import type { Pool, QueryResultRow } from 'pg';

// ============================================================================
// Tipos públicos
// ============================================================================

/**
 * Niveles de severidad soportados por el ENUM lógico de
 * `codigos_obd2.severidad`.
 */
export const OBD2_SEVERITIES = ['BAJA', 'MEDIA', 'ALTA', 'CRITICA'] as const;

export type Obd2Severity = (typeof OBD2_SEVERITIES)[number];

/** Información completa de un código OBD-II. */
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

/** Códigos de error estables para la capa HTTP/UI. */
export type Obd2ServiceErrorCode =
  | 'INVALID_CODE'
  | 'INVALID_SEVERITY'
  | 'CODE_NOT_FOUND'
  | 'DATABASE_ERROR';

/** Error de dominio del servicio OBD-II. */
export class Obd2ServiceError extends Error {
  public readonly code: Obd2ServiceErrorCode;
  public readonly originalError?: unknown;

  constructor(
    code: Obd2ServiceErrorCode,
    message: string,
    originalError?: unknown,
  ) {
    super(message);
    this.name = 'Obd2ServiceError';
    this.code = code;
    this.originalError = originalError;
    // Conserva el prototipo al compilar a versiones anteriores de ES.
    Object.setPrototypeOf(this, Obd2ServiceError.prototype);
  }
}

// ============================================================================
// Fila de PostgreSQL y mapeo al dominio
// ============================================================================

interface Obd2CodeRow extends QueryResultRow {
  id: number;
  codigo: string;
  titulo: string;
  categoria: string;
  descripcion_corta: string;
  causas_comunes: string[];
  sintomas: string[];
  severidad: string;
}

const OBD2_COLUMNS = `
  id,
  codigo,
  titulo,
  categoria,
  descripcion_corta,
  causas_comunes,
  sintomas,
  severidad
`;

const SELECT_BY_CODE = `
  SELECT ${OBD2_COLUMNS}
    FROM codigos_obd2
   WHERE codigo = $1
`;

const SELECT_ALL = `
  SELECT ${OBD2_COLUMNS}
    FROM codigos_obd2
   ORDER BY
       CASE severidad
           WHEN 'CRITICA' THEN 1
           WHEN 'ALTA'    THEN 2
           WHEN 'MEDIA'   THEN 3
           WHEN 'BAJA'    THEN 4
           ELSE 5
       END,
       codigo
`;

const SELECT_BY_SEVERITY = `
  SELECT ${OBD2_COLUMNS}
    FROM codigos_obd2
   WHERE severidad = $1
   ORDER BY codigo
`;

// ============================================================================
// Servicio
// ============================================================================

export class Obd2Service {
  constructor(private readonly pool: Pool) {}

  /**
   * Busca un código OBD-II por su identificador.
   *
   * @param code Código DTC, por ejemplo "P0300". No distingue mayúsculas.
   * @throws {Obd2ServiceError} INVALID_CODE si el formato no es válido,
   *         CODE_NOT_FOUND si no existe o DATABASE_ERROR si falla la consulta.
   */
  async getByCode(code: string): Promise<Obd2Code> {
    const normalizedCode = normalizeCode(code);
    const rows = await this.queryRows(SELECT_BY_CODE, [normalizedCode]);
    const row = rows[0];

    if (!row) {
      throw new Obd2ServiceError(
        'CODE_NOT_FOUND',
        `No se encontró el código OBD-II ${normalizedCode}.`,
      );
    }

    return mapCode(row);
  }

  /**
   * Lista todos los códigos registrados, ordenados por severidad
   * (CRITICA → BAJA) y luego por código.
   *
   * @throws {Obd2ServiceError} DATABASE_ERROR si falla la consulta.
   */
  async listAll(): Promise<Obd2Code[]> {
    const rows = await this.queryRows(SELECT_ALL);
    return rows.map(mapCode);
  }

  /**
   * Lista los códigos de una severidad específica, ordenados por código.
   *
   * @throws {Obd2ServiceError} INVALID_SEVERITY si el valor no es válido o
   *         DATABASE_ERROR si falla la consulta.
   */
  async listBySeverity(severity: Obd2Severity): Promise<Obd2Code[]> {
    assertSeverity(severity);

    const rows = await this.queryRows(SELECT_BY_SEVERITY, [severity]);
    return rows.map(mapCode);
  }

  /** Ejecuta una consulta y traduce los errores de PostgreSQL/mapeo. */
  private async queryRows(
    sql: string,
    params: unknown[] = [],
  ): Promise<Obd2CodeRow[]> {
    try {
      const result = await this.pool.query<Obd2CodeRow>(sql, params);
      return result.rows;
    } catch (error) {
      throw Obd2Service.toServiceError(
        error,
        'No se pudo consultar el diccionario OBD-II',
      );
    }
  }

  /** Normaliza cualquier excepción a un error de dominio del servicio. */
  private static toServiceError(
    error: unknown,
    context: string,
  ): Obd2ServiceError {
    if (error instanceof Obd2ServiceError) {
      return error;
    }

    const detail = error instanceof Error ? `: ${error.message}` : '';
    return new Obd2ServiceError(
      'DATABASE_ERROR',
      `${context}${detail}`,
      error,
    );
  }
}

// ============================================================================
// Helpers de validación y mapeo (exportados para pruebas)
// ============================================================================

/** Formato estándar DTC: una letra (P/C/B/U) y cuatro caracteres hex. */
const DTC_PATTERN = /^[PBCU][0-9A-F]{4}$/;

/**
 * Normaliza y valida un código DTC.
 * Exportada para que otros módulos puedan validar antes de consultar.
 */
export function normalizeCode(code: string): string {
  if (typeof code !== 'string') {
    throw new Obd2ServiceError(
      'INVALID_CODE',
      'El código OBD-II debe ser una cadena de texto.',
    );
  }

  const normalized = code.trim().toUpperCase();

  if (!DTC_PATTERN.test(normalized)) {
    throw new Obd2ServiceError(
      'INVALID_CODE',
      `El código "${code}" no tiene un formato OBD-II válido (ej. P0300).`,
    );
  }

  return normalized;
}

/** Verifica que un valor sea una severidad válida. */
export function isObd2Severity(value: string): value is Obd2Severity {
  return (OBD2_SEVERITIES as readonly string[]).includes(value);
}

export function assertSeverity(value: string): asserts value is Obd2Severity {
  if (!isObd2Severity(value)) {
    throw new Obd2ServiceError(
      'INVALID_SEVERITY',
      `Severidad "${value}" no válida. Valores permitidos: ${OBD2_SEVERITIES.join(', ')}.`,
    );
  }
}

function mapCode(row: Obd2CodeRow): Obd2Code {
  if (!isObd2Severity(row.severidad)) {
    throw new Obd2ServiceError(
      'DATABASE_ERROR',
      `La base de datos devolvió una severidad desconocida para ${row.codigo}: ${row.severidad}.`,
    );
  }

  return {
    id: row.id,
    code: row.codigo,
    title: row.titulo,
    category: row.categoria,
    description: row.descripcion_corta,
    commonCauses: row.causas_comunes,
    symptoms: row.sintomas,
    severity: row.severidad,
  };
}
