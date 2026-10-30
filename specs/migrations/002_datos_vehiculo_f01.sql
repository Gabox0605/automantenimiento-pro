-- ============================================================================
-- Migración 002: datos de identificación del vehículo (F01)
-- ----------------------------------------------------------------------------
-- Contexto:
--   - El PRD F01 exige capturar "Marca, Modelo, Año, Motorización y
--     Kilometraje Inicial del vehículo ingresado por el usuario".
--   - Antes esos datos solo existían en el catálogo (F02) y únicamente si el
--     vehículo coincidía con una de sus filas, por lo que no se podía dar de
--     alta un vehículo arbitrario.
--
-- Modelo resultante:
--   vehiculos guarda sus propios datos de identificación (marca/modelo/año/
--   motor) y ENLAZA opcionalmente con catalogo_especificaciones vía
--   catalogo_id para obtener los límites de fábrica (F02/F05).
--   Si no hay coincidencia en el catálogo, catalogo_id queda NULL: el
--   mantenimiento se registra igual, simplemente no se valida contra fábrica.
--
-- La tabla vehiculos está vacía (la migración 001 borró el vehículo demo),
-- por lo que añadir columnas NOT NULL es seguro.
-- ============================================================================

ALTER TABLE vehiculos
    ADD COLUMN IF NOT EXISTS marca      VARCHAR(50) NOT NULL,
    ADD COLUMN IF NOT EXISTS modelo     VARCHAR(50) NOT NULL,
    ADD COLUMN IF NOT EXISTS anio       SMALLINT    NOT NULL
                                         CONSTRAINT chk_vehiculos_anio
                                             CHECK (anio BETWEEN 1900 AND 2100),
    ADD COLUMN IF NOT EXISTS tipo_motor tipo_motor  NOT NULL;

COMMENT ON COLUMN vehiculos.marca  IS 'Marca del vehículo (F01), ingresada por el usuario.';
COMMENT ON COLUMN vehiculos.modelo IS 'Modelo del vehículo (F01), ingresado por el usuario.';
COMMENT ON COLUMN vehiculos.anio   IS 'Año del modelo (F01), ingresado por el usuario.';
COMMENT ON COLUMN vehiculos.tipo_motor IS 'Motorización (F01): GASOLINA, DIESEL, HIBRIDO o ELECTRICO.';
