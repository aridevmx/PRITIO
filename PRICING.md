# Modelo de precios y licenciamiento

PRITIO tiene una sola regla: **el código es 100% open-source y gratis**. Solo se cobra el
cloud gestionado (hosting, notificaciones, correo, respaldos y mantenimiento).

- **Self-host / uso propio:** gratis, sin límite. Descarga el código, despliéguelo
  donde quieras (Vercel, Netlify, tu servidor) y conéctalo a tu instancia de Supabase.
- **Cloud gestionado (app.pritio.com.mx):** freemium. Un plan gratuito para siempre y un plan
  **Pro** de pago, facturado **por workspace** (no por cuenta), con tres niveles según el
  tipo de workspace.

## Planes (por workspace)

La suscripción Pro es **por workspace**: cada workspace (Personal, Familiar, Equipo) compra
su propio nivel. Un mismo usuario puede tener varios workspaces Pro o mezclar gratis/Pro.

| Nivel | Para quién | Facturación | Mensual | Anual | Asientos incluidos |
| ----- | ---------- | ----------- | ------- | ----- | ------------------ |
| **Gratis** | Todos | — | $0 | $0 | Ver límites por tipo de workspace |
| **Personal Pro** | Uso individual | Fijo | USD $3 / MXN $49 | USD $29.99 / MXN $499 | 1 |
| **Familiar Pro** | Familias (hasta 10 miembros) | Por miembro | USD $4 / MXN $69 por miembro | USD $40 / MXN $699 por miembro | Hasta 10 |
| **Equipo Pro** | Equipos (hasta 50 miembros) | Por miembro | USD $6 / MXN $99 por miembro | USD $60 / MXN $999 por miembro | Hasta 50 |

- **Moneda:** USD y MXN. El usuario elige la moneda al hacer checkout.
- **Asientos:** en Familiar y Equipo la cantidad = número de miembros del workspace
  (mínimo 1). Al añadir/quitar miembros, `sync-seats` ajusta la `quantity` en Stripe con
  prorrateo.
- **Workspaces gratis:** 1 workspace gratuito de cada tipo (Personal base + 1 Familia + 1
  Equipo). Para crear un segundo workspace del mismo tipo hace falta Pro.

## Prueba gratuita

- **14 días Pro**, activados **por workspace** al crear un workspace Familiar o Equipo
  (RPC `start_pro_trial` en la migración 0025). Cada Familia/Equipo puede probar Pro una vez.
- Personal no tiene prueba: su Pro se compra directo en checkout.
- Durante la prueba el workspace se comporta como Pro (`effective_plan` resuelve a `pro`
  mientras `trial_ends_at` no haya pasado). Al terminar la prueba vuelve a Gratis.

## Límites por plan (`plan_limits`)

`plan` es **`free`** o **`pro`**. El tipo de workspace (`workspace.type`: personal / family /
team) se resuelve contra `plan_limits` y lo expone el frontend vía `prio_plan_limit`
(regex en `src/features/billing/guarded.ts`). `workspace_limit` (1 en todas las filas) limita
a un workspace gratuito por tipo.

| plan | workspace_type | miembros | tareas activas | eventos agenda | proyectos | responsables | días bloqueados | vistas Plan/Tablero | juntas | fecha límite |
| ---- | -------------- | -------- | -------------- | -------------- | --------- | ------------ | --------------- | ------------------- | ------ | ------------ |
| free | personal | 1 | 50 | 0 | 3 | 0 | 10 | ✗ | ✗ | ✗ |
| free | family | 4 | 50 | 10 | 5 | 5 | 10 | ✗ | ✗ | ✗ |
| free | team | 5 | 100 | 0 | 5 | 10 | 10 | ✗ | ✗ | ✗ |
| pro | personal | 1 | 300 | 0 | 100 | 0 | 30 | ✓ | ✓ | ✓ |
| pro | family | 10 | 300 | 100 | 100 | 50 | 30 | ✓ | ✓ | ✓ |
| pro | team | 50 | 5,000 | 0 | 500 | 500 | 90 | ✓ | ✓ | ✓ |

- **Juntas y eventos** tienen cuotas **mensuales** por workspace (no cuentan contra el
  límite de tareas activas): Gratis 5/mes en los tipos donde aplican; Pro ilimitado.
  Server-side, error `prio_plan_limit:meetings` / `prio_plan_limit:events`.
- **Fecha límite** se oculta en la UI en Gratis (sin bloqueo en servidor).
- **Eventos de familia** viven en `tasks` con `kind = 'event'` (la tabla
  `family_agenda_events` se migró y se eliminó en 0027). Disponibles en workspaces tipo
  Familia y Personal; por defecto `visibility = 'assigned'` (solo los asignados los ven),
  los administradores/líderes pueden marcarlos "visibles para todos".
- **Vistas Plan y Tablero** se ocultan en Gratis.
- Fase 1 (entregada): catálogo Stripe, checkout/webhook, límites diferenciados, prueba por
  workspace y feature flags. Los datos existentes que superen un límite tras bajar de plan
  no se purgan automáticamente.

## Modelo de datos

- `subscriptions` guarda una fila por suscripción **por workspace** (`workspace_id`,
  `plan='pro'`, `status`, `quantity`, `trial_ends_at`, `current_period_end`,
  `stripe_subscription_id`), con índice único parcial `subscriptions_pro_one_per_workspace`.
- `start_pro_trial(p_workspace_id)` inserta la fila `pro`/`trialing` con
  `trial_ends_at = now() + 14 días` para el workspace (owner/admin, solo Familia/Equipo).
- `effective_plan(p_workspace_id)` resuelve el plan efectivo de un workspace (free si no hay
  suscripción activa ni trial vigente).
- `create_workspace` limita a un workspace gratuito por tipo vía `workspace_limit`.
- `workspaces.plan` solo guarda `free`/`pro` (flag de caché de la suscripción).
- Legacy (sin uso nuevo): `profiles.pro_trial_used_at`, `mark_pro_trial_used()`,
  `effective_plan_account()`, `my_effective_plan_account()`, `my_pro_trial_used()`.

## Edge functions

- `stripe-checkout`: crea la sesión de Stripe (tier × moneda × periodo, `quantity` =
  miembros, metadata con `workspace_id`). Sin trial en checkout: la prueba se activa por
  workspace vía RPC al crearlo.
- `stripe-webhook`: sincroniza `subscriptions` por workspace (estados active/trialing/
  past_due/canceled).
- `sync-seats`: recalcula la `quantity` desde `workspace_members` y actualiza Stripe
  (disparado por trigger en `workspace_members` vía pg_net).
- `stripe-portal`: portal de facturación del cliente.
