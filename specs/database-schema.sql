-- ============================================================================
-- AutoMantenimiento Pro — Esquema relacional de base de datos (PostgreSQL)
-- ----------------------------------------------------------------------------
-- Requisitos: PostgreSQL 12 o superior (columnas generadas STORED).
--
-- Ejecución:
--   psql -U <usuario> -d <base_de_datos> -f specs/database-schema.sql
--
-- El script es idempotente: se puede ejecutar varias veces sin duplicar
-- objetos ni datos de prueba. Está pensado para instalaciones nuevas; si las
-- tablas ya existen, CREATE TABLE IF NOT EXISTS no aplica los cambios de
-- estructura (en ese caso se debe crear una migración dedicada).
--
-- Mapa de relaciones:
--   catalogo_especificaciones 1 ── N vehiculos
--   vehiculos                 1 ── N odometro_logs
--   vehiculos                 1 ── N mantenimientos
--   codigos_obd2              (catálogo independiente de diagnóstico)
-- ============================================================================


-- ============================================================================
-- 1. TIPOS ENUMERADOS
-- ----------------------------------------------------------------------------
-- Se usan ENUM para los dominios cerrados que la aplicación valida de forma
-- constante. Para agregar un valor en el futuro:
--   ALTER TYPE tipo_servicio ADD VALUE 'NUEVO_SERVICIO';
-- ============================================================================

-- Motorización del vehículo (F01, F02).
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tipo_motor') THEN
        CREATE TYPE tipo_motor AS ENUM (
            'GASOLINA',
            'DIESEL',
            'HIBRIDO',
            'ELECTRICO'
        );
    END IF;
END
$$;

-- Servicios de mantenimiento soportados (F05). Los nombres se usan como
-- claves estables en la API y en la interfaz, por eso van sin acentos.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tipo_servicio') THEN
        CREATE TYPE tipo_servicio AS ENUM (
            'CAMBIO_ACEITE',
            'FILTRO_ACEITE',
            'FILTRO_AIRE',
            'FILTRO_COMBUSTIBLE',
            'FILTRO_HABITACULO',
            'FAJA_DISTRIBUCION',
            'BUJIAS',
            'LIQUIDO_REFRIGERANTE',
            'LIQUIDO_FRENOS',
            'TRANSMISION',
            'FRENOS',
            'LLANTAS',
            'BATERIA',
            'SUSPENSION',
            'ALINEACION',
            'REVISION_GENERAL',
            'OTRO'
        );
    END IF;
END
$$;


-- ============================================================================
-- 2. CATÁLOGO DE ESPECIFICACIONES DE FÁBRICA (F02)
-- ----------------------------------------------------------------------------
-- Reglas por marca/modelo/año/motorización. Los intervalos son los máximos
-- seguros recomendados por el fabricante; la decisión final del usuario se
-- guarda en mantenimientos (modelo híbrido definido en ADR-001).
-- ============================================================================
CREATE TABLE IF NOT EXISTS catalogo_especificaciones (
    id                     SERIAL PRIMARY KEY,

    -- Identificación del vehículo en el catálogo.
    marca                  VARCHAR(50)  NOT NULL,
    modelo                 VARCHAR(50)  NOT NULL,
    anio_inicio            SMALLINT     NOT NULL,
    anio_fin               SMALLINT,            -- NULL = modelo aún vigente.
    tipo_motor             tipo_motor   NOT NULL,

    -- Límites de fábrica para aceite de motor.
    aceite_km_maximo       INTEGER      NOT NULL DEFAULT 10000,
    aceite_meses_maximo    SMALLINT     NOT NULL DEFAULT 12,

    -- Intervalo de faja de distribución. NULL = cadena o no aplica.
    faja_distribucion_km   INTEGER      DEFAULT 100000,

    -- Auditoría.
    created_at             TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at             TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Rangos de años coherentes.
    CONSTRAINT chk_catalogo_anios
        CHECK (
            anio_inicio BETWEEN 1900 AND 2100
            AND (anio_fin IS NULL OR anio_fin BETWEEN anio_inicio AND 2100)
        ),

    -- Los intervalos siempre deben ser positivos.
    CONSTRAINT chk_catalogo_intervalos
        CHECK (
            aceite_km_maximo > 0
            AND aceite_meses_maximo > 0
            AND (faja_distribucion_km IS NULL OR faja_distribucion_km > 0)
        )
);

-- Evita duplicados del mismo vehículo en el catálogo. COALESCE permite que
-- dos filas con anio_fin NULL se consideren iguales (NULLS DISTINCT por
-- defecto las trataría como distintas).
CREATE UNIQUE INDEX IF NOT EXISTS uq_catalogo_especificacion
    ON catalogo_especificaciones (
        marca,
        modelo,
        anio_inicio,
        COALESCE(anio_fin, 9999),
        tipo_motor
    );

COMMENT ON TABLE catalogo_especificaciones IS
    'Especificaciones e intervalos máximos de mantenimiento por vehículo de fábrica.';


-- ============================================================================
-- 3. VEHÍCULOS REGISTRADOS (F01, F01.B)
-- ----------------------------------------------------------------------------
-- usuario_id es el UUID del usuario autenticado (claim `sub` del JWT de
-- Supabase Auth) y referencia directamente a auth.users(id) con borrado en
-- cascada: al eliminar el usuario, desaparecen sus vehículos y su historial.
-- Migración aplicada: specs/migrations/001_multiusuario_auth.sql
-- ============================================================================
CREATE TABLE IF NOT EXISTS vehiculos (
    id                  SERIAL PRIMARY KEY,
    usuario_id          UUID         NOT NULL
                                     REFERENCES auth.users(id)
                                     ON DELETE CASCADE,
    catalogo_id         INTEGER      REFERENCES catalogo_especificaciones(id)
                                     ON DELETE SET NULL,

    -- Datos de identificación ingresados por el usuario (F01). Se guardan en
    -- el propio vehículo; catalogo_id es un enlace OPCIONAL a las specs de
    -- fábrica (F02) que se resuelve al dar de alta si existe coincidencia.
    marca               VARCHAR(50)  NOT NULL,
    modelo              VARCHAR(50)  NOT NULL,
    anio                SMALLINT     NOT NULL,
    tipo_motor          tipo_motor   NOT NULL,

    alias               VARCHAR(50),          -- Nombre amigable, ej. "Mi Corolla".
    placa               VARCHAR(20),
    kilometraje_inicial INTEGER      NOT NULL,
    kilometraje_actual  INTEGER      NOT NULL,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- El año del modelo siempre dentro de un rango razonable.
    CONSTRAINT chk_vehiculos_anio
        CHECK (anio BETWEEN 1900 AND 2100),

    -- Ningún kilometraje puede ser negativo.
    CONSTRAINT chk_vehiculos_km
        CHECK (kilometraje_inicial >= 0 AND kilometraje_actual >= 0),

    -- El odómetro actual nunca puede estar por debajo del inicial.
    CONSTRAINT chk_vehiculos_km_actual
        CHECK (kilometraje_actual >= kilometraje_inicial),

    -- Una placa no puede repetirse para el mismo usuario (NULL se permite
    -- varias veces porque representa vehículos sin placa registrada).
    CONSTRAINT uq_vehiculo_placa_por_usuario
        UNIQUE (usuario_id, placa)
);

COMMENT ON TABLE vehiculos IS
    'Vehículos registrados por cada usuario, con su kilometraje de referencia.';


-- ============================================================================
-- 4. LOGS DE ODÓMETRO (F03, F04)
-- ----------------------------------------------------------------------------
-- Cada registro representa una lectura del odómetro. El trigger
-- trg_odometro_actualiza_vehiculo mantiene vehiculos.kilometraje_actual
-- sincronizado con la lectura más alta registrada.
-- ============================================================================
CREATE TABLE IF NOT EXISTS odometro_logs (
    id             SERIAL PRIMARY KEY,
    vehiculo_id    INTEGER      NOT NULL
                                REFERENCES vehiculos(id) ON DELETE CASCADE,
    kilometraje    INTEGER      NOT NULL,
    fecha_registro TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Un odómetro no puede retroceder por debajo de cero.
    CONSTRAINT chk_odometro_km
        CHECK (kilometraje >= 0)
);

COMMENT ON TABLE odometro_logs IS
    'Historial de lecturas de odómetro usado para calcular la tasa diaria de uso (F04).';


-- ============================================================================
-- 5. MANTENIMIENTOS REALIZADOS (F05, F06, F07, F08)
-- ----------------------------------------------------------------------------
-- Guarda la decisión del usuario (intervalo en km y meses) y proyecta el
-- próximo kilometraje de servicio. La fecha objetivo (F08) y el semáforo
-- (F09) se calculan en la capa de aplicación a partir de la tasa de uso.
-- ============================================================================
CREATE TABLE IF NOT EXISTS mantenimientos (
    id                        SERIAL PRIMARY KEY,
    vehiculo_id               INTEGER          NOT NULL
                                               REFERENCES vehiculos(id)
                                               ON DELETE CASCADE,
    tipo_servicio             tipo_servicio    NOT NULL,
    fecha_servicio            TIMESTAMPTZ      NOT NULL,
    kilometraje_servicio      INTEGER          NOT NULL,

    -- Intervalo elegido por el usuario para el próximo servicio.
    intervalo_km_elegido      INTEGER          NOT NULL,
    intervalo_meses_elegido   SMALLINT         NOT NULL,

    -- Proyección automática: Km_siguiente = Km_servicio + Intervalo_elegido.
    proximo_kilometraje       INTEGER          GENERATED ALWAYS AS (
                                  kilometraje_servicio + intervalo_km_elegido
                              ) STORED,

    costo                     NUMERIC(10, 2)   NOT NULL DEFAULT 0.00,
    taller                    VARCHAR(100),
    excede_specs_fabricante   BOOLEAN          NOT NULL DEFAULT FALSE,
    notas                     TEXT,
    created_at                TIMESTAMPTZ      NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- El kilometraje del servicio no puede ser negativo.
    CONSTRAINT chk_mantenimientos_km
        CHECK (kilometraje_servicio >= 0),

    -- Los intervalos elegidos deben ser mayores a cero.
    CONSTRAINT chk_mantenimientos_intervalos
        CHECK (intervalo_km_elegido > 0 AND intervalo_meses_elegido > 0),

    -- Un costo negativo no tiene sentido de negocio.
    CONSTRAINT chk_mantenimientos_costo
        CHECK (costo >= 0)
);

COMMENT ON TABLE mantenimientos IS
    'Servicios realizados y proyección del siguiente mantenimiento por vehículo.';


-- ============================================================================
-- 6. CÓDIGOS DE FALLA OBD-II / DTC (F10)
-- ----------------------------------------------------------------------------
-- Diccionario de códigos de diagnóstico con causas frecuentes. Es un catálogo
-- global, independiente de los vehículos registrados.
-- ============================================================================
CREATE TABLE IF NOT EXISTS codigos_obd2 (
    id                SERIAL PRIMARY KEY,

    -- Formato estándar DTC: una letra (P/C/B/U) y cuatro caracteres hex.
    codigo            VARCHAR(5)   NOT NULL UNIQUE,
    titulo            VARCHAR(120) NOT NULL,   -- Nombre corto del código.
    categoria         VARCHAR(50)  NOT NULL,   -- Motor, Transmisión, Frenos, etc.
    descripcion_corta TEXT         NOT NULL,
    causas_comunes    TEXT[]       NOT NULL DEFAULT '{}',
    sintomas          TEXT[]       NOT NULL DEFAULT '{}',
    severidad         VARCHAR(10)  NOT NULL DEFAULT 'MEDIA',

    -- 'CRITICA' se escribe sin acento para usarse como clave estable en la API.
    CONSTRAINT chk_obd2_codigo
        CHECK (codigo ~ '^[PBCU][0-9A-F]{4}$'),

    CONSTRAINT chk_obd2_severidad
        CHECK (severidad IN ('BAJA', 'MEDIA', 'ALTA', 'CRITICA'))
);

-- Migración idempotente para bases de datos creadas antes de agregar los
-- campos de título y síntomas. En instalaciones nuevas no hace nada.
ALTER TABLE codigos_obd2
    ADD COLUMN IF NOT EXISTS titulo VARCHAR(120);

ALTER TABLE codigos_obd2
    ADD COLUMN IF NOT EXISTS sintomas TEXT[] NOT NULL DEFAULT '{}';

-- Rellena el título de registros antiguos usando la descripción existente.
UPDATE codigos_obd2
   SET titulo = descripcion_corta
 WHERE titulo IS NULL;

ALTER TABLE codigos_obd2
    ALTER COLUMN titulo SET NOT NULL;

COMMENT ON TABLE codigos_obd2 IS
    'Diccionario de códigos de diagnóstico OBD-II con causas, síntomas y severidad.';


-- ============================================================================
-- 7. ÍNDICES DE RENDIMIENTO
-- ----------------------------------------------------------------------------
-- Se crean después de las tablas para mantener el DDL agrupado por entidad.
-- ============================================================================

-- Búsqueda del vehículo en el catálogo por marca/modelo/año (formulario F01).
CREATE INDEX IF NOT EXISTS idx_catalogo_busqueda
    ON catalogo_especificaciones (
        lower(marca),
        lower(modelo),
        anio_inicio DESC,
        anio_fin
    );

-- Listado de vehículos de un usuario y unión con el catálogo.
CREATE INDEX IF NOT EXISTS idx_vehiculos_usuario
    ON vehiculos (usuario_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_vehiculos_catalogo
    ON vehiculos (catalogo_id);

-- Última lectura de odómetro por vehículo (para el panel y F04).
-- INCLUDE permite resolver la consulta sin visitar la tabla (index-only scan).
CREATE INDEX IF NOT EXISTS idx_odometro_ultima_lectura
    ON odometro_logs (vehiculo_id, kilometraje DESC)
    INCLUDE (fecha_registro);

-- Historial cronológico de lecturas y cálculo de la tasa de uso diario.
CREATE INDEX IF NOT EXISTS idx_odometro_vehiculo_fecha
    ON odometro_logs (vehiculo_id, fecha_registro DESC)
    INCLUDE (kilometraje);

-- Historial cronológico de mantenimientos (F06).
CREATE INDEX IF NOT EXISTS idx_mantenimientos_vehiculo_fecha
    ON mantenimientos (vehiculo_id, fecha_servicio DESC);

-- Último servicio por tipo y proyección de vencimiento (panel de alertas F09).
CREATE INDEX IF NOT EXISTS idx_mantenimientos_proximo_servicio
    ON mantenimientos (vehiculo_id, tipo_servicio, proximo_kilometraje DESC);

-- Reportes y estadísticas agrupadas por tipo de servicio.
CREATE INDEX IF NOT EXISTS idx_mantenimientos_tipo_fecha
    ON mantenimientos (tipo_servicio, fecha_servicio DESC);

-- Filtro del diccionario OBD-II por severidad.
CREATE INDEX IF NOT EXISTS idx_obd2_severidad
    ON codigos_obd2 (severidad, codigo);

-- Búsqueda dentro del arreglo de causas comunes (operador @> o &&).
CREATE INDEX IF NOT EXISTS idx_obd2_causas
    ON codigos_obd2 USING GIN (causas_comunes);


-- ============================================================================
-- 8. FUNCIONES Y TRIGGERS
-- ============================================================================

-- Actualiza updated_at en cada modificación de fila.
CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_catalogo_updated_at ON catalogo_especificaciones;
CREATE TRIGGER trg_catalogo_updated_at
    BEFORE UPDATE ON catalogo_especificaciones
    FOR EACH ROW
    EXECUTE FUNCTION fn_set_updated_at();

DROP TRIGGER IF EXISTS trg_vehiculos_updated_at ON vehiculos;
CREATE TRIGGER trg_vehiculos_updated_at
    BEFORE UPDATE ON vehiculos
    FOR EACH ROW
    EXECUTE FUNCTION fn_set_updated_at();

-- Valida cada lectura de odómetro y sincroniza el kilometraje del vehículo:
--   1. La lectura no puede ser menor al kilometraje inicial del vehículo.
--   2. Si la lectura supera el kilometraje actual, este se actualiza.
-- Se bloquea la fila del vehículo (FOR UPDATE) para evitar condiciones de
-- carrera cuando llegan varias lecturas concurrentes.
CREATE OR REPLACE FUNCTION fn_odometro_actualiza_vehiculo()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_km_inicial INTEGER;
    v_km_actual  INTEGER;
BEGIN
    SELECT kilometraje_inicial, kilometraje_actual
      INTO v_km_inicial, v_km_actual
      FROM vehiculos
     WHERE id = NEW.vehiculo_id
       FOR UPDATE;

    -- La FK se valida después del trigger; se emula el mismo error aquí para
    -- dar un mensaje claro.
    IF NOT FOUND THEN
        RAISE EXCEPTION 'El vehículo % no existe', NEW.vehiculo_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF NEW.kilometraje < v_km_inicial THEN
        RAISE EXCEPTION
            'El kilometraje % no puede ser menor al inicial (%) del vehículo %',
            NEW.kilometraje, v_km_inicial, NEW.vehiculo_id
            USING ERRCODE = 'check_violation';
    END IF;

    -- Solo se avanza el odómetro; una lectura corregida hacia atrás queda
    -- registrada en el log pero no reduce el kilometraje del vehículo.
    IF NEW.kilometraje > v_km_actual THEN
        UPDATE vehiculos
           SET kilometraje_actual = NEW.kilometraje
         WHERE id = NEW.vehiculo_id;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_odometro_actualiza_vehiculo ON odometro_logs;
CREATE TRIGGER trg_odometro_actualiza_vehiculo
    BEFORE INSERT ON odometro_logs
    FOR EACH ROW
    EXECUTE FUNCTION fn_odometro_actualiza_vehiculo();


-- ============================================================================
-- 9. DATOS INICIALES (SEED)
-- ----------------------------------------------------------------------------
-- Solo catálogos globales: especificaciones de fábrica (F02) y diccionario
-- OBD-II (F10). Son datos compartidos por todos los usuarios y sus INSERT son
-- idempotentes.
--
-- Los vehículos, las lecturas de odómetro y los mantenimientos NO se siembran
-- aquí: pertenecen a usuarios reales creados por Supabase Auth (auth.users) y
-- cada usuario los da de alta desde la aplicación tras iniciar sesión.
-- ============================================================================

-- 9.1 Catálogo de especificaciones de fábrica.
INSERT INTO catalogo_especificaciones (
    marca,
    modelo,
    anio_inicio,
    anio_fin,
    tipo_motor,
    aceite_km_maximo,
    aceite_meses_maximo,
    faja_distribucion_km
)
VALUES
    ('Toyota',  'Corolla', 2014, 2019, 'GASOLINA', 10000, 12, 120000),
    ('Toyota',  'Corolla', 2020, 2024, 'GASOLINA', 10000, 12, 160000),
    ('Toyota',  'Prius',   2016, 2022, 'HIBRIDO',  10000, 12, NULL),
    ('Honda',   'Civic',   2016, 2021, 'GASOLINA',  8000, 12, 100000),
    ('Nissan',  'Versa',   2015, 2022, 'GASOLINA',  8000, 12, 100000),
    ('Ford',    'Ranger',  2016, 2023, 'DIESEL',   10000, 12, 150000)
ON CONFLICT DO NOTHING;

-- 9.5 Diccionario OBD-II: códigos solicitados (P0300, P0420) y casos comunes.
INSERT INTO codigos_obd2 (
    codigo,
    titulo,
    categoria,
    descripcion_corta,
    causas_comunes,
    sintomas,
    severidad
)
VALUES
    (
        'P0300',
        'Falla de encendido aleatoria o múltiple',
        'Motor',
        'Falla de encendido aleatoria o múltiple detectada en uno o varios cilindros.',
        ARRAY[
            'Bujías desgastadas o con separación incorrecta',
            'Bobinas de encendido o cables defectuosos',
            'Inyectores sucios o con fuga',
            'Entrada de aire no medida (fuga de vacío)',
            'Presión de combustible baja o bomba deficiente'
        ],
        ARRAY[
            'Motor con marcha irregular o vibración',
            'Pérdida de potencia y tirones al acelerar',
            'Testigo Check Engine encendido o intermitente',
            'Mayor consumo de combustible',
            'Olor a combustible sin quemar en el escape'
        ],
        'ALTA'
    ),
    (
        'P0420',
        'Baja eficiencia del catalizador (banco 1)',
        'Emisiones',
        'Eficiencia del catalizador por debajo del umbral (banco 1).',
        ARRAY[
            'Catalizador degradado o saturado',
            'Sensor de oxígeno aguas abajo defectuoso',
            'Fugas en el sistema de escape',
            'Mezcla rica o falla de encendido previa',
            'Consumo de aceite o refrigerante hacia el escape'
        ],
        ARRAY[
            'Testigo Check Engine encendido',
            'Olor a azufre o huevo podrido en el escape',
            'Pérdida de potencia o respuesta lenta',
            'Mayor consumo de combustible',
            'Emisiones elevadas en la inspección'
        ],
        'ALTA'
    ),
    (
        'P0171',
        'Mezcla pobre en el banco 1',
        'Motor',
        'Mezcla demasiado pobre en el banco 1.',
        ARRAY[
            'Fuga de vacío o entrada de aire no medida',
            'Sensor MAF sucio o defectuoso',
            'Filtro de combustible obstruido',
            'Presión de combustible insuficiente',
            'Inyectores obstruidos'
        ],
        ARRAY[
            'Ralentí inestable o irregular',
            'Tirones o vacilación al acelerar',
            'Pérdida de potencia',
            'Testigo Check Engine encendido',
            'Posible olor a combustible'
        ],
        'MEDIA'
    ),
    (
        'P0128',
        'Temperatura del refrigerante por debajo del umbral',
        'Refrigeración',
        'Temperatura del refrigerante por debajo del umbral de regulación del termostato.',
        ARRAY[
            'Termostato atascado en posición abierta',
            'Sensor de temperatura del refrigerante defectuoso',
            'Nivel de refrigerante bajo'
        ],
        ARRAY[
            'El motor tarda en alcanzar la temperatura normal',
            'Calefacción poco eficiente',
            'Consumo de combustible elevado',
            'Testigo Check Engine encendido'
        ],
        'MEDIA'
    ),
    (
        'P0455',
        'Fuga grande en el sistema EVAP',
        'Emisiones',
        'Fuga grande detectada en el sistema de control de vapores EVAP.',
        ARRAY[
            'Tapa del tanque de combustible floja o dañada',
            'Mangueras o válvulas del sistema EVAP agrietadas',
            'Cánister de carbón saturado o roto'
        ],
        ARRAY[
            'Olor a combustible cerca del tanque',
            'Testigo Check Engine encendido',
            'Dificultad o ruido al cargar combustible',
            'Consumo de combustible ligeramente mayor'
        ],
        'BAJA'
    )
ON CONFLICT (codigo) DO UPDATE
    SET titulo = EXCLUDED.titulo,
        sintomas = EXCLUDED.sintomas;


-- ============================================================================
-- 10. SEGURIDAD: ROW LEVEL SECURITY (defensa en profundidad)
-- ----------------------------------------------------------------------------
-- Se habilita RLS en todas las tablas de la aplicación SIN policies, de modo
-- que si alguna vez se exponen vía Data API (roles anon/authenticated) el
-- acceso quede denegado por defecto.
--
-- El backend NO se ve afectado: conecta como rol `postgres` (dueño de las
-- tablas) y RLS no se aplica al dueño salvo FORCE ROW LEVEL SECURITY.
-- El aislamiento real por usuario lo aplica el backend en cada query
-- (WHERE usuario_id = $1), lo que cierra BOLA/IDOR.
-- ============================================================================
ALTER TABLE vehiculos                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE odometro_logs             ENABLE ROW LEVEL SECURITY;
ALTER TABLE mantenimientos            ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogo_especificaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE codigos_obd2              ENABLE ROW LEVEL SECURITY;


-- ============================================================================
-- Fin del esquema.
-- ============================================================================
