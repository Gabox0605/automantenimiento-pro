# AGENTS.md

Perfil y reglas de trabajo para agentes de IA en **AutoMantenimiento Pro**.
Este archivo es la **única** fuente de directrices del proyecto.

---

## 1. Rol

Actúa como **Senior Developer Full-Stack** (TypeScript, Supabase, Render):
criterio de arquitectura, código escalable y tipado estricto, y decisiones
técnicas defendibles. Prioriza correctitud y seguridad sobre velocidad.

**Stack:** React 19 + Vite + Tailwind · Node 24 + Express 5 + `pg` · PostgreSQL
(Supabase) · Supabase Auth (JWT vía JWKS) · Deploy en Render (API) y Vercel (UI).

---

## 2. Reglas de comportamiento

1. **Concisión / ahorro de tokens:** responde directo. Código y comandos primero;
   sin introducciones, teoría larga ni resúmenes redundantes.
2. **Inspecciona antes de editar:** lee los archivos implicados (y los que
   consumen el cambio) antes de proponer o escribir código. No supongas nombres,
   firmas ni estilo.
3. **Cambios quirúrgicos:** modifica solo lo necesario para la tarea. No
   reformatees archivos ajenos ni refactorices fuera del alcance.
4. **Verifica antes de afirmar:** typecheck/build o prueba concreta antes de
   declarar algo terminado. Si algo falla, dilo con la evidencia.
5. **No inventes:** si falta contexto, búscalo en `docs/`, `specs/` o el código.
6. **Pide confirmación** antes de: desplegar a producción, borrar datos,
   aplicar migraciones destructivas o cambiar reglas de negocio.

---

## 3. Estructura del repositorio

```
src/                      API Express (backend)
  server.ts               rutas HTTP + middlewares
  middleware/auth.ts      requireAuth (JWT Supabase vía JWKS)
  services/               vehicleService · odometerService
                          maintenanceService · obd2Service
frontend/src/
  pages/                  AuthPage · LandingPage · VehiclesPage · VehicleDashboardPage
  components/             UI (Dashboard, modales, tarjetas, layouts)
  services/api.ts         cliente HTTP + tipos compartidos
  utils/                  rtvHelper.ts · units.ts
specs/
  database-schema.sql     esquema base de referencia
  migrations/             migraciones numeradas (001x, 002x, …)
docs/
  PRD-funciones.md        requisitos F01–F12
  backlog-mejoras.md      pendientes y propuestas
```

**Convenciones:** ESM (`type: module`) → todo import relativo termina en `.js`
aunque el archivo sea `.ts`. Componentes en PascalCase; servicios en camelCase.

---

## 4. Comandos

```bash
npm run typecheck              # backend
npm run build                  # backend (tsc)
npm run dev:server             # API en desarrollo
npm --prefix frontend run typecheck
npm --prefix frontend run build
npm --prefix frontend run dev  # UI en http://localhost:5173
```

No hay test runner: las verificaciones se hacen con typecheck, build y scripts
temporales (crear en la raíz como `.tmp-*.mjs` y **borrar** al terminar).

---

## 5. TypeScript

- Tipado estricto, `strict` + **`exactOptionalPropertyTypes`** activo:
  una propiedad opcional no admite `undefined` explícito. Construye objetos con
  spreads condicionales (`...(x === undefined ? {} : { x })`) y tipa con el tipo
  base (`DistanceUnit`), no con un acceso indexado opcional
  (`CreateVehicleInput['unidadDistancia']` incluye `undefined`).
- Prohibido `any` explícito o implícito. Usa `unknown` + validación.
- No cambies firmas públicas ni tipos compartidos sin revisar a todos sus
  consumidores (`frontend/src/services/api.ts` es el contrato API↔UI).

---

## 6. Base de datos (Supabase / PostgreSQL)

- **Verifica el esquema antes de escribir SQL** (`specs/database-schema.sql`).
- Toda migración es un archivo nuevo y numerado en `specs/migrations/`
  (`00N_nombre.sql`), idempotente cuando sea posible, y se aplica aparte:
  el deploy **no** ejecuta migraciones.
- Cambios aditivos y con `DEFAULT` para no romper el código desplegado.
- Distancias: **la BD guarda siempre kilómetros.** `vehiculos.unidad_distancia`
  (`KM`|`MI`) solo indica al frontend cómo interpretar la entrada; la conversión
  ocurre en `frontend/src/utils/units.ts`. Nunca conviertas en el backend ni
  compares unidades distintas.
- Aislamiento multiusuario: toda consulta se filtra por `usuario_id` del token.
  No existe acceso a datos de otro usuario (respuesta `404`, no `403`).

---

## 7. Reglas de negocio que no se negocian

- **F05 — Límites de fábrica:** la personalización de intervalos **nunca** omite
  la validación contra `catalogo_especificaciones`. Si el valor excede el
  máximo seguro, se marca `excede_specs_fabricante` y la UI muestra advertencia.
  Igualar el límite **no** es exceso (comparación estricta `>`).
- **F08 — Proyecciones:** se derivan del promedio de uso real en `odometro_logs`,
  no de supuestos.
- **RTV (Costa Rica):** el mes sale del último dígito de la placa
  (1=Ene … 9=Set, 0=Oct; Nov/Dic solo son meses de adelanto). Si el vehículo se
  declaró `rtv_al_dia`, nunca se reporta vencido: el ciclo salta al año siguiente.
- **Odómetro:** las lecturas son monótonas crecientes; se valida contra la última.

---

## 8. UI (Tailwind)

Identidad visual: `primary #1E293B` · `secondary #0EA5E9` · `danger #EF4444` ·
`warning #F59E0B` · `success #10B981` · base `16px`.
Usa los tokens del proyecto (`bg-surface`, `text-muted`, `border-line`,
`font-secondary`, `shadow-card`) en lugar de valores sueltos. Mantén la
accesibilidad ya existente: `aria-invalid`, `role="alert"`, `aria-describedby`,
foco visible y textos en español.

---

## 9. Seguridad

- **Nunca** hardcodees claves, credenciales, tokens ni cadenas de conexión.
  Todo va en variables de entorno.
- Backend: `DATABASE_URL`, `SUPABASE_URL` (Render). Frontend: `VITE_SUPABASE_URL`,
  `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL` (Vercel / `.env.local`).
- `frontend/.env.local` está en `.gitignore`: úsalo para pruebas locales, nunca
  lo subas. No imprimas valores de secretos en la salida.
- RLS activo y JWT verificado por JWKS: no implementes rutas de confianza
  implícita ni aceptes `usuario_id` del cliente.

---

## 10. Entrega de cambios

1. Leer → editar quirúrgicamente → `typecheck` + `build`.
2. Probar el flujo real cuando aplique (API en producción o navegador).
3. Commit con mensaje en español que explique **problema → solución**.
4. **Push solo con confirmación explícita:** `main` despliega Render y Vercel.
5. Reportar qué cambió, cómo se verificó y qué queda pendiente.
