import type { ReactNode } from 'react';

import {
  getRtvStatus,
  RTV_MONTH_NAMES,
  RTV_MONTH_SHORT_NAMES,
} from '../utils/rtvHelper.js';
import type { RtvStatusLevel } from '../utils/rtvHelper.js';

/** Mapa de tonos visuales por nivel de urgencia RTV. */
const levelStyles: Record<
  RtvStatusLevel,
  {
    container: string;
    pill: string;
    monthChip: string;
    badge: string;
    title: string;
    icon: ReactNode;
  }
> = {
  info: {
    container: 'border-secondary/50 bg-surface',
    pill: 'bg-secondary text-white',
    monthChip: 'bg-secondary/10 text-secondary',
    badge: 'bg-secondary text-white',
    title: 'Próximo a vencer',
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        className="h-6 w-6"
        aria-hidden="true"
      >
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path strokeLinecap="round" d="M16 3v4M8 3v4M3 11h18" />
        <circle cx="12" cy="16" r="1.6" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  warning: {
    container: 'border-warning bg-surface',
    pill: 'bg-warning text-primary',
    monthChip: 'bg-warning/15 text-primary',
    badge: 'bg-warning text-primary',
    title: 'Mes de RTV',
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        className="h-6 w-6"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="9" />
        <path strokeLinecap="round" d="M12 7v5l3 3" />
      </svg>
    ),
  },
  danger: {
    container: 'border-danger bg-surface',
    pill: 'bg-danger text-white',
    monthChip: 'bg-danger/10 text-danger',
    badge: 'bg-danger text-white',
    title: 'RTV vencido',
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        className="h-6 w-6"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 4.5L2.8 20h18.4L12 4.5z"
        />
        <path strokeLinecap="round" d="M12 10v4" />
        <circle cx="12" cy="17" r="1" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
};

/** Lista compacta del calendario RTV oficial (placa -> mes). */
function RtvCalendarStrip({ activeMonthIndex }: { activeMonthIndex: number }) {
  return (
    <ol
      aria-label="Calendario RTV por último dígito de placa"
      className="mt-5 grid grid-cols-5 gap-1.5 sm:grid-cols-10"
    >
      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((digit) => {
        const monthIndex = digit === 0 ? 9 : digit - 1;
        const isActive = monthIndex === activeMonthIndex;

        return (
          <li
            key={digit}
            className={`rounded-lg border px-1.5 py-2 text-center ${
              isActive
                ? 'border-line bg-primary text-white'
                : 'border-line bg-background text-muted'
            }`}
            title={`Placa terminada en ${digit}: ${RTV_MONTH_NAMES[monthIndex]}`}
          >
            <p className="font-secondary text-sm font-extrabold leading-none">
              {digit}
            </p>
            <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide">
              {RTV_MONTH_SHORT_NAMES[monthIndex]}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

export interface RtvAlertCardProps {
  /** Número de placa del vehículo (ej. "B123456"). */
  plateNumber: string;
  /**
   * Declaración capturada en el alta: el vehículo está al día con la RTV.
   * Si es true, jamás se muestra como vencido y el próximo ciclo salta al
   * año siguiente.
   */
  rtvAlDia?: boolean;
  /** Fecha de referencia opcional (principalmente para pruebas). */
  referenceDate?: Date;
  /** Clases adicionales para ajustar el layout en el Dashboard. */
  className?: string;
}

/**
 * Tarjeta de alerta de Revisión Técnica Vehicular (RTV - Costa Rica).
 *
 * Muestra el mes asignado por el último dígito de la placa, el nivel de
 * urgencia actual (vencido / mes de RTV / próximo) y un recordatorio para el
 * usuario.
 */
export function RtvAlertCard({
  plateNumber,
  rtvAlDia = false,
  referenceDate,
  className = '',
}: RtvAlertCardProps) {
  const status = getRtvStatus(
    plateNumber,
    referenceDate ?? new Date(),
    { rtvAlDia },
  );

  // Sin placa utilizable (sin dígitos): no hay nada que alertar.
  if (!status) {
    return null;
  }

  const styles = levelStyles[status.level];
  // Con la declaración "al día", el nivel siempre es 'info' pero el rótulo y
  // el título reflejan que el usuario ya aprobó la revisión.
  const levelBadgeLabel = status.isAlDia
    ? 'Al día'
    : status.level === 'danger'
      ? 'RTV vencido'
      : status.level === 'warning'
        ? status.inAdvanceWindow
          ? 'Mes de adelanto'
          : 'Mes de RTV'
        : 'RTV programado';
  const cardTitle = status.isAlDia ? 'RTV al día' : styles.title;

  return (
    <section
      aria-label={`Estado de Revisión Técnica Vehicular de la placa ${status.plateNumber}`}
      className={`rounded-2xl border-2 ${styles.container} p-5 shadow-card sm:p-6 ${className}`}
    >
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-4">
          <span
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${styles.badge}`}
            aria-hidden="true"
          >
            {styles.icon}
          </span>

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                Revisión Técnica Vehicular (RTV)
              </p>
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${styles.pill}`}
              >
                {levelBadgeLabel}
              </span>
            </div>

            <h2 className="mt-1.5 font-secondary text-xl font-extrabold tracking-tight text-foreground">
              {cardTitle}
            </h2>

            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
              {status.message}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-start gap-3 lg:items-end">
          {/* Placa y mes asignado */}
          <div className="flex items-center gap-2">
            <span className="rounded-lg border border-line bg-background px-3 py-2 font-secondary text-sm font-extrabold tracking-[0.14em] text-foreground">
              {status.plateNumber}
            </span>
            <span
              className={`rounded-lg px-3 py-2 font-secondary text-sm font-extrabold ${styles.monthChip}`}
            >
              Mes asignado: {status.assignedMonthName}
            </span>
          </div>

          <p className="text-sm text-muted">
            {status.level === 'danger'
              ? `Venció en ${status.assignedMonthName} ${status.evaluatedYear}`
              : status.level === 'warning'
                ? status.inAdvanceWindow
                  ? `Puede realizarla ahora (adelanto para ${status.assignedMonthName})`
                  : `Realícela antes del cierre de ${status.assignedMonthName}`
                : `Faltan ${status.monthsRemaining} ${
                    status.monthsRemaining === 1 ? 'mes' : 'meses'
                  }`}
          </p>
        </div>
      </div>

      <RtvCalendarStrip activeMonthIndex={status.assignedMonthIndex} />

      <p className="mt-3 text-xs text-muted">
        Placa {status.plateNumber} · Último dígito {status.lastDigit} →{' '}
        {status.assignedMonthName}. El mes de adelanto permitido es{' '}
        {
          RTV_MONTH_SHORT_NAMES[
            (status.assignedMonthIndex + 11) % 12
          ]
        }
        .
      </p>
    </section>
  );
}
