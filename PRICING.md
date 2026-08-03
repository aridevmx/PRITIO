# Modelo de precios y licenciamiento

Prio tiene una sola regla: **el código es 100% open-source y gratis**. Solo se cobra el
cloud gestionado (hosting, notificaciones, correo, respaldos y mantenimiento).

- **Self-host / uso propio:** gratis, sin límite. Descarga el código, despliéguelo
  donde quieras (Vercel, Netlify, tu servidor) y conéctalo a tu instancia de Supabase.
- **Cloud gestionado (prio.app):** freemium. Un plan gratuito para siempre y un plan Pro
  de pago para equipos y familias que quieran el servicio mantenido.

## Planes

| Plan | Uso | Incluye | Costo |
| ---- | --- | ------- | ----- |
| Self-host | Personal o negocio | Todo el código, sin límite de usuarios ni funciones | $0 |
| Gratis (cloud) | Personas | 1 workspace activo, 3 miembros, tareas ilimitadas, calendario | $0 |
| Pro (cloud) | Familias y equipos | Workspaces ilimitados, miembros ilimitados, invitaciones por correo, notificaciones push, respaldos y prioridad de soporte | ~$4/mes por usuario (por definir en lanzamiento) |
| Enterprise (cloud) | Equipos grandes | Todo lo de Pro + dominio propio, onboarding, SLA y facturación anual | Cotización |

## Mapeo a `workspaces.plan`

La columna `plan` de la tabla `workspaces` guarda el plan de cada workspace:

- `personal_free` — plan gratuito (default de todos los workspaces creados hoy).
- `pro` — workspace Pro (cloud de pago).
- `enterprise` — workspace Enterprise (facturación especial).

Reglas de negocio actuales (Fase 3, sin cobros aún):

- Todo workspace se crea como `personal_free`.
- Los workspaces `personal_free` están sujetos a los límites del plan gratuito;
  se aplican con `is_frozen` (workspace congelado por exceder límites) y
  `grace_until` (fecha límite para migrar de plan antes de congelarse).
- Los workspaces `pro` y `enterprise` no tienen límites de suscripción.

## Estado actual

- El cobro real (Stripe) **no está implementado**: se agrega después del lanzamiento.
- Esta fase solo define el modelo de datos, la documentación y el mapeo de tipos en el
  frontend, para que el código ya "hable" el lenguaje de planes.
- La UI de planes (badge por workspace, página de precios, portal de facturación)
  se construye en la fase de monetización.
