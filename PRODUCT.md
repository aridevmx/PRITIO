# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Primary: individual professionals** organizing their own tasks, meetings, and priorities.
**Secondary: small teams (2–10)** collaborating on shared workspaces with roles and approvals.
Both use the product in Spanish (México/LATAM), on desktop and mobile web.

## Product Purpose

PRITIO is a task manager built around the Eisenhower Matrix (urgente–importante). It helps users decide *what to work on* rather than just *what to remember*. Meetings, blocked days, and approvals integrate directly into the priority system instead of living in a separate calendar.

## Positioning

The Eisenhower Matrix is PRITIO's core interaction, not a separate view. Tasks land in a quadrant (Haz ahora, Planifica, Delega, Después) on creation, and every other surface — calendar, stats, filters — reinforces that structure rather than replacing it.

## Operating Context

- Users open PRITIO in a browser tab and keep it alongside email, Slack/Teams, and a calendar.
- Daily workflow: review quadrants → check calendar → complete/update tasks → review stats.
- Tasks have due dates, assignees (individuals from workspace members), and optional meeting schedules.
- Workspaces are typed (personal, family, team) to adjust collaboration features.

## Capabilities and Constraints

- **Confirmed:** Tasks with quadrants, due dates, assignees, projects, meetings. Weekly/Daily planning views. Calendar with task overlay. Basic stats (active tasks, completed this week, on-time rate, quadrant load, assignee load). Multi-workspace support. Role-based access (owner, admin, leader, member). Push notifications. Invitations. Per-workspace billing model (free / pro; three Pro tiers by workspace type) with per-workspace-type limits, enforced client-side (gates + upsell prompts) and server-side (quota triggers), documented in `PRICING.md`.
- **MVP phase:** Calendar integration is built but not synced with external calendars. Approvals workflow exists but is simplified. Blocked days exist.
- **Open source + hosted cloud:** The product will be released as open source. PRITIO Cloud (app.pritio.com.mx) runs freemium: Free is always free with one workspace per type (Personal base + 1 Familia + 1 Equipo); Pro is paid per workspace (Personal/Familiar/Equipo tiers, USD and MXN, per-member for family/team) with a 14-day trial per Familia/Equipo workspace activated on creation. Lifetime was removed. Checkout, webhook, and billing portal are wired to Stripe (see `PRICING.md`).
- **Language:** UI is in Spanish (Mexico). Code and comments are in English.

## Brand Commitments

- **Name:** PRITIO (styled PRITIO in the logo).
- **Logo:** Keep the existing PRITIO logo mark.
- **Voice:** Professional but warm. Direct. Spanish (México).
- **Tagline / descriptor:** None confirmed yet.

## Evidence on Hand

- Functional MVP with workspaces, tasks (Eisenhower quadrants), calendar, and stats views.
- Real codebase with React + TypeScript + Tailwind CSS.
- No real user data, testimonials, or press.

## Product Principles

1. **Quadrant-first:** Every task lives in a quadrant; that is the primary organizational axis.
2. **Frictionless capture:** Adding a task should take seconds; sorting it into a quadrant is the main cognitive act.
3. **Workspace-aware:** The app adapts to the workspace type (personal vs. collaborative) without overwhelming individual users with team features.
4. **Open by default:** Open source from the start. The core stays free forever; paid plans lift limits, not features that gate core task organization.

## Accessibility & Inclusion

No specific standard committed yet.
