# Historial de Cambios — modulo_02_auditoria

## v0.1.0 — 2026-05-21
- Creación inicial del módulo.
- Implementados los cinco scripts de auditoría local: `escaner_puertos`, `escaner_procesos`, `analisis_autoinicio`, `estado_defensas`, `verificador_parches`.
- Todos exponen `run() -> dict` con contrato JSON uniforme.
- Certificación de seguridad: ningún script modifica el sistema; solo lectura pasiva.
