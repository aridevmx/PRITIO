# Changelog

Todas las versiones notables de PRITIO se documentan aquí.
Formato basado en [Keep a Changelog](https://keepachangelog.com/es/1.1.0/);
este proyecto cumple con [Versionado Semántico](https://semver.org/lang/es/).

## [Unreleased]

## [0.1.6] - 2026-09-05

### Corregido
- Las tareas nuevas/editadas aparecían solo al refrescar: ahora la vista local
  reacciona al instante al guardar desde el formulario (sin depender del
  Realtime, que puede fallar o tardar) y sincroniza desde el servidor.
- Bordes sólidos de la UI suavizados con opacidad (menos duros).

### Añadido
- Botón de refrescar datos en la cabecera (recarga las tareas del servidor).

## [0.1.5] - 2026-08-26

## [0.1.4] - 2026-08-24

## [0.1.3] - 2026-08-18

## [0.1.2] - 2026-08-16

## [0.1.1] - 2026-08-12

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

[0.1.0]: https://github.com/<owner>/PRITIO/releases/tag/v0.1.0
