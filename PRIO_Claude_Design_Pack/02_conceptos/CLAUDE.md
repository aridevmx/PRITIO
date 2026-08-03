# PRIO V1 — Mapa para agentes IA

> Este archivo está diseñado para que un agente (Claude, Cursor, Copilot, etc.) entienda el proyecto en una sola lectura. Si vas a tocar código, **leé esto primero**. Si encontrás algo desactualizado, **actualizalo en el mismo PR**.

## Qué es PRIO

SaaS de productividad multi-tenant con **espacios** (Personal / Casa / Trabajo) y **cuadrantes** (do / plan / delegate / later). Los workspaces tienen tipos: `personal`, `family`, `team`, `enterprise`. El flujo de aprobación opcional permite que tareas creadas por miembros (o asignadas a roles superiores) pasen por un aprobador antes de ser visibles.

**Stack:** React 19 · Vite 6 · TypeScript 5.7 (strict + noUnusedLocals) · Tailwind 3 · Supabase (Postgres + Auth + Realtime + RLS).

**Idioma:** UI y comentarios en **español** neutral (sin regionalismos marcados), identifiers en inglés. Los mensajes de error que ve el usuario son formales ("No cuentas con los permisos necesarios…").

---

## Layout de carpetas

```
src/
├── components/                     componentes UI sin dominio (botones, dialogs base, layout)
│   ├── layout/                     AppShell, Sidebar, UserMenu, WorkspaceSwitcher
│   ├── ConfirmDialog.tsx           <- usa createPortal al body para escapar stacking contexts
│   ├── ErrorBoundary.tsx
│   ├── Field.tsx                   <- label + optional badge, reusable en forms
│   ├── PrioLogo.tsx                <- componente del logo (grilla 2x2 de colores)
│   ├── State.tsx                   <- friendlyError(), permissionDeniedFor(), Empty/Loading/Error
│   ├── Toast.tsx
│   └── useModalEnter.ts            <- hook que abre modales con scroll smart
├── features/                       código por dominio. Cada feature: api.ts + use{Feature}.ts + components/
│   ├── auth/                       AuthProvider + AuthScreen + useEnsureWorkspace
│   ├── assignees/                  CRUD de etiquetas/responsables + multi-vinculado + leads
│   ├── calendar/                   MonthCalendar + utils + agenda de subordinados
│   ├── invitations/                accept-invitation flow + MembersPanel
│   ├── notifications/              feed in-app + NotificationBell
│   ├── projects/                   CRUD de proyectos + ProjectsPanel
│   ├── spaces/                     enum + SpaceView + PendientesView
│   ├── tasks/                      core domain — más adelante hay un mapa específico
│   └── workspaces/                 WorkspaceProvider + members + settings + roleHierarchy
├── lib/                            utilidades cross-feature
│   ├── appEvents.ts                bus de eventos singleton (emite "notifications:invalidate")
│   ├── mappers.ts                  snake_case (DB) ↔ camelCase (cliente)
│   ├── sentry.ts                   initSentry + reportError (filtra 42501 y AbortError)
│   ├── supabase.ts                 cliente Supabase + validación de env vars
│   ├── useDebouncedRealtimeRefresh.ts  <- debounce 200ms para callbacks de Realtime
│   └── utils.ts                    cn() (clsx + tailwind-merge)
├── types/index.ts                  tipos del dominio (Task, Workspace, Assignee, etc.) — única fuente de verdad
├── App.tsx                         router + providers
└── main.tsx                        entry point

supabase/
└── migrations/                     migraciones SQL numeradas (0001..00NN). Forward-only.

public/
└── brand/                          logos generados (svg + png 512/1024 + wordmark)

scripts/
└── check-supabase.mjs              valida que la DB esté al día con las migraciones (CI)
```

### Mapa específico de `features/tasks/` (la feature más densa)

```
features/tasks/
├── api.ts                          listTasks, createTask, updateTask, deleteTask, listMyPendingTasks
├── useTasks.ts                     hook con state + Realtime sub a tasks/project_members/task_assignees
├── useCompletedTasks.ts            hook variant para completadas
├── useMyPendingTasks.ts            hook para "mi feed" cross-workspace
├── useMyVisibilityScope.ts         calcula los assigneeIds del user actual (via assignee_members) + workspace personal
├── kpisMath.ts                     agregaciones (counts por cuadrante, por responsable, por fecha)
├── dates.ts                        helpers de fecha + agrupación por semana ISO + datetime-local helpers
├── quadrants.ts                    enum + metadata (color, ícono, título)
├── taskFilters.ts                  helpers de filtrado (taskHasAssignee, taskBelongsToUser, taskBelongsToMeFilter, taskMatchesAssigneeFilter, getAssigneeNamesLabel)
├── KpisView.tsx                    pantalla "Indicadores"
├── QuadrantsView.tsx               pantalla principal (4 cuadrantes) — orquestador
├── TaskNavigationProvider.tsx      navigateToTask/Project/Member/Workspace + useEntityHighlight
└── components/
    ├── TaskCard.tsx                tarjeta en cuadrante (con chips de responsables, canEdit/canDelete props)
    ├── TaskFormDialog.tsx          modal crear/editar tarea — orquestador post-Fase 4
    ├── TaskFormKindToggle.tsx      sub-componente: toggle Tarea/Junta
    ├── TaskFormQuadrantPicker.tsx  sub-componente: grid 2x2 de cuadrantes
    ├── TaskFormMeetingFields.tsx   sub-componente: inicio/fin/lugar/link
    ├── TaskFormApprovalField.tsx   sub-componente: toggle de aprobación
    ├── TaskFormResponsiblesField.tsx sub-componente: switch entre Multi/Meeting select
    ├── QuadrantColumn.tsx          columna que renderiza N TaskCards (recibe canEditTask/canDeleteTask)
    ├── MultiAssigneeSelect.tsx     dropdown con search; prop `warningMap` (no `disabledMap`)
    ├── MeetingParticipantsSelect.tsx selector de profiles para juntas
    ├── ApprovalsBanner.tsx         feed pendientes de aprobación + muestra "Aprobador: Juan"
    ├── CompletedTasksSection.tsx   colapsable de completadas, agrupadas por semana ISO
    ├── DayDetailDialog.tsx         dialog del calendario con tareas del día
    └── SpaceToolbar.tsx            filtros (proyecto, responsable, chip "Yo")
```

---

## Cómo encontrar las cosas

| Buscás… | Andá a… |
|--------|---------|
| Cómo se renderiza una tarea | `features/tasks/components/TaskCard.tsx` |
| Cómo se crea/edita una tarea | `features/tasks/components/TaskFormDialog.tsx` (+ los 5 sub-componentes `TaskForm*`) |
| Lógica de fetch de tareas | `features/tasks/api.ts` (todo Supabase) |
| Estado de tareas en memoria | `features/tasks/useTasks.ts` |
| Filtros y helpers de tareas | `features/tasks/taskFilters.ts` |
| Permisos / RLS / triggers DB | `supabase/migrations/00NN_*.sql` (ver tabla abajo) |
| Mapeo DB ↔ cliente | `src/lib/mappers.ts` |
| Tipos del dominio | `src/types/index.ts` |
| Mensajes de error formales | `src/components/State.tsx` (`friendlyError`, `permissionDeniedFor`) |
| Modales (scroll, animación, escape) | `src/components/useModalEnter.ts` |
| Modal sobre otros modales (ConfirmDialog) | `src/components/ConfirmDialog.tsx` (usa `createPortal` al `document.body`) |
| Cómo se navega de notif → tarjeta | `features/tasks/TaskNavigationProvider.tsx` |
| Sub-tipos de espacio (Casa/Trabajo) | `features/spaces/spaces.ts` |
| Roles de workspace | `WorkspaceRole` en `src/types/index.ts` (owner/admin/leader/member) |
| Rank de roles (family-aware) | `features/workspaces/roleHierarchy.ts` — usá `roleRankFor(role, workspaceType)` |
| Multi-vinculado de assignees (un user a N áreas) | mig 0034 `assignee_members` + `Assignee.linkedUserIds[]` |
| Lead de un área (aprobador) | mig 0036 (`assignee_members.is_lead`) + UI en AssigneeFormDialog |
| Routing de aprobaciones | mig 0037 `resolve_task_approvers` + `send_approval_notifications` |
| Realtime con debounce | `src/lib/useDebouncedRealtimeRefresh.ts` (ventana 200ms, silent) |
| Bus de eventos cross-feature | `src/lib/appEvents.ts` |
| Cliente Supabase | `src/lib/supabase.ts` |
| Bloqueos de día (vacaciones, cita) | mig 0058 + `features/blockedDays/` (`useBlockedDays`, `BlockDayDialog`, `MyBlockedDaysDialog`) |
| Push externo (Web Push)              | `supabase/functions/send-push/index.ts` + `features/pushNotifications/` |
| Recordatorio de junta 30 min (push)  | mig 0071 — `_prio_run_meeting_reminders()` + cron `prio_meeting_reminder` |
| Recuento diario push (mañana/tarde)  | mig 0072 — `_prio_run_daily_recap('morning'|'evening')` + crons; horarios por miembro en `workspace_members.recap_*` |
| Planes y gating de features          | `src/lib/plans.ts` (matriz Plan x Feature + límites) + `src/lib/usePlanGate.ts` (hook). Espejo SQL en función `plan_allows` (mig 0073) |
| Dev switcher de plan                 | `WorkspaceSettingsDialog` sección "Plan (dev)" — visible solo si `is_subscription_dev()` devuelve true. RPC `dev_set_workspace_plan` (mig 0073) |
| Límite 10 tareas activas en Free     | Trigger `guard_free_task_cap` (mig 0073). Frontend lo agarra con `friendlyError` y muestra mensaje |
| Tests del gating de planes           | `scripts/test-plan-gating.sql` — corré desde SQL editor; cubre H1-H3, compatibilidad type/plan, push gating, uniqueness family/team. Mira "Messages" panel para WARN/FALLO. |
| Tests del grace period + block fix   | `scripts/test-approval-grace.sql` — suite para mig 0076 (grace period) + mig 0077 (block excludes creator). Cubre G1-G18 (auto-aprobacion de managers, RLS oculta-tarea-en-grace, cancel_grace/finalize_grace_now permisos, _prio_run_finalize_grace, guard_personal_no_grace) y B1-B3 (autor con dia bloqueado SI puede crear tarea para otro, NO puede asignarse a si mismo). Prerreq: workspace team/enterprise + 2 miembros + assignees linkeados a cada uno. Skipea con SKIP los que faltan. |
| Config de horario de recap           | `WorkspaceSettingsDialog` ("Recuentos diarios (push)") + RPC `set_recap_schedule` (mig 0072) via `membersApi.setRecapSchedule` |
| Grace period (undo-send) en aprobaciones | `features/tasks/GraceProvider.tsx` — provider + countdown + toast UI inline. Montado en `App.tsx` dentro de `ToastProvider`. `QuadrantsView.handleSubmit` arranca con `grace.start(task, secs, onEdit)` cuando `submitFinalizedAt === null`. RPCs `finalizeGraceNow` / `cancelGrace` viven en `features/tasks/api.ts`. Mig 0076. |
| Slider de grace period (settings) | `WorkspaceSettingsDialog` seccion "Ventana para deshacer envio a aprobacion" — slider 0-20s. PREFERENCIA PERSONAL: visible y editable por todos los roles en team/enterprise. Vive en `workspace_members.approval_grace_seconds` (mig 0078, antes en `workspaces`). RPC `setApprovalGraceSeconds` en `membersApi.ts` opera sobre `auth.uid()`. |
| Plan de implementacion Stripe | `docs/STRIPE.md` — arquitectura completa, edge cases, checklist seguridad, 6 fases de rollout. `docs/STRIPE_DASHBOARD_SETUP.md` — walkthrough Tax/Portal/products en el Dashboard |
| Schema Stripe | migs 0079-0081 (enum + `subscriptions` extendida + `stripe_events` + `plan_prices` + RPCs internas + triggers pause/resume + `profiles.stripe_customer_id`). El webhook llama `internal_record_stripe_event` → `internal_upsert_subscription` → `internal_apply_subscription_state` con service_role. |
| Seed de precios Stripe | `scripts/seed-stripe-products.mjs` — corre con `STRIPE_SECRET_KEY=sk_test_xxx node scripts/seed-stripe-products.mjs`. Crea los 3 products + 12 prices con metadata y devuelve un INSERT SQL listo para pegar en `plan_prices`. Idempotente (busca por metadata antes de crear). `supabase/seed_plan_prices.sql` es solo template, no correrlo directo. |
| Pausa/credito Personal Pro | Triggers `maybe_pause_personal_pro` / `maybe_resume_personal_pro` en `workspace_members` (mig 0081). Marcan `subscriptions.pending_action`. El batch job (Edge Function `stripe-batch`, pendiente) lee `internal_pending_subscription_actions` cada 5min y llama Stripe API. |
| Edge Functions Stripe | `supabase/functions/stripe-{checkout,portal,webhook}/index.ts`. Webhook verifica firma async con `Stripe.createSubtleCryptoProvider()` (Deno-friendly), dedupea por event.id en `stripe_events`, llama RPCs internas. Checkout valida owner, crea/cachea Customer en `profiles.stripe_customer_id`, sube metadata `{workspace_id, plan, user_id}` a la sub. Portal solo requiere `customer_id`. CORS habilitado. |
| Frontend billing | `src/features/billing/` — `api.ts` (wrappers de Edge Functions + queries de subscriptions), `useSubscription.ts` (hook con Realtime sobre `subscriptions`), `BillingDialog.tsx` (modal único que muestra pricing si no hay sub, info+portal si hay; portalizado al body con `createPortal` para escapar el backdrop-blur del WorkspaceSettingsDialog), `BillingReturnScreens.tsx` (pantallas `/billing/success` y `/billing/cancel`). Rutas montadas en `App.tsx`. |
| Gate "Beta interna" del billing | `WorkspaceSettingsDialog.tsx` ~línea 778: `{!loadingRole && isOwner && isDev && (...)}` — solo users en `subscription_devs` (mig 0073) ven el CTA "Abrir facturación" con badge "Beta interna". Para lanzar pagos públicamente: quitar `&& isDev` + el badge. Mantiene la feature oculta en prod hasta cerrar precios/cuenta Stripe live. |
| Estado de Stripe en prod | Schema migs 0079-0081 SE PUEDE APLICAR a prod sin riesgo (additive, triggers no-op sin subs activas). Edge Functions NO se deployan en prod hasta tener `STRIPE_SECRET_KEY` live + webhook endpoint live. Frontend gateado por `isDev` no aparece a otros usuarios. Para activar pagos: ver Fases 1+2 cerradas en dev (cuenta Stripe test, products, webhook, secrets, deploy) y replicar en cuenta live. |

---

## Convenciones obligatorias

### Naming
- **Componentes**: `PascalCase.tsx`, mismo nombre que el export default (`TaskCard.tsx` → `export function TaskCard`).
- **Hooks**: `useCamelCase.ts`, prefix `use`.
- **Utilidades**: `camelCase.ts` (no PascalCase).
- **Tipos**: `PascalCase`, en `src/types/index.ts` salvo que sean prop-types locales.

### Imports
- Usá el alias `@/` que apunta a `src/`. Nunca `../../../`.
- Imports de tipos van con `import type {…}`.

### Estado y datos
- Cada feature tiene `api.ts` (funciones puras async) + `use{X}.ts` (hook con `useState` + Realtime).
- Mutaciones devuelven la entidad fresca y el hook hace `setX(prev => prev.map(...))` localmente para evitar refetch completo.
- **Nunca** llames Supabase directo desde un componente. Pasa por `api.ts`.
- DB usa `snake_case`. Cliente usa `camelCase`. La conversión vive en `src/lib/mappers.ts`. **No mezcles**.

### Errores
- Capturá con `try/catch` + `friendlyError(err)` (en `State.tsx`) → `toast.error(...)`.
- Errores de RLS (PostgREST devuelve 0 filas o `42501`) → tratalos como permission denied y devolvé el mensaje formal "No cuentas con los permisos necesarios…".
- Para validaciones de servidor en `.maybeSingle()`: si `data === null && !error`, lanzá un `Error` con `code: "42501"` para que `friendlyError` lo traduzca.

### Observabilidad (Sentry)
- Inicializado en `src/main.tsx` via `initSentry()` (lee `VITE_SENTRY_DSN`).
- Si la env var no está seteada → Sentry desactivado, `reportError()` es no-op. Útil en dev local.
- `reportError(err, { feature, action, ... })` desde `@/lib/sentry` para captures explícitas en flujos críticos.
- El `ErrorBoundary` (src/components/ErrorBoundary.tsx) captura automáticamente errores de render React.
- **Qué SÍ reportamos**: errores en background como `useTasks.refresh`, `useTasks.remove`, errores no esperados en componentes.
- **Qué NO reportamos**: errores con `code === "42501"` (permission denied) y `AbortError`. Filtrados en `beforeSend` y en `reportError` para no ensuciar la inbox.

### Modales
- Usá `useModalEnter({ pageScrollAbsolute: 70 })` para edit/delete (siempre scroll a 70px).
- Usá `useModalEnter({ pageScrollNudge: 70 })` para modales que se abren desde la toolbar.
- El backdrop debe ser `<div ref={backdropRef} className="fixed inset-0 z-[N] overflow-y-auto bg-ink/30 backdrop-blur-sm">` y manejar `onMouseDown` con `isBackdropClickOutside(e)`.
- El modal box adentro va con la clase `prio-modal-enter` para la animación slide-up.
- **ConfirmDialog** usa `createPortal(node, document.body)` porque puede invocarse desde el header (que tiene `backdrop-blur-md` y crea stacking context propio). Sin portal, su z-index quedaba atrapado.

### Realtime
- Cada hook con suscripción a Realtime usa `useDebouncedRealtimeRefresh(silentRefresh)` para agrupar ráfagas de eventos en 1 solo refetch (ventana 200ms).
- El `refresh()` exportado acepta `silent?: boolean`. Path manual usa `silent=false` (muestra LoadingState). Path Realtime usa `silent=true` (no parpadea).

### Tipos compartidos
- Si agregás una columna a una tabla, actualizá:
  1. La migración SQL.
  2. El tipo en `src/types/index.ts`.
  3. El `TaskRow` (o el row interface correspondiente) en `src/lib/mappers.ts`.
  4. La función `mapX` en `src/lib/mappers.ts`.
  5. Las funciones de api.ts (payloads de insert/update).
- Hacelo en el mismo PR. Si no, romperás `tsc --noEmit` o el runtime cuando PostgREST devuelva la columna nueva.

---

## Modelo de datos (resumen ejecutivo)

```
profiles ────────────── auth.users
   │
   └──< workspace_members >── workspaces ── workspace_family_seats
                                  │
                                  ├──< assignees (linked_user_id cache primary)
                                  │       │
                                  │       ├──< assignee_members (junction N:N user, is_primary, is_lead, added_at)
                                  │       │
                                  │       └──< project_members
                                  │
                                  ├──< projects ──< project_members
                                  │
                                  ├──< invitations
                                  │
                                  └──< tasks (responsible_assignee_id cache primary)
                                           │
                                           ├──< task_assignees (junction M:N, is_primary, added_at)
                                           │
                                           └──< meeting_participants (kind=meeting)

notifications (kind: task_assigned | task_overdue | workspace_invitation | project_invitation |
                     role_changed | meeting_invitation | task_pending_approval)
```

### Decisiones clave

- **`assignees` ≠ `profiles`.** Una `assignee` es una *etiqueta de responsabilidad* del workspace ("Operaciones", "Juan", "Marketing"). Puede vincular a N users vía `assignee_members` (mig 0034). Si tiene linkeados, las acciones notifican a los users reales.
- **Multi-responsable** (Sprint A, mig 0023): `task_assignees` es M:N. `tasks.responsible_assignee_id` se mantiene como **cache denormalizado del primary** para compat con filtros viejos. Triggers bidireccionales (`mirror_task_responsible_to_junction` ↔ `sync_task_responsible_from_junction`) mantienen ambos sincronizados con guard `pg_trigger_depth() > 1`.
- **Multi-vinculado de assignees** (mig 0034): un assignee puede vincular a N users. `assignees.linked_user_id` es cache del primary; `assignee_members` es la fuente de verdad. Mismo patrón mirror/sync que `task_assignees`.
- **Lead de área** (mig 0036): `assignee_members.is_lead` marca al user que recibe las notificaciones de aprobación de tareas para esa área. Solo manager (owner/admin/leader) puede ser lead (UI lo restringe). Si no hay lead, fallback al de mayor rango entre los linkeados managers; si tampoco hay, fallback a todos los managers del workspace.
- **Family rank** (mig 0036): `workspace_role_rank_for(workspace_id, role)` trata `owner = admin = 3` en workspaces tipo `family` (refleja co-dueños/pareja). En `team`/`enterprise`/`personal` sigue siendo `owner=4`.
- **Routing de aprobaciones** (mig 0037): `notify_managers_on_pending_approval` no hace broadcast — delega en `send_approval_notifications` que llama a `resolve_task_approvers(task_id)`. Por cada assignee del task: lead, sino top-rank entre linked managers. Dedup. Fallback a todos los managers si ningún assignee resuelve.
- **Jerarquía de asignación** (mig 0031/0035, frontend Fase 2): cuando el actor intenta asignar a una etiqueta donde TODOS los linked users son de mayor rango y NO está marcado "Requiere aprobación", el frontend muestra warning + deshabilita submit. El trigger DB también lo rechaza con 42501 si llega ese INSERT. Áreas con al menos un linked manager de rank ≤ actor no aplican la regla.
- **Permisos sobre tasks**:
  - DELETE: owner/admin globales o creador (mig 0004 + 0018).
  - UPDATE: por author (no approval fields), por owner/admin/leader, por responsable, por approver (mig 0047), por family-member (mig 0053), por participante de junta cuando `kind='meeting'` (mig 0082).
  - Pero el **responsable, family-member y participante-de-junta solo pueden tocar `completed`/`completed_at`** (mig 0038/0047/0053/0082 trigger `guard_member_can_only_complete`). Si tocan otro campo, 42501. Approvers solo tocan `approved`/`rejected`/`rejection_reason`. Otros campos: solo creador o manager.
- **Visibilidad por rol en KPIs**: owner/leader del workspace ven todo. Admin/member ven solo lo suyo + proyectos donde lideran. Hook `useMyVisibilityScope`.
- **RLS está en TODO.** No hay endpoint que bypassee RLS salvo RPCs SECURITY DEFINER explícitos (`get_invitation_by_token` para no-auth users, helpers internos `is_workspace_member` / `is_project_member` / `workspace_role_of` que usan `auth.uid()`).
- **Realtime:** las tablas en `supabase_realtime` (mig 0015 + 0023 + 0034) emiten cambios; el cliente filtra por `workspace_id`. RLS aplica al payload de Realtime también. Los hooks debouncean los refetches con `useDebouncedRealtimeRefresh` (ventana 200ms).

---

## Migraciones — qué hace cada una

| # | Archivo | Resumen |
|---|---------|---------|
| 0001 | core_schema | profiles, workspaces, workspace_members, enums |
| 0002 | billing_assignees_projects | assignees, projects, billing |
| 0003 | tasks_invitations_transfers | tasks (con responsible_assignee_id), invitations |
| 0004 | rls_policies | policies para todas las tablas core |
| 0005 | rpc_functions | helpers SECURITY DEFINER (`is_workspace_member`, `workspace_role_of`) |
| 0006 | refine_invitation_uniqueness | partial unique index para invitations no aceptadas |
| 0007 | add_family_workspace_type | nuevo tipo `family` |
| 0008 | create_workspace_family_seats | tabla de plazas por workspace family |
| 0009 | delete_and_leave_workspace | RPCs `delete_workspace`, `leave_workspace` |
| 0010 | add_leader_workspace_role | nuevo rol `leader` |
| 0011 | project_role | rol en project_members (leader/member) |
| 0012 | notifications | tabla notifications + triggers de assignment/invitation |
| 0013 | fix_accept_invitation_race | RPC atómica para aceptar invitación |
| 0014 | refine_tasks_update_policy | "tasks: update by author (no approval fields)" |
| 0015 | enable_realtime | publicación supabase_realtime |
| 0016 | refine_approval_and_project_visibility | flow de aprobación + visibilidad por project + `is_project_member` |
| 0017 | rejected_task_lifecycle | resubmit on edit + guard approval fields + notify managers |
| 0018 | refine_task_lifecycle_v2 | refinamiento del 0017 + `tasks: delete by author` |
| 0019 | manager_edit_clears_rejection | trigger limpia rejected al editar manager |
| 0020 | notify_role_change | notificación al cambiar rol de un member |
| 0021 | data_integrity_for_deeplinks | auto-add asignado a project_members + `get_invitation_by_token` (RPC pública) |
| 0022 | responsible_can_update_task | policy: el responsable puede actualizar SU tarea |
| 0023 | task_assignees | **junction multi-responsable** + sync triggers + RLS |
| 0024 | drop_legacy_task_assigned_triggers | dropea `task_reassigned_on_update` (causaba doble notify) |
| 0025 | meetings | kind=meeting + start_at/end_at/location/meeting_link |
| 0026 | meeting_participants | junction profiles ↔ meeting + EXCLUDE constraint anti-overlap |
| 0027 | audit_hardening | enum `task_pending_approval` + fix triggers + workspace validation |
| 0028 | member_can_assign_to_others | members fuerzan approval cuando asignan a otro user |
| 0029 | guard_allows_nested_updates | `pg_trigger_depth() > 1` en guards para no romper cascadas |
| 0030 | unique_personal_workspace | partial unique index + hardening de `create_workspace` |
| 0031 | hierarchy_enforcement | `workspace_role_rank` + `guard_task_assignee_hierarchy` |
| 0032 | backfill_completed_at | `UPDATE tasks SET completed_at = updated_at WHERE completed AND completed_at IS NULL` |
| 0033 | auto_approve_respects_hierarchy | refinar `auto_approve_for_managers` + `auto_revert_approve_for_higher_rank` |
| 0034 | assignee_members | **junction multi-vinculado en assignees** + sync triggers + RLS |
| 0035 | hierarchy_triggers_use_junction | guard/auto_approve/revert iteran `assignee_members` (regla: bloquear si TODOS linkeados son de mayor rango) |
| 0036 | assignee_lead_and_family_rank | `is_lead` en `assignee_members` + `workspace_role_rank_for(workspace_id, role)` family-aware + triggers refinados |
| 0037 | approval_routing_to_leads | `resolve_task_approvers` + `send_approval_notifications` + trigger en `task_assignees` AFTER INSERT |
| 0038 | member_edit_only_completed | trigger `guard_member_can_only_complete` — responsable solo cambia `completed`/`completed_at` |
| 0039 | is_project_member_multilink | `is_project_member` usa `assignee_members` (cubre secundarios, no solo primary) |
| 0040 | perf_indexes | indices en `notifications.task_id`, `tasks.created_by`, `task_assignees.assignee_id` (hot paths post-0039) |
| 0041 | fix_resolve_approvers_ambiguity | `#variable_conflict use_column` en `resolve_task_approvers` (fix `user_id` ambiguo) |
| 0042 | meeting_overlap_skip_completed | `tasks.is_active boolean` + EXCLUDE constraint parcial + sync trigger (juntas completadas liberan slot) |
| 0043 | meeting_approval_routing | `resolve_task_approvers` extendido para meetings: prefiere managers entre participantes, sino peer cooperation |
| 0044 | agenda_sharing | `workspace_members.agenda_shared boolean` — toggle opt-in para que un manager exponga su agenda a miembros |
| 0045 | task_peer_approval | CTE `task_peer_fallback` — miembros peer de un área pueden aprobar tareas de otro miembro de la misma área |
| 0046 | guard_approval_accepts_peers | `guard_task_approval_fields` chequea la lista de approvers (no solo managers) |
| 0047 | rls_and_guard_for_peer_approvers | policy `tasks: update by approver` + `guard_member_can_only_complete` con flag `v_is_approver` |
| 0048 | cleanup_meeting_participants_on_task_change | backfill + AFTER UPDATE trigger: borra `meeting_participants` huérfanos cuando `task.kind` cambia o `start_at/end_at` se nulan |
| 0049 | family_seats_six_and_pre_invite_check | default family seats 5→6 + backfill + trigger `guard_invitation_seat_capacity` BEFORE INSERT en `invitations` (rechaza si `members+pending+1 > seat_count`) + RPC `get_workspace_seat_summary` accesible a cualquier miembro |
| 0050 | push_subscriptions | tabla `push_subscriptions` (endpoint, p256dh, auth, user_agent) + RLS solo-own + RPCs `register_push_subscription` / `unregister_push_subscription` para Web Push |
| 0051 | no_approvals_in_family | triggers `force_approval_on_other_assignee` / `force_approval_on_meeting_invite` saltan workspaces tipo family + `no_approvals_in_family` BEFORE INSERT/UPDATE en tasks fuerza `requires_approval=false, approved=true` + backfill destraba tareas atrapadas |
| 0052 | hierarchy_guard_skip_family | `guard_task_assignee_hierarchy` sale temprano para workspaces family — en family no hay jerarquía a respetar (member puede asignar a owner sin friction) |
| 0053 | family_complete_any_task | nueva policy `tasks: update by family member` + `guard_member_can_only_complete` reconoce family-member (cualquier miembro de family puede marcar `completed`/`completed_at`, otros campos siguen restringidos) |
| 0054 | push_subscription_no_hijack | `register_push_subscription` rechaza con 42501 si el endpoint ya está registrado para otra cuenta (antes permitía hijack del push por reasignación silenciosa via ON CONFLICT) |
| 0055 | delete_account | RPC `delete_account()` (GDPR / LFPDPPP): bloquea si user es único owner de workspace con otros miembros, sino anonimiza tasks (via FK on delete set null) + borra rows de workspace_members, assignee_members, push_subscriptions, notifications, meeting_participants, invitations.invited_by, profile. La Edge Function `delete-account` la llama y después invoca `auth.admin.deleteUser`. |
| 0056 | remove_workspace_member | RPC `remove_workspace_member(workspace_id, user_id)`: jerarquía owner saca a cualquiera salvo a sí mismo / admin saca a leader+member (no a otros admin) / leader+member no sacan. Cleanup de assignee_members + linked_user_id cache + meeting_participants antes de borrar la fila de workspace_members. |
| 0057 | task_history | tabla append-only `task_history` (action enum, changes jsonb) + triggers automáticos sobre tasks / task_assignees / meeting_participants que registran created/updated/completed/uncompleted/approved/rejected/assignee_added·removed/participant_added·removed. RLS SELECT-only para workspace members. Cascada se filtra con `pg_trigger_depth()`. |
| 0058 | user_blocked_days | tabla `user_blocked_days` (user_id, blocked_date, start_time/end_time opcionales, reason) + CHECK time-consistency + RLS (SELECT si compartes workspace, write own) + RPCs `list_blocked_days_for_workspace(workspace_id, from, to)` y `check_blocked_day(user_id, date, start?, end?)`. Fase 1 inicial. |
| 0059 | blocked_day_workspaces | junction `user_blocked_day_workspaces(block_id, workspace_id)` para que cada bloqueo tenga scope explícito de workspaces. Reemplaza los RPCs de 0058: `list_blocked_days_for_workspace` filtra por junction (solo bloqueos con scope en el workspace); `check_blocked_day(user_id, workspace_id, date, start?, end?)` agrega `p_workspace_id`. Personal no aplica (UI no ofrece feature). |
| 0060 | blocked_days_per_workspace | Re-modela `user_blocked_days`: agrega `workspace_id` directo (drop junction de 0059) + UNIQUE(user_id, workspace_id, blocked_date) + trigger `resolve_blocked_day_conflict` BEFORE INSERT que en conflicto **mantiene el de mayor duración** (todo el día = 1440 min, parcial = end-start). RPCs re-creados con la nueva firma. Habilita edición de bloqueos (update). |
| 0061 | hard_block_in_team | Fase 2 del bloqueo de día: triggers AFTER INSERT/UPDATE en `tasks`, `task_assignees`, `meeting_participants` que rechazan con 42501 + mensaje formal si la operación choca con bloqueos en workspace tipo `team`/`enterprise`. Reglas: juntas → solapamiento real con `[start_at, end_at]`; tareas → solo bloqueos all-day en `due_date`. Helpers `task_affected_users`, `user_blocks_for_task`, `enforce_hard_block_for_task`. Columna `tasks.block_override_id` (nullable) reserva para futuro. Family/personal siguen en soft (Fase 1). |
| 0062 | blocked_day_approvals | Workflow de aprobación al CREAR bloqueos: enum `blocked_day_status` (pending/approved/rejected) + columnas `decided_by`, `decided_at`, `rejection_reason` en `user_blocked_days`. Trigger BEFORE INSERT setea `status='pending'` solo si el creador es **member** en workspace tipo `team`/`enterprise` Y hay managers. Otros casos (manager creador, family, personal, sin managers) → `status='approved'` directo. Notif a managers (`blocked_day_pending_approval`) al pedir. RPCs `approve_blocked_day(id)`, `reject_blocked_day(id, reason)` solo para managers, dispara notif al creador (`blocked_day_approved`/`blocked_day_rejected`). RPCs `list_blocked_days_for_workspace` y `check_blocked_day` ahora filtran `status='approved'` — los pending son invisibles para otros y no bloquean tareas/juntas. RPC `list_pending_blocked_days_for_workspace` para vista del manager. |
| 0063 | workspace_block_approval_toggle | Columna `workspaces.blocked_days_require_approval boolean default true` para que owner/admin de team/enterprise puedan apagar el workflow de aprobación de bloqueos (útil en teams chicos donde es overkill). El trigger `set_blocked_day_initial_status` (mig 0062) ahora respeta el flag: si está en `false`, los bloqueos de members nacen `approved` directo. Toggle en `WorkspaceSettingsDialog` visible para owner/admin en team/enterprise. |
| 0064 | fix_notify_managers_security_definer | Hotfix de mig 0062: la función `notify_managers_on_blocked_day_pending` no estaba marcada como `SECURITY DEFINER`, por lo que al intentar INSERT a `notifications` (que no tiene policy de INSERT — solo bypass via SECURITY DEFINER) la operación de crear bloqueo `pending` fallaba con 42501. La función se re-declara con `SECURITY DEFINER + search_path`. |
| 0065 | fix_list_pending_ambiguity | Hotfix de mig 0062: `list_pending_blocked_days_for_workspace` colisionaba `user_id` del `RETURNS TABLE` con la columna `user_id` de `workspace_members` (mismo patrón de mig 0041). Se agrega `#variable_conflict use_column` + prefijos `wm.` en el SELECT INTO interno. |
| 0066 | fix_rejected_blocks_reset | Hotfix de mig 0060+0062: si un bloqueo fue rechazado por el manager y el member intenta crear otro en el mismo (user, workspace, día), el trigger `resolve_blocked_day_conflict` (mig 0060) lo trataba como conflicto y o abortaba el INSERT o lo UPDATE-eaba sin disparar el trigger AFTER INSERT — el bloqueo nunca llegaba a `pending` y no había notif al manager. Fix: si el existente está `status='rejected'`, se borra antes del INSERT y se permite el flow normal. |
| 0067 | fix_task_history_cascade | Hotfix de mig 0057: al borrar una tarea, postgres cascadeaba el delete a `task_assignees`/`meeting_participants` y los triggers AFTER DELETE intentaban INSERT en `task_history` con un `task_id` que ya estaba siendo borrado → FK violation → 409 Conflict en REST. Fix: envolver el INSERT del log en `begin/exception when foreign_key_violation then null` para ignorar el caso de cascade. |
| 0068 | auto_promote_due_to_do | Columna `workspaces.auto_promote_due_to_do boolean default false` + RPC `auto_promote_due_tasks(workspace_id)` que mueve tareas con `due_date <= current_date` (vencidas + del día), `completed=false`, `kind='task'` y `quadrant<>'do'` al cuadrante `do`. Idempotente. Solo accesible a miembros del workspace. Toggle en `WorkspaceSettingsDialog` (owner/admin, todos los tipos salvo personal). Hook `useAutoPromoteOnLoad` dispara una vez por día por workspace via `localStorage` tracking. |
| 0069 | self_update_agenda_shared | Hotfix de mig 0004: la policy `"members: update if owner"` solo permite a owner cambiar `workspace_members`. Cualquier admin/leader/member que activaba "Compartir mi agenda" recibía UPDATE silenciosamente bloqueado por RLS (0 rows affected sin error), y al recargar el dialog veía la opción desmarcada. Fix: RPC `set_agenda_shared(workspace_id, value)` SECURITY DEFINER que solo toca `agenda_shared` del row del invocante (`auth.uid()`). |
| 0070 | recap_schedule_and_dedup | Columnas `recap_morning_at time` / `recap_evening_at time` / `recap_timezone text default 'America/Mexico_City'` en `workspaces` (NULL en horas = recap apagado). Tablas dedup `daily_recap_sent(workspace_id, user_id, slot, sent_date)` y `meeting_reminders_sent(task_id, user_id)` — RLS habilitado sin policies (solo service_role escribe desde cron). Constraint NOT VALID que valida `recap_timezone` contra `pg_timezone_names`. |
| 0071 | push_cron_jobs | pg_cron + pg_net + 3 jobs para push externo: `prio_meeting_reminder` (cada 1 min, push 30 min antes a participantes via `meeting_reminders_sent`) + `prio_daily_recap_morning` / `prio_daily_recap_evening` (cada 5 min, ventana 1h post-`recap_X_at` en tz del workspace, dedup via `daily_recap_sent`, conteo: matutino = `due_date<=today AND completed=false`, vespertino = `due_date=today AND completed=false`). Tabla single-row `prio_cron_config(send_push_url, service_role_key)` — el operador la llena post-deploy. **Estos pushes NO entran a `notifications`** (no campanita); `_prio_send_push` llama a `send-push` directo via `net.http_post`. DO block tolerante: si pg_cron/pg_net no están activos, las helpers quedan creadas y los schedules se omiten con NOTICE. |
| 0072 | recap_schedule_per_member | Forward-only fix de 0070. Mueve `recap_morning_at` / `recap_evening_at` / `recap_timezone` de `workspaces` a `workspace_members` (preferencia personal por workspace, no config del workspace). Defaults `07:00` / `17:00` / `America/Mexico_City` — postgres backfill auto al add column. Drop trigger + funcion viejas sobre workspaces. Nuevo trigger `validate_member_recap_timezone` BEFORE INSERT/UPDATE valida tz contra `pg_timezone_names`. RPC `set_recap_schedule(workspace_id, morning_at, evening_at, timezone)` SECURITY DEFINER permite self-update via `auth.uid()` (la policy `members: update if owner` bloquearia el path directo). `_prio_run_daily_recap` re-escrito para iterar `workspace_members` en vez de `workspaces`. La dedup table `daily_recap_sent` ya usaba PK (workspace_id, user_id, slot, sent_date) que sirve igual para per-member. |
| 0073 | workspace_plans | **Source of truth de planes.** `workspaces.plan` (text, CHECK compat con `type`): `personal_free` / `personal_pro` / `family` / `team` / `enterprise`. Backfill desde `type`. Tabla `subscription_devs(user_id)` whitelist para el dev switcher (seed con email del owner del proyecto). RPCs `dev_set_workspace_plan` (chequea `subscription_devs`) y `internal_set_workspace_plan` (placeholder Stripe, service_role only). Trigger `guard_unique_family_team` BEFORE INSERT bloquea 2do workspace family/team del mismo owner. Función `plan_allows(workspace_id, feature)` espejo SQL de la matriz TS — mantener en sync con `src/lib/plans.ts`. Trigger `guard_free_task_cap` rechaza inserts >10 tareas activas en `personal_free`. RPC `register_push_subscription` re-escrita para chequear `plan_allows('push_notifications')` antes de aceptar (defensa en profundidad sobre el UI). |
| 0074 | cron_respects_plan | Hotfix de mig 0073: `_prio_run_meeting_reminders` y `_prio_run_daily_recap` agregan `where plan_allows(workspace_id, feature)` en su filter. Cierra el edge case donde un user con push subscription activa que se downgradea seguia recibiendo recordatorios/recap hasta que el endpoint expirara. Edge Function `send-push` tambien gateada para el camino Database Webhook (notifications INSERT): si la notif viene de un workspace cuyo plan no incluye `push_notifications`, responde 204 sin enviar. Fail-open en errores de plan_allows para no romper el flow critico de notifs. |
| 0075 | plan_gating_hardening | Tapa 3 huecos del gating de planes (mig 0073). (H1) Trigger `guard_workspace_plan_update` BEFORE UPDATE en `workspaces` rechaza cambio directo de `plan` salvo cuando la sesion seteo `app.plan_change_authorized=true` o el caller es `service_role`. Los RPCs `dev_set_workspace_plan` y `internal_set_workspace_plan` setean ese flag con `set_config(..., true)` (transaction-scoped) antes del UPDATE. (H2) Trigger `guard_push_subscription_plan` BEFORE INSERT en `push_subscriptions` chequea `plan_allows` para al menos un workspace del user — cierra el bypass via INSERT directo. (H3) Trigger `guard_free_task_cap` extendido a BEFORE INSERT OR UPDATE: cuando una tarea pasa de `completed=true` a `false` (reactivacion) y el workspace es `personal_free`, re-chequea el cap de 10. |
| 0076 | approval_grace_period | Grace period ("undo send") para tareas/juntas con `requires_approval=true` creadas por no-managers. `workspaces.approval_grace_seconds smallint 0..20`, `tasks.grace_started_at`, `tasks.submit_finalized_at`. Trigger BEFORE INSERT decide grace vs publicar; trigger BEFORE UPDATE bumpea timer en cada edit del autor; notify_managers_on_pending_approval ahora dispara cuando submit_finalized_at NULL → NOT NULL. RPCs `finalize_grace_now`, `cancel_grace`, `set_approval_grace_seconds`. Cron `prio_finalize_grace` cada 10s. Policy SELECT oculta tareas en grace a TODOS salvo el autor (evita race "approver curioso aprueba antes de cerrar grace"). Guard `guard_personal_no_grace` bloquea valores > 0 en personal. |
| 0077 | block_excludes_creator | Hotfix de mig 0061: `task_affected_users` ya NO incluye al `created_by` automatico — solo cuenta assignees (tareas) y meeting_participants (juntas). El bug era que un manager con su propio dia bloqueado no podia crear tareas para su equipo, porque el guard lo chequeaba como afectado. El frontend ya filtraba al currentUserId de los warnings; el server queda alineado. Para juntas, el form auto-agrega al creador como participante al activar kind=meeting, asi sigue protegido el caso "organizo y olvido invitarme". |
| 0078 | grace_seconds_per_member | Mueve `approval_grace_seconds` de `workspaces` a `workspace_members` — preferencia personal por miembro/workspace, cualquier rol la edita. Trigger `guard_personal_no_grace_member` rechaza valores > 0 en personal. Backfill copia el valor viejo del workspace a todos sus miembros. Triggers/RPCs leen ahora del creador de la tarea (`new.created_by`) via join con `workspace_members`. |
| 0079 | extend_subscription_status_enum | Extiende `subscription_status` (mig 0001) con valores Stripe: `unpaid`, `incomplete`, `incomplete_expired`, `paused`. Aislada porque `ALTER TYPE ADD VALUE` no permite usar el valor en la misma tx. Las migs 0080/0081 dependen de estos valores. |
| 0080 | stripe_schema | Extiende `subscriptions` (mig 0002, placeholder) con columnas Stripe: `owner_id`, `plan`, `currency`, `interval`, `canceled_at`, `ended_at`, `grace_until`, `paused_at`, `paused_remaining_days`, `tax_id`, `tax_country`. Drop del UNIQUE(workspace_id) → unique parcial "solo 1 activa por workspace" (habilita historial). Agrega `workspaces.grace_until` y `profiles.stripe_customer_id` (1 Customer Stripe por user, cubre todas sus suscripciones). Crea `stripe_events` (log idempotente, PK=event.id) + `plan_prices` (catalogo mutable plan/interval/currency → stripe_price_id, SELECT publico, escritura solo service_role). |
| 0081 | stripe_rpcs_and_triggers | Logica de aplicacion para el webhook Stripe. RPCs SECURITY DEFINER: `internal_record_stripe_event` (idempotencia), `internal_mark_event_processed`, `internal_upsert_subscription` (UPSERT por stripe_subscription_id), `internal_apply_subscription_state` (maquina de estados plan x is_frozen x grace_until — 14 dias grace tras past_due antes de frozen, setea `app.plan_change_authorized=true` para pasar guard de mig 0075), `internal_profile_by_stripe_customer`, `internal_pending_subscription_actions` (queue del batch job), `internal_complete_pause`/`internal_complete_resume`. Triggers `maybe_pause_personal_pro` (AFTER INSERT en workspace_members: entrar a family/team/enterprise con Personal Pro activo → `pending_action='pause'`) y `maybe_resume_personal_pro` (AFTER DELETE: salir del ULTIMO collab con Personal Pro pausado → `pending_action='resume'`). El batch job (Edge Function + cron) lee `internal_pending_subscription_actions` y llama Stripe. NO toca `_prio_guard_unique_family_team` — multi-family/team es feature v2. |
| 0082 | meeting_participants_can_complete | Cualquier participante de una junta puede marcarla como completada, igual que cualquier familiar puede cerrar una tarea de family (mig 0053). Para `kind='meeting'`: nueva RLS policy `"tasks: update by meeting participant"` que pasa el UPDATE cuando el actor esta en `meeting_participants`. Guard `guard_member_can_only_complete` extendido con `v_is_meeting_participant` (mismos campos permitidos que responsable: `completed`/`completed_at`). Side effect cero en `kind='task'` — la rama participant solo aplica para meetings. Mensaje del raise actualizado para mencionar el nuevo rol. |
| 0083 | creator_self_assigns_blocked_day | Continuacion de mig 0077. `task_affected_users` ahora filtra `t.created_by` incluso si aparece como `task_assignees` o `meeting_participants` — el dueno del bloqueo "opta in" al crear la tarea/junta y puede auto-asignarse trabajo en su propio dia bloqueado. Si la misma operacion afecta a OTROS users con bloqueo, esos siguen frenando con 42501. Frontend: el banner soft de "esta persona marco el dia como no disponible" en TaskFormDialog ahora solo se renderiza en workspaces `family` — en `team`/`enterprise` se elimina porque el guard duro (mig 0061) ya rebota con mensaje claro, y mostrar el soft + permitir submit confundia (sugeria que se podia continuar cuando en realidad fallaba). |

---

## Rutina del agente al recibir una tarea

1. **Leé este archivo si lo tocaste hace más de una semana.** Algo puede haber cambiado.
2. **Revisá la migración más alta** (`supabase/migrations/00NN`) para ver el estado actual del schema.
3. Si vas a tocar tipos: actualizá los 5 lugares que se mencionan en *Convenciones obligatorias → Tipos compartidos*.
4. Si vas a agregar una migración: numeralá `00NN+1_descripcion_corta.sql`, sin gaps.
5. **Después de cualquier cambio:** corré `npx tsc -b --force` (NO `tsc --noEmit` — ese pasa cosas que el build de Vercel rechaza, ej. spreads de `never`).
6. **Antes de cerrar:** corré `npm run lint` y `npm run check:supabase` (este último compara migraciones contra la DB remota).

---

## Patrones recurrentes (anti-checklist)

- [ ] **No hagas `select("*").from("tasks")`.** Siempre listá columnas explícitas con `TASK_COLUMNS` (ver `features/tasks/api.ts`).
- [ ] **No leas `assigneesById.get(task.responsibleAssigneeId)` para mostrar responsables.** Usá `task.assigneeIds` (que ya viene primary-first) — eso garantiza ver TODOS los responsables, no solo el primary.
- [ ] **No leas `assignees.linked_user_id` desde el cliente.** Usá `Assignee.linkedUserIds[]` (cubre primary + secundarios). El campo escalar es solo cache.
- [ ] **No uses `roleRank` directamente en código del workspace.** Usá `roleRankFor(role, workspaceType)` para que family rank funcione correctamente (owner=admin en family).
- [ ] **No uses `disabledMap` en `MultiAssigneeSelect`.** La prop se llama `warningMap` y las opciones siguen seleccionables — el caller muestra banner + deshabilita submit si hay violaciones.
- [ ] **No mockes la DB en tests.** Si llegamos a tener tests de integración: usá un schema real (Supabase local) para que los triggers y RLS se ejecuten.
- [ ] **No metas `responsible_assignee_id` en INSERT crudos del backend.** Pasá por `createTask()` que delega al mirror trigger; sino se pierde la consistencia con el junction.
- [ ] **No suscribas a Realtime sin un `useId()`.** Dos componentes con `useTasks()` montados en paralelo pelean por el canal si comparten nombre.
- [ ] **No suscribas a Realtime con refresh directo.** Usá `useDebouncedRealtimeRefresh(silentRefresh)` — debounce 200ms + sin tocar `isLoading`.
- [ ] **No exportes hooks desde un archivo de provider sin `// eslint-disable-next-line react-refresh/only-export-components`.** Es la única excepción tolerada.
- [ ] **No edites archivos grandes con la Edit tool repetidamente.** El bug de null bytes (truncado) aparece sobre todo en TSX > 600 líneas. Si pasa: limpiar con `tr -d '\000'` o reescribir con python (`open('w', encoding='utf-8')`).

---

## Decisiones congeladas

- **No usamos React Router para sub-rutas dentro del AppShell.** El estado de "qué espacio/proyecto/vista" vive en context (WorkspaceProvider, TaskNavigationProvider). Solo URLs raíz: `/` y `/invite/:token`.
- **No usamos React Query, SWR, Zustand, Redux, Jotai.** Context + `useState` + Realtime de Supabase es suficiente para el tamaño actual.
- **No usamos shadcn/ui ni Radix.** Componentes se construyen a mano con Tailwind para mantener control fino sobre la animación de modales.
- **No usamos Storybook.** Si necesitás iterar visualmente un componente, montalo en una página dummy local.
- **No diferenciamos area/persona via columna `kind`.** Se evaluó (mig 0036/0037 ahora no-op en repo) pero se descartó. En su lugar: una etiqueta puede tener N linked users; la regla de jerarquía mira si TODOS los linked son de mayor rango. Y el `lead` designa explícitamente quién aprueba.

---

- **La matriz de planes vive duplicada en TS y SQL.** `src/lib/plans.ts` y la función `plan_allows` (mig 0073) replican literalmente. Cualquier cambio se aplica en AMBAS o el front habilita algo que el back rechaza con 42501. Lo aceptamos como duplicación tolerable porque el catalog cambia poco; si crece, materializamos a tabla `plan_features` y ambos leen de ahí.
- **Ciclo de vida de suscripción — diseño para cuando llegue Stripe.** Cuando una sub expira, NO borramos datos. Pattern: 14 días de grace period donde el workspace queda accesible read-only (banner amarillo "Renová para seguir editando"); después `is_frozen=true` (data preservada, sin escrituras). Re-suscripción en cualquier momento descongela. Borrado solo después de muchos meses + emails de aviso. Implementación: tabla `subscriptions(workspace_id, plan, status, current_period_end, grace_until, paused_at, paused_remaining_days, stripe_subscription_id)`. Modelar en la mig de Stripe (~0080). Hasta entonces, `workspaces.plan` + `is_frozen` suffice.
- **Pause/credit del Personal Pro al entrar a Family/Team.** Si un user paga 12 meses de Personal Pro y a los 7 meses lo suman a un Family, su Personal Pro entra en `status='paused'` con `paused_remaining_days = days_until(current_period_end)`. Cuando sale del Family (o se le quita), `current_period_end = now() + paused_remaining_days`. Recupera lo que pagó. Implementación: webhook de Stripe + RPC `pause_subscription`/`resume_subscription`. UX: banner en WorkspaceSettingsDialog del personal "Tu Personal Pro está pausado (N días restantes)". Modelar junto con la mig de Stripe.
- **Remover de family/team → personal vuelve a Free automáticamente.** El `isMemberOfCollab` flag se computa fresh en cada render del WorkspaceProvider (deriva de la lista de workspaces que RLS expone). Cuando te sacan, la lista cambia, `effectivePlan` re-evalúa y todo gating se ajusta. No requiere migración nueva — el comportamiento es emergente del modelo.

## Glosario interno

| Término | Significado |
|---------|-------------|
| **Espacio** (Space) | `Personal | Casa | Trabajo`. Cada workspace tiene 1+ espacios habilitados según su tipo. |
| **Cuadrante** (Quadrant) | `do | plan | delegate | later`. Matriz Eisenhower. |
| **Responsable / assignee** | Etiqueta del workspace que se asigna a tareas. Puede o no estar linked a N users reales. |
| **Primary** | El responsable principal de una tarea (cache en `tasks.responsible_assignee_id`). En assignees, el linked user principal (cache en `assignees.linked_user_id`). |
| **Lead** | Para un assignee/área: el user manager que recibe las notificaciones de aprobación de tareas para esa área. Distinto del primary (responsable). |
| **Manager** | `owner` | `admin` | `leader`. Pueden aprobar/rechazar tareas. En family workspace, owner y admin tienen el mismo rank. |
| **Pendiente de aprobación** | Tarea con `requires_approval=true && approved=false && rejected=false`. |
| **Resubmit** | Cuando el autor edita una tarea rechazada, vuelve a "pendiente de aprobación" automáticamente (trigger `resubmit_rejected_task_on_edit`). |
| **Aprobador / approver target** | El user (o lista) que recibe la notificación cuando una tarea entra a la cola. Calculado por `resolve_task_approvers`. |

---

## Comandos útiles

```bash
npm run dev                    # vite dev server
npm run build                  # tsc -b && vite build
npm run typecheck              # tsc -b --noEmit
npm run lint                   # eslint .
npm run format                 # prettier --write
npm run test                   # vitest run
npm run test:watch             # vitest (watch mode)
npm run check:supabase         # valida que las migraciones estén aplicadas
```

---

## Cómo actualizar este archivo

Si encontrás algo que esta guía no menciona y te tomó más de 5 minutos descubrirlo, **agregalo acá**. Si hacés un refactor estructu