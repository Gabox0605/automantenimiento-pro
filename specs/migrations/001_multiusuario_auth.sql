-- ============================================================================
-- Migración 001: multiusuario con Supabase Auth
-- ----------------------------------------------------------------------------
-- Contexto:
--   - vehiculos.usuario_id era INTEGER con un valor lógico (1) y sin FK.
--   - Supabase Auth identifica a los usuarios con UUID (claim `sub` del JWT).
--   - El vehículo demo (id=1) se elimina para arrancar limpio: cada usuario
--     creará el suyo tras iniciar sesión (decisión del propietario del repo).
--
-- Modelo resultante:
--   vehiculos.usuario_id  ->  uuid  ->  FK a auth.users(id) ON DELETE CASCADE
--
-- Nota de seguridad (RLS):
--   El backend conecta como rol `postgres` (= dueño de las tablas), por lo que
--   RLS NO se aplica a sus queries (sin FORCE ROW LEVEL SECURITY). Habilitamos
--   RLS sin policies para que, si alguna vez estas tablas se exponen vía Data
--   API (roles anon/authenticated), el acceso quede denegado por defecto.
--   El control de acceso real por usuario lo hace el backend en cada query
--   (WHERE usuario_id = $1), cerrando BOLA/IDOR.
-- ============================================================================

-- 1) Borrar datos demo. ON DELETE CASCADE limpia odometro_logs y mantenimientos.
DELETE FROM vehiculos;

-- 2) El CHECK (usuario_id > 0) no aplica a uuid: eliminarlo antes del ALTER.
ALTER TABLE vehiculos DROP CONSTRAINT IF EXISTS chk_vehiculos_usuario;

-- 3) Convertir la columna a uuid (la tabla está vacía, no hay datos que migrar).
ALTER TABLE vehiculos ALTER COLUMN usuario_id DROP NOT NULL;
ALTER TABLE vehiculos ALTER COLUMN usuario_id TYPE uuid USING (NULL::uuid);
ALTER TABLE vehiculos ALTER COLUMN usuario_id SET NOT NULL;

-- 4) FK a Supabase Auth (patrón estándar; requiere privilegio REFERENCES).
--    Si el rol no lo tuviera, eliminar este bloque: el filtrado por usuario en
--    el backend ya garantiza el aislamiento.
ALTER TABLE vehiculos
    ADD CONSTRAINT fk_vehiculos_usuario
    FOREIGN KEY (usuario_id) REFERENCES auth.users(id)
    ON DELETE CASCADE;

-- 5) Habilitar RLS en todas las tablas de la aplicación (defensa en profundidad).
--    Sin policies => denegado por defecto para anon/authenticated (Data API).
ALTER TABLE vehiculos                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE odometro_logs             ENABLE ROW LEVEL SECURITY;
ALTER TABLE mantenimientos            ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogo_especificaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE codigos_obd2              ENABLE ROW LEVEL SECURITY;
