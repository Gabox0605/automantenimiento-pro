/**
 * Landing pública (`/`).
 *
 * Es lo primero que ve un visitante sin sesión: presenta la aplicación y
 * muestra una vista previa real del panel (con los formularios vacíos donde
 * irá la información de su vehículo) antes de pedirle que se registre.
 *
 * Si ya hay sesión, la ruta `/` redirige a /vehiculos (ver App.tsx).
 */

import { Link } from 'react-router-dom';

import { LandingPreview } from '../components/LandingPreview.js';

/** Funcionalidades principales, referenciadas por su código en el PRD. */
const FEATURES: Array<{ code: string; title: string; description: string }> = [
  {
    code: 'F01',
    title: 'Registro de vehículos',
    description:
      'Marca, modelo, año, motorización y kilometraje inicial. Incluye la declaración de si el vehículo está al día con la RTV.',
  },
  {
    code: 'F03 · F04',
    title: 'Kilometraje diario',
    description:
      'Registra tus lecturas y calcula tu tasa de uso promedio por día y por semana.',
  },
  {
    code: 'F02 · F05',
    title: 'Límites de fábrica',
    description:
      'Cada mantenimiento se valida contra el intervalo máximo recomendado por el fabricante y te avisa si lo excedes.',
  },
  {
    code: 'F06 · F07',
    title: 'Historial y próximo servicio',
    description:
      'Todo tu historial con taller, costos y fecha, más la proyección del próximo kilometraje objetivo.',
  },
  {
    code: 'F09',
    title: 'Semáforo de alertas',
    description:
      'Estado en tiempo real: al día, próximo a vencer o vencido, según tu ritmo de manejo.',
  },
  {
    code: 'F10',
    title: 'Códigos OBD-II',
    description:
      'Consulta e interpretación sencilla de códigos de diagnóstico: causas, síntomas y severidad.',
  },
  {
    code: 'RTV',
    title: 'Revisión técnica vehicular',
    description:
      'Alertas por el mes que corresponde a tu placa y aviso cuando el vehículo está al día con la revisión.',
  },
  {
    code: 'km / mi',
    title: 'Kilómetros o millas',
    description:
      'Vehículos importados: indica en qué unidad registra tu tablero y el sistema hace la conversión por ti.',
  },
];

export function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Barra pública (solo navegación de acceso) */}
      <header className="border-b border-white/10 bg-primary text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-4 py-4 sm:px-6 lg:px-8">
          <Link to="/" className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary font-secondary text-sm font-extrabold tracking-tight text-white shadow-sm">
              AM
            </span>
            <span>
              <span className="block font-secondary text-base font-bold leading-tight">
                AutoMantenimiento Pro
              </span>
              <span className="block text-xs text-slate-400">
                Mantenimiento preventivo inteligente
              </span>
            </span>
          </Link>

          <nav aria-label="Acceso" className="flex items-center gap-2">
            <Link
              to="/login"
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-200 transition hover:bg-white/10 hover:text-white"
            >
              Iniciar sesión
            </Link>
            <Link
              to="/registro"
              className="rounded-lg bg-secondary px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
            >
              Crear cuenta
            </Link>
          </nav>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="mx-auto max-w-7xl px-4 pb-12 pt-14 sm:px-6 lg:px-8 lg:pt-20">
          <div className="max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs font-semibold text-muted">
              <span className="h-2 w-2 rounded-full bg-success" aria-hidden="true" />
              Preventivo, reactivo y a tu medida
            </span>

            <h1 className="mt-5 font-secondary text-4xl font-extrabold leading-tight tracking-tight text-foreground sm:text-5xl">
              El mantenimiento de tu vehículo,
              <span className="text-secondary"> bajo control</span>
            </h1>

            <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted sm:text-lg">
              Registra tus vehículos, lleva el kilometraje, valida cada
              servicio contra los límites de fábrica y recibe alertas antes de
              que algo se venza. Incluye RTV, códigos OBD-II y soporte para
              vehículos que miden en millas.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                to="/registro"
                className="inline-flex items-center justify-center rounded-xl bg-secondary px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90"
              >
                Crear mi cuenta gratis
              </Link>
              <Link
                to="/login"
                className="inline-flex items-center justify-center rounded-xl border border-line bg-surface px-6 py-3 text-sm font-semibold text-foreground transition hover:bg-background"
              >
                Ya tengo cuenta
              </Link>
            </div>

            <p className="mt-4 text-xs text-muted">
              Cada cuenta ve <strong>únicamente</strong> sus propios vehículos.
            </p>
          </div>
        </section>

        {/* Vista previa del panel */}
        <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
          <div className="mb-5 flex flex-col gap-1">
            <h2 className="font-secondary text-2xl font-extrabold tracking-tight text-foreground">
              Así se verá tu panel
            </h2>
            <p className="text-sm text-muted">
              Los campos están vacíos: así se llenan en cuanto registres tu
              primer vehículo.
            </p>
          </div>
          <LandingPreview />
        </section>

        {/* Funcionalidades */}
        <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
          <h2 className="font-secondary text-2xl font-extrabold tracking-tight text-foreground">
            Qué incluye
          </h2>

          <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((feature) => (
              <li
                key={feature.code}
                className="rounded-2xl border border-line bg-surface p-5 shadow-card"
              >
                <span className="inline-flex items-center rounded-lg bg-secondary/10 px-2 py-0.5 font-secondary text-[11px] font-extrabold uppercase tracking-wider text-secondary">
                  {feature.code}
                </span>
                <h3 className="mt-3 font-secondary text-base font-bold text-foreground">
                  {feature.title}
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">
                  {feature.description}
                </p>
              </li>
            ))}
          </ul>
        </section>

        {/* CTA final */}
        <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8">
          <div className="rounded-3xl border border-line bg-surface p-8 text-center shadow-card sm:p-12">
            <h2 className="font-secondary text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
              Empieza por registrar tu vehículo
            </h2>
            <p className="mx-auto mt-2 max-w-xl text-sm text-muted sm:text-base">
              Solo toma un minuto. Después podrás cargar tus lecturas y
              mantenimientos en segundos.
            </p>
            <Link
              to="/registro"
              className="mt-6 inline-flex items-center justify-center rounded-xl bg-secondary px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90"
            >
              Crear cuenta
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-line px-4 py-6 text-center text-xs text-muted sm:px-6 lg:px-8">
        AutoMantenimiento Pro · Gestión inteligente del mantenimiento
        preventivo y correctivo de vehículos.
      </footer>
    </div>
  );
}
