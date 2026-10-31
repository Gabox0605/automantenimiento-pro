/**
 * Vista previa del panel que se muestra en la landing pública.
 *
 * Reproduce la estructura real del Dashboard (mismas tarjetas, mismos iconos)
 * pero con campos vacíos y valores de marcador, para que el visitante vea
 * "dónde irá la información de su vehículo" antes de crear una cuenta.
 *
 * No consulta la API: es una maqueta estática y accesible.
 */

import { Link } from 'react-router-dom';

import {
  CalendarIcon,
  GaugeIcon,
  MetricCard,
  StatusPill,
  TrendIcon,
} from './Dashboard.js';
import { RtvAlertCard } from './RtvAlertCard.js';

/** Campo del formulario de muestra, siempre deshabilitado. */
function MockField({
  label,
  placeholder,
  as = 'input',
}: {
  label: string;
  placeholder: string;
  as?: 'input' | 'select';
}) {
  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium text-foreground">
        {label}
      </span>
      {as === 'select' ? (
        <div className="flex w-full items-center justify-between rounded-xl border border-dashed border-line bg-background px-3.5 py-2.5 text-sm text-muted">
          <span>{placeholder}</span>
          <span aria-hidden="true">▾</span>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-line bg-background px-3.5 py-2.5 text-sm text-muted">
          {placeholder}
        </div>
      )}
    </div>
  );
}

export function LandingPreview() {
  return (
    <div
      aria-label="Vista previa del panel de control"
      className="overflow-hidden rounded-3xl border border-line bg-surface shadow-card"
    >
      {/* Marco simulado de navegador */}
      <div className="flex items-center gap-3 border-b border-line bg-background px-4 py-3">
        <span className="flex gap-1.5" aria-hidden="true">
          <span className="h-2.5 w-2.5 rounded-full bg-danger/60" />
          <span className="h-2.5 w-2.5 rounded-full bg-warning/60" />
          <span className="h-2.5 w-2.5 rounded-full bg-success/60" />
        </span>
        <span className="truncate rounded-lg border border-line bg-surface px-3 py-1 text-xs text-muted">
          automantenimiento-pro.vercel.app/vehiculos/1
        </span>
      </div>

      <div className="space-y-5 bg-background p-4 sm:p-6">
        {/* Cabecera simulada del panel */}
        <section className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-secondary">
              Panel del vehículo
            </p>
            <h3 className="mt-2 text-2xl font-extrabold tracking-tight text-foreground">
              Tu vehículo
            </h3>
            <p className="mt-1 text-sm text-muted">
              Marca · Modelo · Año · Motorización · Placa ·{' '}
              <span className="opacity-60">especificaciones de fábrica</span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone="neutral">Vista previa</StatusPill>
            <span className="rounded-xl border border-line px-4 py-2.5 text-sm font-semibold text-muted">
              Registrar lectura
            </span>
            <span className="rounded-xl bg-secondary px-4 py-2.5 text-sm font-semibold text-white opacity-70">
              Registrar mantenimiento
            </span>
          </div>
        </section>

        {/* Métricas con valores vacíos: aquí irá la información real */}
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <MetricCard
            label="Odómetro actual"
            value="—"
            hint="Aquí verás el kilometraje de tu vehículo."
            icon={<GaugeIcon />}
            tone="primary"
          />
          <MetricCard
            label="Tasa de uso"
            value="—"
            hint="Promedio diario y semanal calculado de tus lecturas."
            icon={<TrendIcon />}
            tone="secondary"
          />
          <MetricCard
            label="Próximo servicio"
            value="—"
            hint="Fecha objetivo según tu ritmo de manejo."
            icon={<CalendarIcon />}
            tone="tertiary"
          />
        </section>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,1fr)]">
          {/* Formulario vacío: la estructura completa, sin datos */}
          <section className="rounded-2xl border border-line bg-surface p-5 shadow-card">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h4 className="font-secondary text-base font-bold text-foreground">
                  Registrar mantenimiento
                </h4>
                <p className="mt-0.5 text-xs text-muted">
                  Los campos aparecen vacíos: aquí irá la información de tu
                  vehículo.
                </p>
              </div>
              <StatusPill tone="neutral">Ejemplo</StatusPill>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <MockField label="Tipo de servicio" placeholder="Selecciona un servicio" as="select" />
              <MockField label="Lectura del servicio (km)" placeholder="Ej. 45 500" />
              <MockField label="Intervalo en km" placeholder="Ej. 10 000" />
              <MockField label="Intervalo en meses" placeholder="Ej. 12" />
            </div>

            <div className="mt-4 rounded-xl border border-dashed border-line bg-background px-4 py-2.5 text-center text-sm font-semibold text-muted">
              Registrar mantenimiento
            </div>

            <p className="mt-3 text-xs text-muted">
              El sistema valida tu intervalo contra el límite de fábrica y te
              avisa si lo excedes.
            </p>
          </section>

          {/* Alerta RTV real (misma lógica que en la app) */}
          <div className="flex flex-col gap-4">
            <RtvAlertCard
              plateNumber="ABC1231"
              rtvAlDia
              className="shadow-none"
            />
            <section className="rounded-2xl border border-line bg-surface p-5 shadow-card">
              <h4 className="font-secondary text-base font-bold text-foreground">
                Historial
              </h4>
              <ul className="mt-3 space-y-2" aria-hidden="true">
                {[0, 1, 2].map((row) => (
                  <li
                    key={row}
                    className="flex items-center justify-between rounded-xl border border-dashed border-line bg-background px-3 py-2.5"
                  >
                    <span className="text-sm text-muted">— — —</span>
                    <span className="text-xs text-muted/70">fecha</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-muted">
                Cada lectura y mantenimiento quedará registrado aquí.
              </p>
              <Link
                to="/registro"
                className="mt-4 inline-block w-full rounded-xl border border-line px-4 py-2.5 text-center text-sm font-semibold text-foreground transition hover:bg-background"
              >
                Crear mi cuenta
              </Link>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
