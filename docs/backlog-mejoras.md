# Backlog de mejoras — AutoMantenimiento Pro

> Registro de pendientes y propuestas futuras para retomar sin contexto perdido.
> Última actualización: 31 de octubre de 2026.

---

## 🔜 Propuesta del usuario — prioridad alta

### Autenticación en una misma pantalla (login + registro)

**Solicitud textual:**
> "Me gustaría que exista un botón de inicio de sesión y registro en una misma
> página, para que el formulario no aparezca solo en la pantalla vacía, ya que
> el usuario no sabe en qué página se está registrando."

**Problema actual:**
`/login` y `/registro` son rutas separadas (`src/pages/LoginPage.tsx` y
`RegisterPage.tsx`) que comparten `components/AuthLayout.tsx`: una tarjeta
centrada sobre el fondo, **sin identidad de la aplicación alrededor**. El
visitante no percibe en qué app está ni distingue en qué paso se encuentra;
al navegar entre una y otra se siente que "desaparece" el contexto.

**Dirección de diseño (borrador a concretar):**

| Opción | Descripción | Esfuerzo |
|---|---|---|
| **A. Toggle in-place** | Una sola ruta con pestañas "Iniciar sesión" / "Crear cuenta"; el formulario se transforma sin navegar ni recargar | 🟢 Bajo |
| **B. Dos columnas** | Izquierda: branding, valor y vista previa (reutiliza `LandingPreview`); derecha: formulario con pestañas | 🟡 Medio |
| **C. Modal sobre la landing** | La landing (ya existente) aporta el contexto y el acceso se abre en ventana | 🟡 Medio |

**Consideraciones:**
- Mantener `/login` y `/registro` operativos (o redirigirlos) para no romper
  enlaces existentes y el `state.from` de `ProtectedRoute`.
- Reutilizar `AuthLayout` / `AuthField` para no duplicar validaciones.
- Que al alternar se **conserven** los campos ya escritos.
- Llamada clara a la acción distinta para cada modo (evitar ambigüedad).

**Archivos a tocar:**
`frontend/src/pages/LoginPage.tsx`, `frontend/src/pages/RegisterPage.tsx`,
`frontend/src/components/AuthLayout.tsx`, `frontend/src/App.tsx`
(y opcionalmente `frontend/src/pages/LandingPage.tsx`).

**Criterio de aceptación:**
1. El usuario nunca ve un formulario aislado sin saber en qué aplicación está.
2. Puede alternar entre login y registro sin recargar la página ni perder lo escrito.
3. Sigue funcionando el retorno a la ruta original tras iniciar sesión.

---

## 🟡 Pendientes operativos

1. **Site URL / Redirect URLs en Supabase** — revisión visual pendiente
   (`https://supabase.com/dashboard/project/klrihexxoguhhxshfrwd/auth/url-configuration`).
   Debe ser `https://automantenimiento-pro-frontend.vercel.app`.
2. **Rotar la contraseña de la base de datos** (aparece en el historial del
   chat). Generar la URL ya codificada con:
   ```bash
   node -e "console.log('postgresql://postgres.klrihexxoguhhxshfrwd:' + encodeURIComponent('NUEVA_PASSWORD') + '@aws-1-us-west-2.pooler.supabase.com:5432/postgres')"
   ```
3. **`.agents/`** (skill de Supabase instalada con `npx skills add`) sigue sin
   trackear → decidir: commitear o añadir a `.gitignore`.
4. **Cuentas de prueba** en Supabase: `dev-e2e@automantenimiento.dev` y
   `dev-e2e-2@automantenimiento.dev` (contraseña `Prueba1234!`). Borrarlas desde
   Authentication → Users cuando ya no se usen.
5. **Nota:** `automantenimiento.dev` no tiene registro MX → Supabase rechaza
   registros nuevos de ese dominio. Usar un dominio real para pruebas.

---

## 💡 Fase 3 identificada (quick wins, no ejecutada)

Servicios ya escritos en el backend y **sin exponer por HTTP**:

| Función PRD | Qué falta | Ubicación | Esfuerzo |
|---|---|---|---|
| **F04** Tasa de uso diario/semanal | Exponer `calculateDailyUsageRate` | `src/services/odometerService.ts:323` | 🟢 Bajo |
| **F06** Historial de mantenimientos | Crear `GET /api/maintenance` (no existe endpoint de lectura) | `src/server.ts` + `maintenanceService` | 🟢 Bajo |
| **Listado OBD-II** | Exponer `listAll()` / `listBySeverity()` | `src/services/obd2Service.ts:161,172` | 🟢 Bajo |
| **F08** Fecha objetivo estimada | Combinar F04 + F07 | — | 🟡 Medio |
| **F09** Semáforo 🟢🟡🔴 | Calcular estado por próximo servicio | — | 🟡 Medio |
| **F01.B** Checklist de alta | Auditoría por kilometraje al registrar usado | — | 🟡 Medio |
| **F11** Asistente de diagnóstico | Requiere API key de modelo + diseño | — | 🔴 Alto |

---

## 📊 Estado al cierre (31-oct-2026)

**Desplegado y verificado en producción:**

| Commit | Contenido |
|---|---|
| `6cc2cb4` | FASE 1+2: autenticación Supabase Auth + CRUD de vehículos multiusuario (BOLA cerrado) |
| `218c594` | FASE B: declaración de RTV al día en el alta |
| `5fbba14` | FASE C: unidad km/millas con normalización a km |
| `6a8ad53` | FASE D: landing pública con vista previa del panel |

**Verificación:** E2E final en producción **28/28** · 17 pruebas unitarias RTV ·
16 pruebas de conversión (invariantes sobre 20 000 valores) · typecheck y build
limpios en backend y frontend.
