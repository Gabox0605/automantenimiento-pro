import { Dashboard } from './components/Dashboard';
import { Header } from './components/Header';

export default function App() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />

      <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        <Dashboard />
      </main>

      <footer className="mx-auto w-full max-w-7xl px-4 pb-8 text-center text-xs text-muted sm:px-6 lg:px-8">
        AutoMantenimiento Pro · Datos de demostración para la vista inicial.
      </footer>
    </div>
  );
}
