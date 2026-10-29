/**
 * Utilidad de Revisión Técnica Vehicular (RTV) para Costa Rica.
 * ----------------------------------------------------------------------------
 * Según el Ministerio de Obras Públicas y Transporte (MOPT) de Costa Rica, el
 * mes en que cada vehículo debe realizar la RTV se asigna por el último dígito
 * numérico de la placa:
 *
 *   1 -> Enero     6 -> Junio
 *   2 -> Febrero   7 -> Julio
 *   3 -> Marzo     8 -> Agosto
 *   4 -> Abril     9 -> Setiembre
 *   5 -> Mayo      0 -> Octubre
 *
 * El ciclo comienza el primer día del mes asignado y puede iniciarse en el mes
 * previo (mes de adelanto permitido). Si el mes asignado ya pasó en el año en
 * curso sin realizar la revisión, el RTV queda vencido.
 */

/** Nivel de urgencia del estado RTV. */
export type RtvStatusLevel = 'info' | 'warning' | 'danger';

/** Nombres oficiales de los meses del calendario RTV (mes = índice 0-11). */
export const RTV_MONTH_NAMES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Setiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
] as const satisfies readonly string[];

/** Nombres cortos de los meses (para chips/etiquetas compactas). */
export const RTV_MONTH_SHORT_NAMES = [
  'Ene',
  'Feb',
  'Mar',
  'Abr',
  'May',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Oct',
  'Nov',
  'Dic',
] as const satisfies readonly string[];

/** Mapa oficial: último dígito de la placa -> mes asignado (índice 0-11). */
const DIGIT_TO_MONTH: Readonly<Record<number, number>> = {
  1: 0,
  2: 1,
  3: 2,
  4: 3,
  5: 4,
  6: 5,
  7: 6,
  8: 7,
  9: 8,
  0: 9,
};

/** Nombre completo de un mes (índice 0-11) con seguro ante índices fuera de rango. */
function monthNameAt(index: number): string {
  return RTV_MONTH_NAMES[index] ?? RTV_MONTH_NAMES[0];
}

/** Nombre corto de un mes (índice 0-11) con seguro ante índices fuera de rango. */
function monthShortNameAt(index: number): string {
  return RTV_MONTH_SHORT_NAMES[index] ?? RTV_MONTH_SHORT_NAMES[0];
}

/** Resultado del cálculo del estado RTV de un vehículo. */
export interface RtvStatus {
  /** Placa normalizada (solo mayúsculas y sin espacios). */
  plateNumber: string;
  /** Último dígito numérico de la placa. */
  lastDigit: number;
  /** Mes asignado por placa (índice 0-11). */
  assignedMonthIndex: number;
  /** Nombre completo del mes asignado (ej. "Junio"). */
  assignedMonthName: string;
  /** Nombre corto del mes asignado (ej. "Jun"). */
  assignedMonthShortName: string;
  /** Nivel de urgencia: 'info' (próximo), 'warning' (mes actual/adelanto) o 'danger' (vencido). */
  level: RtvStatusLevel;
  /** Meses naturales que faltan hasta el próximo ciclo de RTV. */
  monthsRemaining: number;
  /** true si el vehículo ya está dentro del mes de adelanto permitido. */
  inAdvanceWindow: boolean;
  /** true si el RTV del año en curso ya venció. */
  isExpired: boolean;
  /** Año calendario evaluado. */
  evaluatedYear: number;
  /** Mensaje recordatorio listo para mostrar al usuario. */
  message: string;
}

/** Extrae el último dígito numérico de una placa (null si no tiene dígitos). */
export function getLastNumericDigit(plateNumber: string): number | null {
  const digits = plateNumber.replace(/\D/g, '');

  if (digits.length === 0) {
    return null;
  }

  return Number(digits.charAt(digits.length - 1));
}

/**
 * Calcula el estado RTV de un vehículo a partir de su placa.
 *
 * @param plateNumber Placa del vehículo (ej. "B123456").
 * @param reference Fecha de referencia (por defecto: hoy). Permite pruebas.
 * @returns El estado RTV o `null` si la placa no contiene dígitos.
 */
export function getRtvStatus(
  plateNumber: string,
  reference: Date = new Date(),
): RtvStatus | null {
  const normalizedPlate = plateNumber.trim().toUpperCase();
  const lastDigit = getLastNumericDigit(normalizedPlate);

  if (lastDigit === null) {
    return null;
  }

  const assignedMonthIndex = DIGIT_TO_MONTH[lastDigit];

  if (assignedMonthIndex === undefined) {
    return null;
  }
  const assignedMonthName = monthNameAt(assignedMonthIndex);
  const assignedMonthShortName = monthShortNameAt(assignedMonthIndex);
  const currentMonthIndex = reference.getMonth();
  const evaluatedYear = reference.getFullYear();

  // El mes de RTV ocurre este año o, si ya pasó, el siguiente.
  const occursThisYear = currentMonthIndex <= assignedMonthIndex;
  const targetYear = occursThisYear ? evaluatedYear : evaluatedYear + 1;

  const startOfAssignedMonth = new Date(
    targetYear,
    assignedMonthIndex,
    1,
  ).getTime();
  const endOfAssignedMonth = new Date(
    targetYear,
    assignedMonthIndex + 1,
    1,
  ).getTime() - 1;
  const isWithinAssignedMonth =
    reference.getTime() >= startOfAssignedMonth &&
    reference.getTime() <= endOfAssignedMonth;
  // Mes previo al asignado, con ciclo anual (ej. diciembre es el mes de
  // adelanto de los vehículos con placa que termina en 1 -> enero).
  const isAdvanceMonth =
    currentMonthIndex === (assignedMonthIndex + 11) % 12;

  if (isWithinAssignedMonth || isAdvanceMonth) {
    return {
      plateNumber: normalizedPlate,
      lastDigit,
      assignedMonthIndex,
      assignedMonthName,
      assignedMonthShortName,
      level: 'warning',
      monthsRemaining: isWithinAssignedMonth ? 0 : 1,
      inAdvanceWindow: !isWithinAssignedMonth,
      isExpired: false,
      evaluatedYear,
      message: isWithinAssignedMonth
        ? `El vehículo está en su mes de RTV (${assignedMonthName}). Programe la revisión técnica antes del último día del mes.`
        : `El mes de RTV es ${assignedMonthName} (próximo mes). Ya puede realizar la revisión en el mes de adelanto permitido.`,
    };
  }

  if (currentMonthIndex > assignedMonthIndex) {
    const monthsRemaining = 12 - currentMonthIndex + assignedMonthIndex;

    return {
      plateNumber: normalizedPlate,
      lastDigit,
      assignedMonthIndex,
      assignedMonthName,
      assignedMonthShortName,
      level: 'danger',
      monthsRemaining,
      inAdvanceWindow: false,
      isExpired: true,
      evaluatedYear,
      message: `El RTV venció en ${assignedMonthName} de ${evaluatedYear}. El vehículo circula sin revisión técnica vigente; programe la cita de inmediato.`,
    };
  }

  const monthsRemaining = assignedMonthIndex - currentMonthIndex;

  return {
    plateNumber: normalizedPlate,
    lastDigit,
    assignedMonthIndex,
    assignedMonthName,
    assignedMonthShortName,
    level: 'info',
    monthsRemaining,
    inAdvanceWindow: false,
    isExpired: false,
    evaluatedYear,
    message: `Faltan ${monthsRemaining} ${monthsRemaining === 1 ? 'mes' : 'meses'} para su mes de RTV (${assignedMonthName} de ${targetYear}). Recuerde agendar la cita con anticipación.`,
  };
}

/** Texto legible para la cantidad de meses restantes. */
export function formatMonthsRemaining(monthsRemaining: number): string {
  if (monthsRemaining <= 0) {
    return 'Ahora mismo';
  }

  if (monthsRemaining === 1) {
    return '1 mes';
  }

  return `${monthsRemaining} meses`;
}
