/**
 * Middleware de autenticación con Supabase Auth (verificación de JWT vía JWKS).
 * ----------------------------------------------------------------------------
 * El frontend usa @supabase/supabase-js para iniciar sesión y envía el access
 * token en `Authorization: Bearer <jwt>`. Este middleware lo verifica contra
 * el JWKS público del proyecto y lo inyecta como `request.user`.
 *
 * Diseño:
 * - Se verifica la FIRMA con la clave pública (JWKS) — no se guarda ningún
 *   secreto en el servidor (el proyecto usa claves asimétricas ES256).
 * - Se valida `exp` (por defecto en jwtVerify) y el `iss` del proyecto.
 * - El claim `sub` es el UUID del usuario y coincide con `vehiculos.usuario_id`.
 *
 * Requiere la variable de entorno SUPABASE_URL (ej. https://<ref>.supabase.co).
 *
 * Fuente: https://supabase.com/docs/guides/auth/jwts
 */

import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import type { NextFunction, Request, Response } from 'express';

/** Usuario autenticado disponible en `request.user` tras requireAuth. */
export interface AuthUser {
  /** UUID del usuario (claim `sub`) — igual que vehiculos.usuario_id. */
  sub: string;
  /** Email del usuario (claim `email`), si el token lo incluye. */
  email?: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/** URL base del proyecto Supabase (sin barra final). */
function supabaseUrl(): string {
  const raw = process.env.SUPABASE_URL?.trim();
  if (!raw) {
    throw new Error(
      'SUPABASE_URL no está definida. Ejemplo: https://klrihexxoguhhxshfrwd.supabase.co',
    );
  }
  return raw.replace(/\/+$/, '');
}

/**
 * Cliente JWKS remoto. Se crea de forma perezosa (lazy) a nivel de módulo para
 * que jose cachee las claves entre peticiones —y también para que una
 * SUPABASE_URL ausente falle en un punto controlado, no durante el import.
 *
 * jose re-intenta automáticamente ante un `kid` desconocido, lo que cubre la
 * rotación de claves de firma.
 */
let jwksInstance: ReturnType<typeof createRemoteJWKSet> | undefined;

function getJwks(): ReturnType<typeof createRemoteJWKSet> {
  if (jwksInstance === undefined) {
    jwksInstance = createRemoteJWKSet(
      new URL(`${supabaseUrl()}/auth/v1/.well-known/jwks.json`),
    );
  }
  return jwksInstance;
}

/**
 * Validación fail-fast de la configuración de auth.
 *
 * Se invoca al arrancar para que un `SUPABASE_URL` ausente o malformado se
 * reporte en los logs de inicio (Render → Logs) en lugar de como un 401 en
 * cada petición.
 */
export function assertAuthConfig(): string {
  const url = supabaseUrl();

  try {
    // Confirma que la URL es parseable y tiene esquema http(s).
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new Error('esquema no soportado');
    }
  } catch {
    throw new Error(
      `SUPABASE_URL no es una URL válida: "${url}". ` +
        'Se espera el formato https://<project-ref>.supabase.co',
    );
  }

  return `${url}/auth/v1/.well-known/jwks.json`;
}

/**
 * Verifica un access token de Supabase Auth.
 * Devuelve los claims o lanza un error si la firma/expiración/issuer no valen.
 */
export async function verifySupabaseJwt(token: string): Promise<JWTPayload> {
  const { payload } = await jwtVerify(token, getJwks(), {
    issuer: `${supabaseUrl()}/auth/v1`,
  });

  if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
    throw new Error('El token no contiene el claim `sub` (id de usuario).');
  }

  return payload;
}

/**
 * Middleware: exige un JWT válido. En caso contrario responde 401.
 * Sobre el resto de rutas se aplica después de /api/health (pública).
 */
export async function requireAuth(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  const header = request.header('authorization') ?? '';
  const token = /^Bearer\s+(.+)$/i.exec(header.trim())?.[1]?.trim();

  if (!token) {
    response.status(401).json({
      error: {
        code: 'UNAUTHENTICATED',
        message: 'Se requiere iniciar sesión. Envía Authorization: Bearer <token>.',
      },
    });
    return;
  }

  try {
    const payload = await verifySupabaseJwt(token);

    const user: AuthUser = { sub: payload.sub as string };
    if (typeof payload.email === 'string') {
      user.email = payload.email;
    }

    request.user = user;
    next();
  } catch {
    // No se filtra el motivo interno: evita oracularidad (¿firma? ¿expirado?).
    response.status(401).json({
      error: {
        code: 'INVALID_TOKEN',
        message: 'La sesión no es válida o ha expirado. Inicia sesión de nuevo.',
      },
    });
  }
}

/**
 * Devuelve el usuario autenticado o lanza 401.
 * Para usar en handlers ya protegidos por requireAuth (asegura tipos).
 */
export function requireUser(request: Request): AuthUser {
  if (!request.user) {
    // Defensa: no debería ocurrir si requireAuth precedió al handler.
    throw new Error('requireUser() llamado sin requireAuth.');
  }
  return request.user;
}
