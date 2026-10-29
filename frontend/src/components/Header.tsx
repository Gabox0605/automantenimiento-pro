export function Header() {
  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-primary text-white shadow-lg shadow-slate-900/10">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-4 py-4 sm:px-6 lg:px-8">
        <a href="/" className="flex items-center gap-3">
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
        </a>

        <nav
          aria-label="Navegación principal"
          className="hidden items-center gap-1 md:flex"
        >
          <a
            href="/"
            className="rounded-lg bg-white/10 px-3 py-2 text-sm font-medium text-white"
          >
            Panel
          </a>
          <a
            href="/"
            className="rounded-lg px-3 py-2 text-sm font-medium text-slate-300 transition hover:bg-white/5 hover:text-white"
          >
            Mantenimientos
          </a>
          <a
            href="/"
            className="rounded-lg px-3 py-2 text-sm font-medium text-slate-300 transition hover:bg-white/5 hover:text-white"
          >
            Diagnóstico
          </a>
        </nav>

        <div className="hidden items-center gap-2 rounded-full border border-white/15 px-3 py-1.5 text-xs text-slate-300 sm:flex">
          <span className="h-2 w-2 rounded-full bg-success" aria-hidden="true" />
          Toyota Corolla · ABC-1234
        </div>
      </div>
    </header>
  );
}
