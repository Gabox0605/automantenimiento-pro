/**
 * Shell de la zona autenticada: cabecera + contenido + pie.
 * Se usa como ruta layout (renderiza las rutas hijas con <Outlet />).
 */

import { Outlet } from 'react-router-dom';

import { Header } from './Header.js';

export function AppShell() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />

      <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        <Outlet />
      </main>

      <footer className="mx-auto w-full max-w-7xl px-4 pb-8 text-center text-xs text-muted sm:px-6 lg:px-8">
        AutoMantenimiento Pro · Cada cuenta ve únicamente sus propios vehículos.
      </footer>
    </div>
  );
}
