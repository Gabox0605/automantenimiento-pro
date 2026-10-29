import type { ReactNode } from 'react';

type StatusTone = 'success' | 'warning' | 'danger' | 'neutral';

interface MaintenanceItem {
  id: number;
  service: string;
  date: string;
  kilometers: number;
  cost: number;
  shop: string;
  status: StatusTone;
  statusLabel: string;
  detail: string;
}

const maintenanceItems: MaintenanceItem[] = [
  {
    id: 1,
    service: 'Cambio de aceite',
    date: '5 ago 2026',
    kilometers: 45_000,
    cost: 185_000,
    shop: 'Taller Central',
    status: 'warning',
    statusLabel: 'Próximo',
    detail: 'Próximo servicio a los 55.000 km (2.600 km restantes)',
  },
  {
    id: 2,
    service: 'Filtro de aire',
    date: '12 sep 2026',
    kilometers: 48_900,
    cost: 65_000,
    shop: 'Taller Central',
    status: 'success',
    statusLabel: 'Al día',
    detail: 'Próximo servicio a los 63.900 km',
  },
  {
    id: 3,
    service: 'Frenos delanteros',
    date: '6 oct 2026',
    kilometers: 50_650,
    cost: 320_000,
    shop: 'Frenos del Norte',
    status: 'success',
    statusLabel: 'Al día',
    detail: 'Próximo servicio a los 70.650 km',
  },
];

const numberFormatter = new Intl.NumberFormat('es-CO');
const currencyFormatter = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
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

export function Dashboard() {
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
            Corolla de casa · ABC-1234 · Gasolina
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <StatusPill tone="warning">Próximo servicio</StatusPill>
          <button
            type="button"
            className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2"
          >
            Registrar lectura
          </button>
        </div>
      </section>

      {/* Indicadores principales */}
      <section
        aria-label="Resumen del vehículo"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
      >
        <MetricCard
          label="Odómetro actual"
          value={`${numberFormatter.format(52_400)} km`}
          hint="Última lectura: 26 oct 2026"
          icon={<GaugeIcon />}
          tone="primary"
        />
        <MetricCard
          label="Tasa de uso"
          value="47,3 km/día"
          hint="331 km por semana en promedio"
          icon={<TrendIcon />}
          tone="secondary"
        />
        <MetricCard
          label="Próximo servicio"
          value={`${numberFormatter.format(55_000)} km`}
          hint="Cambio de aceite · 2.600 km restantes"
          icon={<CalendarIcon />}
          tone="tertiary"
        />
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,1fr)]">
        {/* Historial de mantenimientos */}
        <section className="rounded-2xl border border-line bg-surface p-6 shadow-card">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-bold tracking-tight text-foreground">
                Mantenimientos recientes
              </h2>
              <p className="mt-1 text-sm text-muted">
                Servicios registrados y próximos vencimientos.
              </p>
            </div>
            <a
              href="/"
              className="text-sm font-semibold text-secondary transition hover:underline"
            >
              Ver historial completo
            </a>
          </div>

          <div className="mt-6 space-y-3">
            {maintenanceItems.map((item) => (
              <article
                key={item.id}
                className="flex flex-col gap-4 rounded-xl border border-line bg-background p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${statusDotClasses[item.status]}`}
                    aria-hidden="true"
                  />
                  <div>
                    <p className="font-semibold text-foreground">{item.service}</p>
                    <p className="mt-0.5 text-sm text-muted">
                      {item.date} · {numberFormatter.format(item.kilometers)} km ·{' '}
                      {item.shop}
                    </p>
                    <p className="mt-1 text-xs text-muted">{item.detail}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end">
                  <p className="font-secondary text-sm font-bold text-foreground">
                    {currencyFormatter.format(item.cost)}
                  </p>
                  <StatusPill tone={item.status}>{item.statusLabel}</StatusPill>
                </div>
              </article>
            ))}
          </div>
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
                Actualizado
              </span>
            </div>

            <p className="mt-4 font-secondary text-4xl font-extrabold tracking-tight">
              52.400{' '}
              <span className="text-base font-semibold text-slate-300">km</span>
            </p>
            <p className="mt-1 text-sm text-slate-400">
              Última lectura: 26 oct 2026
            </p>

            <div className="mt-6">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>45.000 km</span>
                <span>55.000 km</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                <div className="h-full w-[74%] rounded-full bg-tertiary" />
              </div>
              <p className="mt-2 text-xs text-slate-400">
                74% del intervalo de aceite recorrido
              </p>
            </div>

            <button
              type="button"
              className="mt-6 w-full rounded-xl bg-secondary px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            >
              Actualizar odómetro
            </button>
          </section>

          {/* Advertencia de fábrica */}
          <section className="rounded-2xl border border-line bg-surface p-5 shadow-card">
            <div className="flex items-start gap-3">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-warning font-secondary text-sm font-extrabold text-primary"
                aria-hidden="true"
              >
                !
              </span>
              <div>
                <p className="font-secondary text-sm font-bold text-foreground">
                  Advertencia de fábrica
                </p>
                <p className="mt-1 text-sm text-muted">
                  El intervalo de aceite de 12.000 km supera el máximo
                  recomendado de 10.000 km para este motor.
                </p>
              </div>
            </div>
          </section>

          {/* Diagnóstico OBD-II */}
          <section className="rounded-2xl border border-line bg-surface p-5 shadow-card">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-tertiary">
                Diagnóstico OBD-II
              </p>
              <StatusPill tone="danger">ALTA</StatusPill>
            </div>
            <p className="mt-3 font-secondary text-lg font-extrabold text-foreground">
              P0300
            </p>
            <p className="mt-1 text-sm text-muted">
              Falla de encendido aleatoria o múltiple.
            </p>
            <button
              type="button"
              className="mt-4 w-full rounded-xl border border-line px-4 py-2.5 text-sm font-semibold text-foreground transition hover:bg-background focus:outline-none focus-visible:ring-2 focus-visible:ring-tertiary"
            >
              Ver interpretación
            </button>
          </section>
        </div>
      </div>
    </div>
  );
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
