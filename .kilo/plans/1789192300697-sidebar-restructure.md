# Plan: Reestructuración del Sidebar

## Objetivo
Transformar el sidebar en una lista plana de navegación principal, moviendo el selector de espacios al header/navbar.

## Estructura final del Sidebar

```
┌─────────────────────────────────┐
│  ⚡ Crear Tarea (Cmd+K)         │  ← Botón comando prominente
├─────────────────────────────────┤
│  📥 Inbox                       │  ← Vista global existente
│  📅 Mi día                      │  ← Vista global existente
│  ⬜ Cuadrantes                   │  ← Vista agregada (todos espacios)
│  📆 Calendario                   │  ← Vista agregada (todos espacios)
│  📁 Proyectos                    │  ← Nueva vista (ProjectsManager)
│  📝 Notas                        │  ← Documentos (vista docs agregada)
│  📊 Indicadores                  │  ← Vista agregada (todos espacios)
└─────────────────────────────────┘
```

## Cambios por archivo

### 1. `src/components/layout/Sidebar.tsx` - REESCRIBIR
- Eliminar secciones: "General", "Espacio activo", "Próximas juntas"
- Nueva estructura: lista plana de items de navegación
- Botón "Crear Tarea" al abrir `TaskFormDialog` (defaultQuadrant="do", defaultKind="task")
- Items navegan a rutas globales (sin prefijo de espacio)
- Mantener `WorkspaceSwitcher` solo si se usa en otro lado (probablemente no)

### 2. `src/components/layout/globalNav.ts` - ACTUALIZAR
```typescript
export type GlobalViewKey = 
  | "inbox" 
  | "mi-dia" 
  | "cuadrantes" 
  | "calendario" 
  | "proyectos" 
  | "docs" 
  | "indicadores";
```
- Agregar metadata para nuevos items (icon, accent colors, paths)
- `globalViewFromPath` y `globalViewPath` actualizados

### 3. `src/App.tsx` - NUEVAS RUTAS
```tsx
<Route path="proyectos" element={<AppShell />} />
<Route path="notas" element={<AppShell />} />
// Las vistas agregadas usan rutas globales nuevas
<Route path="cuadrantes" element={<AppShell />} />
<Route path="calendario" element={<AppShell />} />
<Route path="indicadores" element={<AppShell />} />
```

### 4. `src/components/layout/AppShell.tsx` - MODIFICAR
- Detectar nuevas vistas globales en `globalViewFromPath`
- En `renderMain()`: renderizar vistas agregadas cuando `isGlobal && globalView`
- Para vistas agregadas (cuadrantes, calendario, docs, indicadores):
  - Pasar `workspaceIds` array a `QuadrantsView` / `CalendarView` / `StatsView` / `DocsView`
  - Los componentes ya soportan `workspaceIds?: string[]` para multi-workspace

### 5. `src/components/layout/ViewTabs.tsx` - ELIMINAR O DEPRECAR
- Ya no se usa en sidebar (era para tabs dentro de espacio)
- Se usa en `SpaceView` para tabs internos de un espacio → **mantener para SpaceView**

### 5. Header/Navbar - NUEVO COMPONENTE o MODIFICAR `AppShell.tsx` header
- Agregar selector de workspace/espacio en el header (donde está el nombre del workspace)
- Dropdown con: workspace actual + espacios disponibles + "Gestionar workspaces"
- Mover lógica de `WorkspaceSwitcher` aquí

### 6. Vistas Agregadas - VERIFICAR SOPORTE MULTI-WORKSPACE
- `QuadrantsView` ✅ ya acepta `workspaceIds?: string[]`
- `StatsView` - verificar si acepta multi-workspace
- `DocsView` - verificar
- `CalendarView` (en RightWidgetPanel) - verificar

### 7. `src/features/spaces/SpaceView.tsx` - SIN CAMBIOS
- Sigue funcionando para vistas dentro de un espacio específico (`/personal/cuadrantes`, etc.)
- Los tabs internos (ViewTabs) se mantienen

## Rutas finales

| Ruta | Tipo | Descripción |
|------|------|-------------|
| `/` | Global | Inicio (¿eliminar? usuario dijo eliminar) |
| `/inbox` | Global | Inbox |
| `/mi-dia` | Global | Mi día |
| `/cuadrantes` | Global | Cuadrantes agregado (todos espacios) |
| `/calendario` | Global | Calendario agregado |
| `/proyectos` | Global | Proyectos (ProjectsManager) |
| `/notas` | Global | Documentos agregado |
| `/indicadores` | Global | Stats agregado |
| `/:space/:view?` | Espacio | Vistas dentro de espacio (existente) |

## Consideraciones técnicas

### Datos agregados
- `useTasks` ya soporta `workspaceIds` array para multi-workspace
- `QuadrantsView` pasa `workspaceIds` a `useTasks`
- `fetchSubtaskCounts` ya acepta `workspaceIds[]`
- Realtime: suscribirse a múltiples workspaces o usar canal por workspace

### Permisos y billing
- `hasFeature("plan_view")`, `hasFeature("board_view")` - evaluar a nivel workspace
- Límites de tareas activas: sumar across workspaces

### Atajo "Crear Tarea"
- Global shortcut `Cmd/Ctrl+K` → abre `TaskFormDialog`
- En sidebar: botón prominente que hace lo mismo
- `defaultQuadrant="do"`, `defaultKind="task"`, `inboxed=false`

## Archivos a modificar

1. `src/components/layout/Sidebar.tsx` - **Reescribir completamente**
2. `src/components/layout/globalNav.ts` - **Actualizar tipos y metadata**
3. `src/App.tsx` - **Agregar rutas globales nuevas**
4. `src/components/layout/AppShell.tsx` - **Manejar nuevas vistas globales + header con selector workspace**
5. `src/components/layout/ViewTabs.tsx` - **Mantener (para SpaceView interno)**
6. `src/features/spaces/SpaceView.tsx` - **Sin cambios**

## Archivos a crear

1. `src/components/layout/WorkspaceSelector.tsx` - Selector de workspace/espacio para header
2. `src/features/projects/ProjectsView.tsx` - Wrapper para ProjectsManager como vista global
3. `src/features/docs/DocsGlobalView.tsx` - Wrapper para DocsView agregado (si no existe)

## Validación

- [ ] Sidebar muestra lista plana correcta
- [ ] Navegación funciona: click → cambia URL → renderiza vista correcta
- [ ] Vistas agregadas muestran datos de TODOS los espacios del workspace actual
- [ ] Selector de workspace en header funciona
- [ ] Atajo Cmd+K abre formulario de tarea
- [ ] Botón "Crear Tarea" en sidebar abre formulario
- [ ] Rutas de espacio (`/personal/cuadrantes`) siguen funcionando
- [ ] Responsive: sidebar colapsable en móvil funciona