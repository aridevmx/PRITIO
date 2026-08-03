# Changelog

Todas las versiones notables de Prio se documentan aquí.
Formato basado en [Keep a Changelog](https://keepachangelog.com/es/1.1.0/);
este proyecto cumple con [Versionado Semántico](https://semver.org/lang/es/).

## [Unreleased]

### Añadido
- Modal "Mi cuenta" con pestañas: Identidad (perfil y avatar por URL), Seguridad (cambio de contraseña), Preferencias (tema, formato de hora, sonidos, descarga de datos, cookies), Mis días bloqueados, Notificaciones (matriz evento×canal con aviso en app por evento) y Acerca de.
- Sonidos de interfaz con Web Audio API (tarea completada, notificación, recordatorio de junta), activables desde Preferencias.
- Exportación de datos personales a JSON desde Preferencias.
- Preferencia local por evento para avisos en la app (campana y/o toast, o desactivado).

### Cambiado
- Menú de usuario rediseñado: "Mi cuenta" como acción principal, avatar siempre visible y fecha con indicador de despliegue.

## [0.1.0] - 2026-08-02

### Añadido
- MVP: Matriz de Eisenhower con cuadrantes (Urgente-Importante), arrastrar y soltar, calendario mensual, tareas recurrentes.
- Espacios de trabajo (Personal, Casa, Trabajo) con miembros, roles y permisos.
- Invitaciones por correo con aceptación y redirección.
- Días bloqueados (usuario y por workspace) y vista de calendario.
- Notificaciones por correo y push (Web Push), preferencias por workspace.
- Temas claro/oscuro, formato de hora, estadísticas y KPIs.
- PWA con service worker y notificaciones push.
- Registro en beta cerrada (solo por invitación).

### Cambiado
- Repositorio inicializado en `main` con `git init`.
- Marca centralizada en `src/lib/branding.ts` (nombre, tagline, versión, URL).
- Nombres de producto unificados a través de la app y edge functions.

[0.1.0]: https://github.com/<owner>/prio/releases/tag/v0.1.0
