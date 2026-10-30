/**
 * Página de registro.
 *
 * Usa Supabase Auth (`signUp`). Según la configuración del proyecto, Supabase
 * puede exigir confirmar el email: en ese caso no se crea sesión y se muestra
 * un aviso; si la confirmación está desactivada, se inicia sesión
 * automáticamente y se navega a los vehículos.
 */

import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';

import { AuthField, AuthLayout } from '../components/AuthLayout.js';
import { useAuth } from '../context/AuthContext.js';

const MIN_PASSWORD_LENGTH = 6;

export function RegisterPage() {
  const { session, loading, signUp } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{
    email?: string;
    password?: string;
    confirm?: string;
  }>({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);

  if (!loading && session) {
    return <Navigate to="/vehiculos" replace />;
  }

  function validate(): boolean {
    const errors: { email?: string; password?: string; confirm?: string } = {};

    if (email.trim().length === 0) {
      errors.email = 'El email es obligatorio.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      errors.email = 'Introduce un email válido.';
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      errors.password = `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`;
    }

    if (confirm !== password) {
      errors.confirm = 'Las contraseñas no coinciden.';
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
      const result = await signUp(email.trim(), password);

      if (result.needsConfirmation) {
        setNeedsConfirmation(true);
        return;
      }

      navigate('/vehiculos', { replace: true });
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : 'No se pudo crear la cuenta.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  // Aviso tras registrarse cuando Supabase exige confirmar el email.
  if (needsConfirmation) {
    return (
      <AuthLayout
        title="Revisa tu email"
        subtitle="Te enviamos un enlace de confirmación para activar tu cuenta."
        footer={
          <Link to="/login" className="font-medium text-secondary hover:underline">
            Volver a iniciar sesión
          </Link>
        }
      >
        <div className="space-y-4 text-sm text-muted">
          <p>
            Hemos enviado un enlace de confirmación a{' '}
            <span className="font-medium text-foreground">{email.trim()}</span>.
          </p>
          <p>
            Una vez que confirmes tu email, vuelve a esta página e inicia sesión
            para empezar a registrar tus vehículos.
          </p>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Crear cuenta"
      subtitle="Regístrate para llevar el mantenimiento de tus vehículos."
      footer={
        <>
          ¿Ya tienes cuenta?{' '}
          <Link to="/login" className="font-medium text-secondary hover:underline">
            Inicia sesión
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
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
          autoComplete="new-password"
          placeholder={`Mínimo ${MIN_PASSWORD_LENGTH} caracteres`}
          {...(fieldErrors.password ? { error: fieldErrors.password } : {})}
        />

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

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-xl bg-secondary px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? 'Creando cuenta…' : 'Crear cuenta'}
        </button>
      </form>
    </AuthLayout>
  );
}
