# Architecture Decision Records (ADR)

## ADR-001: Selección de Base de Datos y Modelo de Datos Híbrido
* **Estado:** Aceptado
* **Fecha:** 2026-10-28
* **Contexto:** Se requiere gestionar un gran volumen de especificaciones de fabricantes y permitir la personalización de usuarios.
* **Decisión:** Utilizar un esquema relacional PostgreSQL. El catálogo maestro proveerá las reglas por defecto, mientras que la tabla de mantenimientos registrará la decisión específica del usuario, evaluándola mediante un trigger/validación en la capa de aplicación.

## ADR-002: Lógica de Notificaciones y Semáforo de Estado
* **Estado:** Aceptado
* **Fecha:** 2026-10-28
* **Contexto:** Las proyecciones deben reflejar tanto el desgaste por uso (kilometraje) como por paso del tiempo (meses).
* **Decisión:** El cálculo del semáforo (F09) evaluará el valor que venza primero (kilometraje proyectado o fecha proyectada).



