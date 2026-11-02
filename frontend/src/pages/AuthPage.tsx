/**
 * Acceso unificado: iniciar sesión y crear cuenta en la misma pantalla.
 *
 * Las dos acciones se alternan con pestañas sin cambiar de URL, así el
 * visitante siempre sabe en qué aplicación está y no pierde lo escrito en el
 * email al cambiar de modo. `/login` y `/registro` abren esta misma pantalla
 * con la pestaña correspondiente.
 */

import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';

import { AuthField } from '../components/AuthLayout.js';
import { useAuth } from '../context/AuthContext.js';

export type AuthMode = 'login' | 'register';

const MIN_PASSWORD_LENGTH = 6;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface AuthPageProps {
  initialMode: AuthMode;
}

interface FieldErrors {
  email?: string;
  password?: string;
  confirm?: string;
}

const TAB_BASE =
  'flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary/40';

export function AuthPage({ initialMode }: AuthPageProps) {
  const { session, loading, signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);

  // Ruta original solicitada antes de ser redirigido al acceso.
  const from = (location.state as { from?: string } | null)?.from ?? '/vehiculos';
  const isRegister = mode === 'register';

  if (!loading && session) {
    return <Navigate to={from} replace />;
  }

  function switchMode(next: AuthMode): void {
    setMode(next);
    setFieldErrors({});
    setFormError('');
    setConfirm('');
    setNeedsConfirmation(false);
    navigate(next === 'login' ? '/login' : '/registro', {
      replace: true,
      state: location.state,
    });
  }

  function validate(): boolean {
    const errors: FieldErrors = {};

    if (email.trim().length === 0) {
      errors.email = 'El email es obligatorio.';
    } else if (!EMAIL_PATTERN.test(email.trim())) {
      errors.email = 'Introduce un email válido.';
    }

    if (isRegister) {
      if (password.length < MIN_PASSWORD_LENGTH) {
        errors.password = `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`;
      }
      if (confirm !== password) {
        errors.confirm = 'Las contraseñas no coinciden.';
      }
    } else if (password.length === 0) {
      errors.password = 'La contraseña es obligatoria.';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFormError('');

    if (!validate()) return;

    setSubmitting(true);

    try {
      if (isRegister) {
        const result = await signUp(email.trim(), password);
        if (result.needsConfirmation) {
          setNeedsConfirmation(true);
          return;
        }
        navigate('/vehiculos', { replace: true });
      } else {
        await signIn(email.trim(), password);
        navigate(from, { replace: true });
      }
    } catch (error) {
      const fallback = isRegister
        ? 'No se pudo crear la cuenta.'
        : 'No se pudo iniciar sesión.';
      setFormError(error instanceof Error ? error.message : fallback);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary font-secondary text-base font-extrabold tracking-tight text-white shadow-sm">
            AM
          </span>
          <h1 className="mt-4 font-secondary text-2xl font-bold text-foreground">
            AutoMantenimiento Pro
          </h1>
          <p className="mt-1 text-sm text-muted">
            Mantenimiento preventivo para tus vehículos.
          </p>
        </div>

        <div className="rounded-2xl border border-line bg-surface p-6 shadow-card sm:p-7">
          {needsConfirmation ? (
            <div className="space-y-4 text-sm text-muted">
              <h2 className="font-secondary text-lg font-bold text-foreground">
                Revisa tu email
              </h2>
              <p>
                Hemos enviado un enlace de confirmación a{' '}
                <span className="font-medium text-foreground">{email.trim()}</span>.
              </p>
              <p>
                Una vez confirmado, inicia sesión para empezar a registrar tus
                vehículos.
              </p>
              <button
                type="button"
                onClick={() => switchMode('login')}
                className="w-full rounded-xl bg-secondary px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
              >
                Ir a iniciar sesión
              </button>
            </div>
          ) : (
            <>
              <div
                role="tablist"
                aria-label="Acceso a la cuenta"
                className="mb-6 flex gap-1 rounded-xl bg-background p-1"
              >
                <button
                  type="button"
                  role="tab"
                  id="tab-login"
                  aria-selected={!isRegister}
                  aria-controls="auth-panel"
                  onClick={() => switchMode('login')}
                  className={`${TAB_BASE} ${
                    !isRegister ? 'bg-surface text-foreground shadow-sm' : 'text-muted hover:text-foreground'
                  }`}
                >
                  Iniciar sesión
                </button>
                <button
                  type="button"
                  role="tab"
                  id="tab-register"
                  aria-selected={isRegister}
                  aria-controls="auth-panel"
                  onClick={() => switchMode('register')}
                  className={`${TAB_BASE} ${
                    isRegister ? 'bg-surface text-foreground shadow-sm' : 'text-muted hover:text-foreground'
                  }`}
                >
                  Crear cuenta
                </button>
              </div>

              <div role="tabpanel" id="auth-panel" aria-labelledby={isRegister ? 'tab-register' : 'tab-login'}>
                <h2 className="font-secondary text-lg font-bold text-foreground">
                  {isRegister ? 'Crea tu cuenta' : 'Bienvenido de nuevo'}
                </h2>
                <p className="mt-1 text-sm text-muted">
                  {isRegister
                    ? 'Regístrate para llevar el mantenimiento de tus vehículos.'
                    : 'Accede para ver y gestionar tus vehículos.'}
                </p>

                <form onSubmit={handleSubmit} noValidate className="mt-5 space-y-4">
                  {formError ? (
                    <div
                      role="alert"
                      className="rounded-xl border border-danger/40 bg-danger/10 px-3.5 py-2.5 text-sm text-danger"
                    >
                      {formError}
                    </div>
                  ) : null}

                  <AuthField
                    id="email"
                    label="Email"
                    type="email"
                    value={email}
                    onChange={setEmail}
                    autoComplete="email"
                    placeholder="tu@email.com"
                    {...(fieldErrors.email ? { error: fieldErrors.email } : {})}
                  />

                  <AuthField
                    id="password"
                    label="Contraseña"
                    type="password"
                    value={password}
                    onChange={setPassword}
                    autoComplete={isRegister ? 'new-password' : 'current-password'}
                    placeholder={isRegister ? `Mínimo ${MIN_PASSWORD_LENGTH} caracteres` : '••••••••'}
                    {...(fieldErrors.password ? { error: fieldErrors.password } : {})}
                  />

                  {isRegister ? (
                    <AuthField
                      id="confirm"
                      label="Repite la contraseña"
                      type="password"
                      value={confirm}
                      onChange={setConfirm}
                      autoComplete="new-password"
                      placeholder="••••••••"
                      {...(fieldErrors.confirm ? { error: fieldErrors.confirm } : {})}
                    />
                  ) : null}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full rounded-xl bg-secondary px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {submitting
                      ? isRegister
                        ? 'Creando cuenta…'
                        : 'Entrando…'
                      : isRegister
                        ? 'Crear cuenta'
                        : 'Entrar'}
                  </button>
                </form>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
