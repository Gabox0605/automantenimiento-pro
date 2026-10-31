/**
 * Utilidades de unidades de distancia (km / millas).
 * ----------------------------------------------------------------------------
 * Contexto: hay vehículos importados cuyo tablero registra en MILLAS.
 *
 * Diseño (normalización a km):
 *   - La base de datos guarda SIEMPRE kilómetros. Por eso la validación de
 *     límites de fábrica (F05), los mensajes del backend y el histórico del
 *     panel trabajan en km sin ninguna conversión.
 *   - El usuario ESCRIBE en la unidad de su vehículo; estos helpers convierten
 *     a km justo antes de enviar y muestran el equivalente en km como apoyo.
 *
 * Este archivo es el ÚNICO punto donde existe la fórmula de conversión.
 */

/** Kilómetros por milla (exacto por definición internacional). */
export const KM_PER_MILE = 1.609344;

/** Unidades admitidas (esquema ENUM `unidad_distancia`). */
export const DISTANCE_UNITS = ['KM', 'MI'] as const;

export type DistanceUnit = (typeof DISTANCE_UNITS)[number];

/** Símbolo corto para etiquetas de campo (km / mi). */
export const UNIT_LABELS: Record<DistanceUnit, string> = {
  KM: 'km',
  MI: 'mi',
};

/** Nombre completo (Kilómetros / Millas) para títulos y avisos. */
export const UNIT_NAMES: Record<DistanceUnit, string> = {
  KM: 'Kilómetros',
  MI: 'Millas',
};

/**
 * Convierte una distancia escrita por el usuario a kilómetros (la unidad de
 * almacenamiento). Con `MI` redondea al entero porque la BD guarda INTEGER.
 *
 * Verificado: `round` no genera falsos positivos contra el límite de fábrica.
 * `round(y) > límite` exige `y > límite + 0,5`, es decir, un exceso real; y un
 * valor exactamente en el límite (6 214 mi = 10 000,46 km) queda en 10 000 km
 * → "no excede" (la comparación F05 es estricta, igualar no es exceso).
 *
 * También es monótono no decreciente: lecturas crecientes en millas siguen
 * siendo crecientes en km, de modo que no se rechazan lecturas válidas.
 */
export function toKilometers(value: number, unit: DistanceUnit): number {
  if (unit === 'KM') {
    return value;
  }
  return Math.round(value * KM_PER_MILE);
}

/**
 * Convierte kilómetros a millas, solo para mostrar el equivalente al usuario
 * mientras escribe (la verdad almacenada sigue siendo km).
 */
export function fromKilometers(kilometers: number): number {
  return Math.round(kilometers / KM_PER_MILE);
}

/**
 * true si el vehículo registra en una unidad distinta de la almacenada
 * (millas), en cuyo caso conviene avisar de la conversión.
 */
export function needsConversionNotice(unit: DistanceUnit): boolean {
  return unit === 'MI';
}
