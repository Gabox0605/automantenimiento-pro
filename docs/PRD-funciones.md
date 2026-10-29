# Product Requirement Document (PRD) - AutoMantenimiento Pro

## Visión General
AutoMantenimiento Pro es una aplicación inteligente diseñada para gestionar el mantenimiento preventivo y correctivo de vehículos, anticipando servicios futuros mediante el seguimiento de la tasa de uso diario del usuario y respetando los límites de seguridad de los fabricantes.

---

## Matriz de Requerimientos Funcionales

### Módulo 1: Gestión de Vehículos y Catálogo
* **F01. Registro y Selección de Vehículo:** Captura Marca, Modelo, Año, Motorización y Kilometraje Inicial del vehículo ingresado por el usuario.
* **F01.B. Auditoría Inicial (Checklist de Alta):** Al registrar un vehículo usado, el sistema evalúa componentes críticos alcanzados por el kilometraje (ej. faja de distribución a los 150,000 km) y solicita confirmación del usuario.
* **F02. Catálogo de Especificaciones de Fábrica:** Base de datos relacional de especificaciones con límites máximos e intervalos seguros recomendados por el fabricante.

### Módulo 2: Seguimiento de Kilometraje Diario
* **F03. Ingreso Diario de Odómetro:** Formulario rápido para guardar el kilometraje actual con fecha y hora.
* **F04. Algoritmo de Tasa de Uso Promedio:** Módulo que calcula el promedio de kilometraje recorrido por día y por semana.

### Módulo 3: Historial y Registro de Mantenimiento
* **F05. Registro de Mantenimientos Realizados:** Formulario de servicio donde el usuario define la duración/intervalo de uso (en km y meses) para sus repuestos, validando que no exceda el límite del fabricante.
* **F06. Historial Cronológico:** Vista ordenada de mantenimientos previos con taller, costos y fecha.

### Módulo 4: Motor de Proyección y Estado
* **F07. Cálculo de Próximo Kilometraje:** Proyección de kilometraje objetivo para el siguiente servicio ($Km_{siguiente} = Km_{actual} + Intervalo_{elegido}$).
* **F08. Estimación de Fecha Objetivo:** Estimación de la fecha en la que el usuario alcanzará el kilometraje proyectado basándose en su tasa de uso diario (**F04**).
* **F09. Panel de Alertas y Semáforo:** Estado en tiempo real del vehículo:
  - 🟢 **Verde:** Al día.
  - 🟡 **Amarillo:** Próximo a vencer (< 500 km o < 15 días).
  - 🔴 **Rojo:** Vencido o requiere confirmación crítica.

### Módulo 5: Asistencia Técnica y Diagnóstico
* **F10. Consulta de Códigos OBD-II (DTC):** Diccionario e interpretación sencilla de códigos de error de diagnóstico (ej. `P0300`, `P0420`).
* **F11. Asistente de Diagnóstico por Síntomas:** Integración con agente de IA para interpretación de fallas mediante descripción en lenguaje natural.
* **F12. Lector de Facturas por OCR (Fase 2):** Carga y extracción automática de datos desde facturas e impresos del taller.
