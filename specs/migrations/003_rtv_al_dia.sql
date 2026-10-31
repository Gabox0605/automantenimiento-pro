-- ============================================================================
-- Migración 003: estado de Revisión Técnica Vehicular al registrar (RTV)
-- ----------------------------------------------------------------------------
-- Contexto (Requerimiento del usuario):
--   Al dar de alta un vehículo se debe indicar si el usuario lo encuentra
--   AL DÍA con la RTV. Ejemplo: un vehículo con placa terminada en 1 tiene
--   RTV en ENERO, pero si se registra en OCTUBRE, se asume que la revisión
--   de ese ciclo ya fue aprobada, y la próxima alerta debe ser ENERO DEL
--   AÑO SIGUIENTE — no "RTV vencido".
--
-- Modelo:
--   vehiculos.rtv_al_dia = true  ->  la UI NUNCA alerta como vencido; la
--                                    próxima alerta salta al ciclo siguiente.
--   vehiculos.rtv_al_dia = false ->  comportamiento histórico intacto (el mes
--                                    asignado ya pasado se marca como vencido).
--
-- La lógica de cálculo vive en frontend/src/utils/rtvHelper.ts; este flag es
-- solo la declaración del usuario capturada en el alta.
-- ============================================================================

ALTER TABLE vehiculos
    ADD COLUMN IF NOT EXISTS rtv_al_dia BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN vehiculos.rtv_al_dia IS
    'true = el usuario declara el vehículo al día con la RTV al registrarlo; '
    'en ese caso no se alerta como vencido y el próximo ciclo salta al año siguiente.';
