/**
 * Layout compartido de las páginas de autenticación (login y registro).
 * Mantiene la identidad visual del proyecto (tarjeta centrada sobre el fondo)
 * y deja a cada página la definición del formulario y los enlaces.
 */

import type { ReactNode } from 'react';

interface AuthLayoutProps {
  title: string;
  subtitle: string;
  children: ReactNode;
  /** Enlace secundario (p. ej. "¿No tienes cuenta? Regístrate"). */
  footer?: ReactNode;
}

export function AuthLayout({ title, subtitle, children, footer }: AuthLayoutProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary font-secondary text-base font-extrabold tracking-tight text-white shadow-sm">
            AM
          </span>
          <h1 className="mt-4 font-secondary text-2xl font-bold text-foreground">
            {title}
          </h1>
          <p className="mt-1 text-sm text-muted">{subtitle}</p>
        </div>

        <div className="rounded-2xl border border-line bg-surface p-6 shadow-card sm:p-7">
          {children}
        </div>

        {footer ? (
          <p className="mt-5 text-center text-sm text-muted">{footer}</p>
        ) : null}
      </div>
    </div>
  );
}

/** Campo de formulario con etiqueta, error accesible y estilo unificado. */
interface FieldProps {
  id: string;
  label: string;
  type: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  error?: string;
  placeholder?: string;
}

export function AuthField({
  id,
  label,
  type,
  value,
  onChange,
  autoComplete,
  error,
  placeholder,
}: FieldProps) {
  const errorId = `${id}-error`;
  const hasError = error !== undefined && error.length > 0;

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-foreground">
        {label}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        placeholder={placeholder}
        required
        aria-invalid={hasError}
        aria-describedby={hasError ? errorId : undefined}
        className={`w-full rounded-xl border bg-background px-3.5 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted focus:ring-2 focus:ring-secondary/40 ${
          hasError ? 'border-danger' : 'border-line focus:border-secondary'
        }`}
      />
      {hasError ? (
        <p id={errorId} className="mt-1.5 text-xs text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
