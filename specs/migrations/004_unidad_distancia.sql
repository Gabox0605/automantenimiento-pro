-- ============================================================================
-- Migración 004: unidad de distancia del odómetro (km / millas)
-- ----------------------------------------------------------------------------
-- Requerimiento: hay vehículos importados cuyo tablero registra en MILLAS.
--
-- Diseño elegido (normalización a km):
--   - vehiculos.unidad_distancia declara EN QUÉ UNIDAD REGISTRA el vehículo.
--     Es lo único que guarda la BD: saber cuándo convertir.
--   - Todos los valores (odometro_logs, mantenimientos, specs de fábrica)
--     se guardan SIEMPRE en kilometros.
--     -> La validación de límites de fábrica (F05) queda intacta: km vs km.
--     -> El trigger del odómetro y la columna generada proximo_kilometraje
--        no requieren ningún cambio.
--   - La conversión (mi <-> km) vive SOLO en el frontend:
--       entrada: al escribir en el formulario del vehículo
--       salida:  los formularios muestran la referencia ya convertida a km
--
-- Vehículos existentes: quedan en 'KM' por defecto, sin migración de datos.
-- ============================================================================

CREATE TYPE unidad_distancia AS ENUM ('KM', 'MI');

ALTER TABLE vehiculos
    ADD COLUMN IF NOT EXISTS unidad_distancia unidad_distancia NOT NULL DEFAULT 'KM';

COMMENT ON COLUMN vehiculos.unidad_distancia IS
    'Unidad en la que el vehículo registra su odómetro (KM o MI). Los datos '
    'se almacenan SIEMPRE en kilometros; esta columna indica al frontend en '
    'qué unidad debe interpretar lo que escribe el usuario.';
