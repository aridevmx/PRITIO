# Modelo de precios y licenciamiento

PRITIO tiene una sola regla: **el código es 100% open-source y gratis**. Solo se cobra el
cloud gestionado (hosting, notificaciones, correo, respaldos y mantenimiento).

- **Self-host / uso propio:** gratis, sin límite. Descarga el código, despliéguelo
  donde quieras (Vercel, Netlify, tu servidor) y conéctalo a tu instancia de Supabase.
- **Cloud gestionado (pritio.app):** freemium. Un plan gratuito para siempre y un plan
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
| **Enterprise** | Equipos grandes | Cotización / compra nivel Equipo | — | — | 50 |

- **Moneda:** USD y MXN. El usuario elige la moneda al hacer checkout.
- **Asientos:** en Familiar y Equipo la cantidad = número de miembros del workspace
  (mínimo 1). Al añadir/quitar miembros, `sync-seats` ajusta la `quantity` en Stripe con
  prorrateo.
- **Enterprise** compra el nivel Equipo Pro (misma tarifa), reservando los límites más
  altos y una facturación especial posterior.

## Prueba gratuita

- **14 días**, una sola vez por cuenta (`profiles.pro_trial_used_at`).
- Si la cuenta ya usó el trial, el siguiente checkout no incluye trial.
- Al crear una suscripción con trial, el webhook marca el trial como usado.

## Límites por plan (`plan_limits`)

`plan` es **`free`** o **`pro`** (ya no existe `lifetime`). El tipo de workspace
(`workspace.type`: personal / family / team / enterprise) se resuelve contra `plan_limits`
y lo expone el frontend vía `prio_plan_limit` (regex en `src/features/billing/guarded.ts`).

| plan | workspace_type | miembros | tareas activas | proyectos |
| ---- | -------------- | -------- | -------------- | --------- |
| free | personal | 1 | 100 | 3 |
| free | family | 5 | 500 | 10 |
| free | team | 10 | 1,000 | 20 |
| free | enterprise | 10 | 1,000 | 20 |
| pro | personal | 1 | 2,500 | 300 |
| pro | family | 10 | 50,000 | 100 |
| pro | team | 50 | 100,000 | 500 |
| pro | enterprise | 50 | 100,000 | 500 |

Fase 1 (entregada): catálogo Stripe, checkout/webhook y límites diferenciados.
Fase 2 (pendiente): bloqueo duro de features Pro (aprobaciones, roles, agenda, reportes);
la UI ya muestra la matriz completa.

## Modelo de datos

- `subscriptions` guarda una fila por suscripción activa **por workspace**
  (`workspace_id`, `plan='pro'`, `status`, `quantity`, `trial_ends_at`,
  `current_period_end`, `stripe_subscription_id`), con índice único parcial
  `subscriptions_pro_one_per_workspace`.
- `effective_plan(p_user_id, p_workspace_id)` resuelve el plan efectivo de un workspace
  (free si no hay suscripción activa).
- `workspaces.plan` solo guarda `free`/`pro` (flag de caché de la suscripción).

## Edge functions

- `stripe-checkout`: crea la sesión de Stripe (tier × moneda × periodo, `quantity` =
  miembros, trial de 14 días si aplica, metadata con `workspace_id`).
- `stripe-webhook`: sincroniza `subscriptions` por workspace y marca el trial usado.
- `sync-seats`: recalcula la `quantity` desde `workspace_members` y actualiza Stripe
  (disparado por trigger en `workspace_members` vía pg_net).
- `stripe-portal`: portal de facturación del cliente.
