import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

import { getObd2Code, getOdometerSnapshot, BASE_URL } from '../services/api.js';
import type {
  MaintenanceResponse,
  Obd2Code,
  Obd2Severity,
  OdometerReading,
  OdometerSnapshot,
} from '../services/api.js';
import { MaintenanceModal } from './MaintenanceModal.js';
import { OdometerModal } from './OdometerModal.js';
import { RtvAlertCard } from './RtvAlertCard.js';

/** Vehículo y código usados para la demostración del panel. */
const DEMO_VEHICLE_ID = 1;
const DEMO_OBD2_CODE = 'P0300';
/** Placa del vehículo demo (define el mes de RTV por su último dígito: 5 -> mayo). */
const DEMO_VEHICLE_PLATE = 'B12345';

/** Milisegundos que tiene un día. */
const MS_PER_DAY = 24 * 60 * 60 * 1000;

type StatusTone = 'success' | 'warning' | 'danger' | 'neutral';

interface UsageSummary {
  kilometersDriven: number;
  daysElapsed: number;
  dailyAverageKm: number;
  weeklyAverageKm: number;
}

const numberFormatter = new Intl.NumberFormat('es-CO');
const rateFormatter = new Intl.NumberFormat('es-CO', {
  maximumFractionDigits: 1,
});
const dateTimeFormatter = new Intl.DateTimeFormat('es-CO', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const statusToneClasses: Record<StatusTone, string> = {
  success: 'bg-success text-white',
  warning: 'bg-warning text-primary',
  danger: 'bg-danger text-white',
  neutral: 'bg-slate-100 text-slate-600',
};

const statusDotClasses: Record<StatusTone, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  neutral: 'bg-slate-400',
};

const severityTone: Record<Obd2Severity, StatusTone> = {
  BAJA: 'success',
  MEDIA: 'warning',
  ALTA: 'danger',
  CRITICA: 'danger',
};

const metricToneClasses = {
  primary: 'bg-primary text-white',
  secondary: 'bg-secondary text-white',
  tertiary: 'bg-tertiary text-white',
} as const;

type MetricTone = keyof typeof metricToneClasses;

interface MetricCardProps {
  label: string;
  value: string;
  hint: string;
  icon: ReactNode;
  tone: MetricTone;
}

function MetricCard({ label, value, hint, icon, tone }: MetricCardProps) {
  return (
    <article className="rounded-2xl border border-line bg-surface p-5 shadow-card">
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm font-medium text-muted">{label}</p>
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${metricToneClasses[tone]}`}
          aria-hidden="true"
        >
          {icon}
        </span>
      </div>
      <p className="mt-3 font-secondary text-3xl font-extrabold tracking-tight text-foreground">
        {value}
      </p>
      <p className="mt-1 text-sm text-muted">{hint}</p>
    </article>
  );
}

function StatusPill({
  tone,
  children,
}: {
  tone: StatusTone;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${statusToneClasses[tone]}`}
    >
      {children}
    </span>
  );
}

function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div
      role="alert"
      className="mt-6 rounded-xl border border-danger bg-surface p-4"
    >
      <p className="text-sm font-bold text-danger">
        No se pudieron cargar los datos
      </p>
      <p className="mt-1 text-sm text-muted">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 rounded-lg border border-line px-3 py-2 text-xs font-semibold text-foreground transition hover:bg-background focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary"
      >
        Reintentar
      </button>
    </div>
  );
}

function LoadingRows({ label }: { label: string }) {
  return (
    <div className="mt-6 space-y-3" role="status" aria-live="polite">
      {[0, 1, 2].map((item) => (
        <div
          key={item}
          className="h-20 animate-pulse rounded-xl bg-background"
        />
      ))}
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function Dashboard() {
  const [snapshot, setSnapshot] = useState<OdometerSnapshot | null>(null);
  const [obd2, setObd2] = useState<Obd2Code | null>(null);
  const [isLoadingOdometer, setIsLoadingOdometer] = useState(true);
  const [isLoadingObd2, setIsLoadingObd2] = useState(true);
  const [odometerError, setOdometerError] = useState<string | null>(null);
  const [obd2Error, setObd2Error] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isOdometerModalOpen, setIsOdometerModalOpen] = useState(false);
  const [isMaintenanceModalOpen, setIsMaintenanceModalOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    const loadData = async (): Promise<void> => {
      setIsLoadingOdometer(true);
      setIsLoadingObd2(true);
      setOdometerError(null);
      setObd2Error(null);

      const [odometerResult, obd2Result] = await Promise.allSettled([
        getOdometerSnapshot(DEMO_VEHICLE_ID, 10),
        getObd2Code(DEMO_OBD2_CODE),
      ]);

      if (!isActive) {
        return;
      }

      if (odometerResult.status === 'fulfilled') {
        setSnapshot(odometerResult.value);
      } else {
        setOdometerError(
          toErrorMessage(
            odometerResult.reason,
            'No se pudo obtener el odómetro del vehículo.',
          ),
        );
      }
      setIsLoadingOdometer(false);

      if (obd2Result.status === 'fulfilled') {
        setObd2(obd2Result.value);
      } else {
        setObd2Error(
          toErrorMessage(
            obd2Result.reason,
            'No se pudo consultar el código OBD-II.',
          ),
        );
      }
      setIsLoadingObd2(false);
    };

    void loadData();

    return () => {
      isActive = false;
    };
  }, [refreshKey]);

  const latestReading = snapshot?.readings[0] ?? null;
  const recentReadings = snapshot?.readings.slice(0, 6) ?? [];
  const usage = snapshot ? calculateUsage(snapshot.readings) : null;
  const hasError = odometerError !== null || obd2Error !== null;
  const isLoading = isLoadingOdometer || isLoadingObd2;

  const headerTone: StatusTone = isLoading
    ? 'neutral'
    : hasError
      ? 'danger'
      : 'success';
  const headerStatus = isLoading
    ? 'Cargando datos'
    : hasError
      ? 'Error de conexión'
      : 'Datos en vivo';

  const handleRefresh = (): void => {
    setRefreshKey((value) => value + 1);
  };

  const handleOdometerSuccess = (reading: OdometerReading): void => {
    setSnapshot((current) => {
      if (!current) {
        return current;
      }

      const readings = [
        ...current.readings.filter((item) => item.id !== reading.id),
        reading,
      ]
        .sort(
          (a, b) =>
            new Date(b.recordedAt).getTime() -
              new Date(a.recordedAt).getTime() || b.id - a.id,
        )
        .slice(0, 10);

      return {
        ...current,
        currentKilometers: Math.max(
          current.currentKilometers,
          reading.kilometers,
        ),
        readings,
      };
    });

    if (snapshot === null) {
      setRefreshKey((value) => value + 1);
    }

    setIsOdometerModalOpen(false);
    setOdometerError(null);
    setSuccessMessage(
      `Lectura registrada: ${numberFormatter.format(reading.kilometers)} km.`,
    );
  };

  const handleMaintenanceSuccess = (record: MaintenanceResponse): void => {
    setSuccessMessage(
      `Mantenimiento registrado. Próximo servicio: ${numberFormatter.format(record.nextServiceKilometers)} km.`,
    );
  };

  return (
    <div className="space-y-6">
      {/* Encabezado del vehículo */}
      <section className="flex flex-col gap-5 rounded-2xl border border-line bg-surface p-6 shadow-card sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-secondary">
            Panel del vehículo
          </p>
          <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
            Toyota Corolla 2018
          </h1>
          <p className="mt-1 text-sm text-muted">
            Vehículo demo #{DEMO_VEHICLE_ID} · Placa {DEMO_VEHICLE_PLATE} ·
            Datos obtenidos desde la API.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <StatusPill tone={headerTone}>{headerStatus}</StatusPill>
          <button
            type="button"
            onClick={() => setIsMaintenanceModalOpen(true)}
            className="rounded-xl border border-line px-4 py-2.5 text-sm font-semibold text-foreground transition hover:bg-background focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary"
          >
            Registrar mantenimiento
          </button>
          <button
            type="button"
            onClick={() => setIsOdometerModalOpen(true)}
            className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2"
          >
            Registrar lectura
          </button>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isLoading}
            className="rounded-xl border border-line px-4 py-2.5 text-sm font-semibold text-foreground transition hover:bg-background focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? 'Actualizando…' : 'Actualizar'}
          </button>
        </div>
      </section>

      {/* Alerta de RTV (Costa Rica) según el último dígito de la placa */}
      <RtvAlertCard plateNumber={DEMO_VEHICLE_PLATE} />

      {successMessage ? (
        <div
          role="status"
          className="flex items-start justify-between gap-4 rounded-2xl border border-success bg-surface p-4 shadow-card"
        >
          <div className="flex items-start gap-3">
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-success text-sm font-extrabold text-white"
              aria-hidden="true"
            >
              ✓
            </span>
            <div>
              <p className="text-sm font-bold text-foreground">
                Operación completada
              </p>
              <p className="mt-1 text-sm text-muted">{successMessage}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSuccessMessage(null)}
            aria-label="Cerrar confirmación"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line text-lg leading-none text-muted transition hover:bg-background hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary"
          >
            ×
          </button>
        </div>
      ) : null}

      {/* Indicadores principales */}
      <section
        aria-label="Resumen del vehículo"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
      >
        <MetricCard
          label="Odómetro actual"
          value={
            isLoadingOdometer
              ? 'Cargando…'
              : snapshot
                ? `${numberFormatter.format(snapshot.currentKilometers)} km`
                : '—'
          }
          hint={
            latestReading
              ? `Última lectura: ${formatDateTime(latestReading.recordedAt)}`
              : 'Sin lecturas registradas.'
          }
          icon={<GaugeIcon />}
          tone="primary"
        />
        <MetricCard
          label="Tasa de uso"
          value={
            isLoadingOdometer
              ? 'Cargando…'
              : usage
                ? `${rateFormatter.format(usage.dailyAverageKm)} km/día`
                : 'Sin datos'
          }
          hint={
            usage
              ? `${rateFormatter.format(usage.weeklyAverageKm)} km por semana · ${numberFormatter.format(usage.kilometersDriven)} km en ${rateFormatter.format(usage.daysElapsed)} días`
              : 'Se necesitan al menos dos lecturas con fechas distintas.'
          }
          icon={<TrendIcon />}
          tone="secondary"
        />
        <MetricCard
          label="Lecturas cargadas"
          value={
            isLoadingOdometer
              ? 'Cargando…'
              : snapshot
                ? numberFormatter.format(snapshot.readings.length)
                : '—'
          }
          hint={
            snapshot
              ? `Kilometraje inicial: ${numberFormatter.format(snapshot.initialKilometers)} km`
              : 'Historial de odómetro del vehículo.'
          }
          icon={<CalendarIcon />}
          tone="tertiary"
        />
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,1fr)]">
        {/* Lecturas reales de odómetro */}
        <section
          className="rounded-2xl border border-line bg-surface p-6 shadow-card"
          aria-busy={isLoadingOdometer}
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-bold tracking-tight text-foreground">
                Lecturas recientes
              </h2>
              <p className="mt-1 text-sm text-muted">
                Historial de odómetro del vehículo demo (F03).
              </p>
            </div>
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
              Máximo 10 lecturas
            </span>
          </div>

          {isLoadingOdometer ? (
            <LoadingRows label="Cargando lecturas de odómetro…" />
          ) : odometerError ? (
            <ErrorState message={odometerError} onRetry={handleRefresh} />
          ) : recentReadings.length === 0 ? (
            <p className="mt-6 rounded-xl border border-line bg-background p-4 text-sm text-muted">
              Aún no hay lecturas registradas para este vehículo.
            </p>
          ) : (
            <div className="mt-6 space-y-3">
              {recentReadings.map((reading, index) => (
                <ReadingRow
                  key={reading.id}
                  reading={reading}
                  previousReading={recentReadings[index + 1]}
                  isLatest={index === 0}
                />
              ))}
            </div>
          )}
        </section>

        {/* Columna lateral */}
        <div className="space-y-6">
          {/* Odómetro */}
          <section className="rounded-2xl bg-primary p-6 text-white shadow-card">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">
                Odómetro
              </p>
              <span className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-medium text-slate-200">
                {isLoadingOdometer
                  ? 'Cargando'
                  : odometerError
                    ? 'Sin conexión'
                    : 'Actualizado'}
              </span>
            </div>

            <p className="mt-4 font-secondary text-4xl font-extrabold tracking-tight">
              {snapshot
                ? numberFormatter.format(snapshot.currentKilometers)
                : '—'}{' '}
              <span className="text-base font-semibold text-slate-300">km</span>
            </p>
            <p className="mt-1 text-sm text-slate-400">
              {latestReading
                ? `Última lectura: ${formatDateTime(latestReading.recordedAt)}`
                : 'Sin lecturas registradas.'}
            </p>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-white/10 p-3">
                <p className="text-[11px] uppercase tracking-[0.14em] text-slate-300">
                  Inicial
                </p>
                <p className="mt-1 font-secondary text-sm font-bold">
                  {snapshot
                    ? `${numberFormatter.format(snapshot.initialKilometers)} km`
                    : '—'}
                </p>
              </div>
              <div className="rounded-xl bg-white/10 p-3">
                <p className="text-[11px] uppercase tracking-[0.14em] text-slate-300">
                  Recorrido
                </p>
                <p className="mt-1 font-secondary text-sm font-bold">
                  {snapshot
                    ? `${numberFormatter.format(
                        Math.max(
                          snapshot.currentKilometers -
                            snapshot.initialKilometers,
                          0,
                        ),
                      )} km`
                    : '—'}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsOdometerModalOpen(true)}
              className="mt-6 w-full rounded-xl bg-secondary px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            >
              Registrar lectura
            </button>
          </section>

          {/* Estado de la conexión */}
          <section className="rounded-2xl border border-line bg-surface p-5 shadow-card">
            <div className="flex items-start gap-3">
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-secondary text-sm font-extrabold ${
                  hasError
                    ? 'bg-danger text-white'
                    : isLoading
                      ? 'bg-warning text-primary'
                      : 'bg-success text-white'
                }`}
                aria-hidden="true"
              >
                {hasError ? '!' : isLoading ? '…' : '✓'}
              </span>
              <div>
                <p className="font-secondary text-sm font-bold text-foreground">
                  {hasError
                    ? 'Problema de conexión'
                    : isLoading
                      ? 'Consultando la API'
                      : 'API conectada'}
                </p>
                <p className="mt-1 text-sm text-muted">
                  {hasError
                    ? `Verifica que la API esté disponible en ${getApiOrigin()}.`
                    : isLoading
                      ? 'Obteniendo odómetro y diagnóstico OBD-II.'
                      : 'Los datos mostrados provienen del backend y PostgreSQL.'}
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* Diagnóstico OBD-II real */}
      <section
        className="rounded-2xl border border-line bg-surface p-6 shadow-card"
        aria-busy={isLoadingObd2}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-tertiary">
              Diagnóstico OBD-II
            </p>
            <h2 className="mt-2 text-lg font-bold tracking-tight text-foreground">
              {obd2 ? `${obd2.code} · ${obd2.title}` : `Código ${DEMO_OBD2_CODE}`}
            </h2>
            <p className="mt-1 text-sm text-muted">
              {obd2
                ? obd2.category
                : 'Consulta del diccionario de códigos de diagnóstico (F10).'}
            </p>
          </div>
          {obd2 ? (
            <StatusPill tone={severityTone[obd2.severity]}>
              {obd2.severity}
            </StatusPill>
          ) : null}
        </div>

        {isLoadingObd2 ? (
          <LoadingRows label="Cargando diagnóstico OBD-II…" />
        ) : obd2Error ? (
          <ErrorState message={obd2Error} onRetry={handleRefresh} />
        ) : obd2 ? (
          <>
            <p className="mt-4 text-sm leading-relaxed text-muted">
              {obd2.description}
            </p>

            <div className="mt-6 grid gap-6 md:grid-cols-2">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-[0.14em] text-foreground">
                  Síntomas
                </h3>
                {obd2.symptoms.length === 0 ? (
                  <p className="mt-3 text-sm text-muted">
                    Sin síntomas registrados.
                  </p>
                ) : (
                  <ul className="mt-3 space-y-2 text-sm text-muted">
                    {obd2.symptoms.map((symptom, index) => (
                      <li
                        key={`${symptom}-${index}`}
                        className="flex items-start gap-2"
                      >
                        <span
                          className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-secondary"
                          aria-hidden="true"
                        />
                        <span>{symptom}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <h3 className="text-sm font-bold uppercase tracking-[0.14em] text-foreground">
                  Causas comunes
                </h3>
                {obd2.commonCauses.length === 0 ? (
                  <p className="mt-3 text-sm text-muted">
                    Sin causas registradas.
                  </p>
                ) : (
                  <ul className="mt-3 space-y-2 text-sm text-muted">
                    {obd2.commonCauses.map((cause, index) => (
                      <li
                        key={`${cause}-${index}`}
                        className="flex items-start gap-2"
                      >
                        <span
                          className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-warning"
                          aria-hidden="true"
                        />
                        <span>{cause}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </>
        ) : (
          <p className="mt-6 text-sm text-muted">
            No hay información disponible para este código.
          </p>
        )}
      </section>

      {isOdometerModalOpen ? (
        <OdometerModal
          vehicleId={DEMO_VEHICLE_ID}
          currentKilometers={snapshot?.currentKilometers ?? null}
          onClose={() => setIsOdometerModalOpen(false)}
          onSuccess={handleOdometerSuccess}
        />
      ) : null}

      {isMaintenanceModalOpen ? (
        <MaintenanceModal
          vehicleId={DEMO_VEHICLE_ID}
          onClose={() => setIsMaintenanceModalOpen(false)}
          onSuccess={handleMaintenanceSuccess}
        />
      ) : null}
    </div>
  );
}

function ReadingRow({
  reading,
  previousReading,
  isLatest,
}: {
  reading: OdometerReading;
  previousReading: OdometerReading | undefined;
  isLatest: boolean;
}) {
  const difference = previousReading
    ? reading.kilometers - previousReading.kilometers
    : null;

  return (
    <article className="flex flex-col gap-4 rounded-xl border border-line bg-background p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <span
          className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${
            isLatest ? statusDotClasses.success : statusDotClasses.neutral
          }`}
          aria-hidden="true"
        />
        <div>
          <p className="font-semibold text-foreground">
            {numberFormatter.format(reading.kilometers)} km
          </p>
          <p className="mt-0.5 text-sm text-muted">
            {formatDateTime(reading.recordedAt)}
          </p>
          {difference !== null ? (
            <p className="mt-1 text-xs text-muted">
              {difference >= 0 ? '+' : ''}
              {numberFormatter.format(difference)} km desde la lectura anterior
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end">
        <p className="font-secondary text-xs font-bold text-muted">
          Registro #{reading.id}
        </p>
        <StatusPill tone={isLatest ? 'success' : 'neutral'}>
          {isLatest ? 'Última' : 'Histórica'}
        </StatusPill>
      </div>
    </article>
  );
}

/** Calcula la tasa diaria y semanal usando las dos lecturas más recientes. */
function calculateUsage(
  readings: readonly OdometerReading[],
): UsageSummary | null {
  const [latest, previous] = readings;

  if (!latest || !previous) {
    return null;
  }

  const latestTime = new Date(latest.recordedAt).getTime();
  const previousTime = new Date(previous.recordedAt).getTime();

  if (!Number.isFinite(latestTime) || !Number.isFinite(previousTime)) {
    return null;
  }

  const daysElapsed = (latestTime - previousTime) / MS_PER_DAY;
  const kilometersDriven = latest.kilometers - previous.kilometers;

  if (daysElapsed <= 0 || kilometersDriven < 0) {
    return null;
  }

  const dailyAverageKm = kilometersDriven / daysElapsed;

  return {
    kilometersDriven,
    daysElapsed,
    dailyAverageKm,
    weeklyAverageKm: dailyAverageKm * 7,
  };
}

function formatDateTime(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Fecha no disponible';
  }

  return dateTimeFormatter.format(date);
}

function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return fallback;
}

/**
 * Origen (esquema + host) de la API configurada.
 *
 * Se usa en los mensajes de error para indicar la URL real que intenta
 * alcanzar el cliente: en local será `http://localhost:3001` y en producción
 * la URL de Render definida en `VITE_API_URL`.
 */
function getApiOrigin(): string {
  try {
    return new URL(BASE_URL).origin;
  } catch {
    return BASE_URL || 'la API configurada';
  }
}

function GaugeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 14l3.5-3.5M4.2 17.5a9 9 0 1 1 15.6 0"
      />
      <circle cx="12" cy="14" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

function TrendIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 17l6-6 4 4 8-8"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 7h6v6"
      />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path strokeLinecap="round" d="M16 3v4M8 3v4M3 11h18" />
    </svg>
  );
}
