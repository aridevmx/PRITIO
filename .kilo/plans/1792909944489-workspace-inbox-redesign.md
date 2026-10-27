# Workspace Switching, Mi Día Schedule & Inbox Redesign

## Overview
This plan covers three major changes:
1. **Workspace Switcher**: Navigate to global Inbox (`/inbox`) on workspace change
2. **Mi Día Schedule**: Add configurable "start of day" and "reset time" settings per workspace
3. **Inbox Redesign**: Gmail-like interface with custom filter builder, Plan/Board views inside Inbox, and separate List view tab

---

## 1. Workspace Switcher → Navigate to Inbox

### Current Behavior
- `WorkspaceSwitcher.tsx` calls `switchWorkspace(id)` which only updates `currentWorkspace` in context
- No navigation occurs; user stays on current view

### Required Changes
**File: `src/components/layout/WorkspaceSwitcher.tsx`**
- Import `useNavigate` from `react-router-dom`
- In `handleSelect`, after `switchWorkspace(id)`, call `navigate("/inbox")`
- Pass `navigate` via props or use hook directly

**File: `src/features/workspaces/WorkspaceProvider.tsx`**
- `switchWorkspace` already persists `pritio-workspace-id` to localStorage ✓
- No changes needed here

**Verification**: After switching workspace, URL becomes `/inbox` and InboxView loads tasks for the new workspace

---

## 2. Mi Día Schedule Configuration

### Requirements
- **Start of day time**: When "Mi día" day begins (for suggestions, planning)
- **Reset/clear time**: When "Mi día" tasks are cleared (currently hardcoded midnight)
- Per-workspace configuration
- Stored in database (workspace settings) with localStorage fallback

### Data Model
**New table: `workspace_settings`** (or extend existing workspace metadata)
```sql
-- Add to workspace table or create settings table
my_day_start_time   TIME WITHOUT TIME ZONE DEFAULT '06:00'  -- configurable
my_day_reset_time   TIME WITHOUT TIME ZONE DEFAULT '00:00'  -- configurable
my_day_timezone     TEXT DEFAULT 'America/Mexico_City'      -- for future
```

### Files to Create/Modify

**New: `src/features/home/miDiaSettings.ts`**
- Types: `MiDiaSchedule { startTime: string; resetTime: string; timezone: string }`
- API: `fetchMiDiaSettings(workspaceId)`, `updateMiDiaSettings(workspaceId, settings)`
- Default: startTime="06:00", resetTime="00:00"

**Modify: `src/features/home/MiDiaView.tsx`**
- Replace hardcoded `todayStr()` with timezone-aware date based on `resetTime`
- Use `startTime` for "day begins" logic in suggestions
- Load settings on mount

**New: `src/features/home/MiDiaScheduleSettings.tsx`** (UI component)
- Time pickers for start/reset time
- Integrated into WorkspaceSettingsModal or PreferencesTab

**Modify: `src/components/layout/WorkspaceSettingsModal.tsx`**
- Add Mi Día schedule section

### Logic Changes
- **Day boundary**: A task belongs to "today" if its `myDayDate` >= resetTime of current day AND < resetTime of next day
- **Suggestions**: Show tasks due on or after `startTime` of current day
- **Timezone**: Use workspace timezone or user profile timezone

---

## 3. Inbox Redesign (Gmail-like)

### Architecture Decision
- **Plan & Board**: Tabs *inside* Inbox view (not global views, not workspace-scoped)
- **List view**: New global view tab `/inbox/lista` (separate from `/inbox`)
- **Filters**: Custom filter builder (Gmail-style "Create filter" rules)

### 3.1 New Global View: Inbox List
**File: `src/components/layout/globalNav.tsx`**
- Add `"inbox-lista"` to `GlobalViewKey`
- Add entry to `GLOBAL_VIEWS` with path `/inbox/lista`, label "Lista", icon `List`

**File: `src/components/layout/AppShell.tsx`**
- Add case for `"inbox-lista"` in `renderMain()` → render `<InboxListView />`

**New: `src/features/inbox/InboxListView.tsx`**
- Gmail-style list: columns (checkbox, star/priority, sender/workspace, subject/title, labels/tags, date, size/attachments)
- Virtualized list for performance
- Full-width content area
- Keyboard navigation (j/k, x, e, #, etc.)

### 3.2 InboxView Redesign (Current `/inbox`)

**File: `src/features/inbox/InboxView.tsx`** - Major refactor

#### New State Structure
```typescript
type InboxViewMode = 'agrupado' | 'plan' | 'kanban' | 'lista'; // 'lista' redirects to /inbox/lista
type FilterRule = {
  id: string;
  name: string;
  conditions: FilterCondition[];
  actions: FilterAction[];
};
type FilterCondition = 
  | { type: 'quadrant'; value: Quadrant }
  | { type: 'tag'; value: string; operator: 'has' | 'hasNot' }
  | { type: 'overdue'; value: boolean }
  | { type: 'dateRange'; field: 'dueDate' | 'startDate' | 'createdAt'; start: string; end: string }
  | { type: 'workspace'; value: string }
  | { type: 'project'; value: string }
  | { type: 'custom'; field: string; operator: string; value: unknown };
type FilterAction = 
  | { type: 'label'; labelIds: string[] }
  | { type: 'moveToQuadrant'; quadrant: Quadrant }
  | { type: 'addToMyDay' }
  | { type: 'archive' };
```

#### UI Components (New)
- **FilterBar**: Search input + filter chips + "Create filter" button
- **FilterBuilderModal**: Visual rule builder (if/then)
- **SavedFiltersSidebar**: List of user-created filters (like Gmail labels)
- **ViewTabs**: [Agrupado] [Plan] [Tablero] (Lista is separate global view)
- **FullWidthContainer**: Remove `max-w-3xl` constraint

#### Plan View (inside Inbox)
- Week planner grid (Mon-Sun columns)
- Drag tasks from Inbox list to day columns
- **Automation toggle**: "Auto-add to Mi día when dragging to today"
- Show meetings/events alongside tasks

#### Board View (inside Inbox)
- Kanban columns: Backlog → Por hacer → En progreso → Hecho
- Group by: Quadrant / Project / Workspace (selector)
- Drag between columns updates quadrant/status

#### Agrupado View (Current improved)
- Keep existing grouping (workspace/cuadrante/proyecto/lista)
- Add: Group by Tag, Group by Date (Hoy, Mañana, Esta semana, Sin fecha)
- Collapsible groups with counts

### 3.3 Filter Persistence
- Save custom filters to `user_filters` table (per user, optionally per workspace)
- Sync via Supabase realtime
- Default filters: "Vencidas", "Hoy", "Sin cuadrante", "Mi día", "Por workspace"

### 3.4 Settings Integration
**File: `src/features/account/PreferencesTab.tsx`**
- Add toggles for "Mostrar Plan en Inbox" and "Mostrar Tablero en Inbox"
- Store in `viewPrefs` (extend `HIDEABLE_VIEWS` or new key)

---

## Implementation Order

### Phase 1: Workspace Switcher + Mi Día Schedule (Foundation)
1. Add `workspace_settings` table migration
2. Create `miDiaSettings.ts` API
3. Update `WorkspaceSwitcher.tsx` → navigate to `/inbox`
4. Update `MiDiaView.tsx` to use configurable times
5. Add Mi Día schedule UI to `WorkspaceSettingsModal.tsx`

### Phase 2: Inbox Core Redesign
1. Add `inbox-lista` global view + `InboxListView.tsx`
2. Refactor `InboxView.tsx`:
   - New view mode state (agrupado/plan/kanban)
   - Full-width layout
   - Filter bar with search + chips
3. Implement Plan view component
4. Implement Board view component
5. Add view toggles to PreferencesTab

### Phase 3: Custom Filter Builder
1. Create `user_filters` table migration
2. Build `FilterBuilderModal` + `SavedFiltersSidebar`
3. Integrate filter engine in `InboxView.tsx`/`InboxListView.tsx`
4. Add default filters

---

## Database Migrations Needed

```sql
-- 1. workspace_settings (or add columns to workspaces)
ALTER TABLE workspaces ADD COLUMN my_day_start_time TIME WITHOUT TIME ZONE DEFAULT '06:00';
ALTER TABLE workspaces ADD COLUMN my_day_reset_time TIME WITHOUT TIME ZONE DEFAULT '00:00';
ALTER TABLE workspaces ADD COLUMN my_day_timezone TEXT DEFAULT 'America/Mexico_City';

-- 2. user_filters (for custom Gmail-like filters)
CREATE TABLE user_filters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL, -- null = global
  name TEXT NOT NULL,
  conditions JSONB NOT NULL DEFAULT '[]',
  actions JSONB NOT NULL DEFAULT '[]',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Enable RLS
ALTER TABLE user_filters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own filters" ON user_filters FOR ALL USING (auth.uid() = user_id);
```

---

## Edge Cases & Validation

| Scenario | Handling |
|----------|----------|
| User switches workspace while in `/inbox/lista` | Redirect to `/inbox` (standard inbox) |
| Mi día reset time > start time (e.g., reset 23:00, start 06:00) | Valid - day spans midnight; validate in UI |
| No workspace selected | Show empty state with "Select workspace" CTA |
| Filter matches 10k+ tasks | Paginate/virtualize; show count badge |
| Plan view on mobile | Horizontal scroll or stacked day cards |
| Board view column overflow | Horizontal scroll with sticky first column |

---

## Testing Checklist

- [ ] Workspace switch from Personal → Familia navigates to `/inbox`
- [ ] Inbox shows only Familia workspace tasks after switch
- [ ] Mi día start time 07:00 → suggestions show tasks from 07:00
- [ ] Mi día reset time 03:00 → tasks clear at 03:00 not 00:00
- [ ] Inbox Plan tab shows week grid, drag to day works
- [ ] Inbox Board tab shows Kanban, drag updates quadrant
- [ ] Custom filter "Quadrant=Importante + Tag=Urgente → Add to Mi día" works
- [ ] Inbox List view (`/inbox/lista`) renders Gmail-style table
- [ ] Preferences toggles hide/show Plan/Board tabs in Inbox
- [ ] Full-width layout used (no `max-w-3xl` constraint)

---

## Out of Scope (Future)
- AI-powered filter suggestions
- Filter import/export
- Shared filters across team workspaces
- Inbox zero celebration animation
- Smart "snooze until" from filter actions